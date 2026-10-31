/*
 * core.c —— libretro 核心实现（v0.13：逐像素快路径 + 无头渲染裁剪）
 *
 * 两种内容都能直接加载：
 *   .png  MakeCode Arcade 卡带 —— 卡带里是 TypeScript 工程，由内嵌的官方 pxt 编译器
 *         当场编译成 binary.js（首次 5~6 秒；产物按「源码 + 编译器指纹」缓存到存档目录，
 *         第二次开始 0.4 秒；核心选项 Compile Cache 可关）
 *   .js   已经是编译产物 binary.js —— 直接用，零开销
 *
 * 运行模型：binary.js -> QuickJS 里跑 官方 pxtsim+common-sim+sim（src/pxt_bundle.h）
 *   + runtime/glue.js -> 每帧 arcade_step() 推进虚拟定时器一轮 -> arcade_rgba()
 *   -> 160x120 XRGB8888 -> 前端
 *
 * 不做硬件模拟：游戏跑的是 pxtc 编译产物 + 官方 JavaScript sim（与 makecode.com
 * 在浏览器里跑的是同一份运行时代码），而不是 v0.8 的行为兼容层。
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdarg.h>
#include <math.h>
#include <time.h>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#endif

#include "libretro.h"
#include "quickjs.h"
#include "pxt_bundle.h"
#include "cart.h"
#include "compiler.h"
#include "cache.h"

/* Windows 的 DLL 不会自动导出符号，必须显式 dllexport（Linux -shared 默认全导出） */
#ifdef _WIN32
#define EXPORT __declspec(dllexport)
#else
#define EXPORT
#endif

#define SCREEN_W 160
#define SCREEN_H 120
#define AUDIO_HZ 44100
#define FRAME_MS (1000.0 / 60.0)

static retro_log_printf_t log_cb;
static retro_video_refresh_t video_cb;
static retro_audio_sample_t audio_sample_cb;
static retro_audio_sample_batch_t audio_batch_cb;
static retro_input_poll_t input_poll_cb;
static retro_input_state_t input_state_cb;

/* 输入相关状态。前端的 Controls 菜单要靠这些声明才知道该怎么显示/给什么改。 */
static bool g_bitmask_supported = false;   /* 前端支持位掩码轮询 */
static bool g_ab_swap = false;             /* 核心选项：交换 A/B */
static bool g_compile_cache = true;        /* 核心选项：编译缓存 */
static unsigned g_port_device = RETRO_DEVICE_JOYPAD;
static int g_select_state = 0;    /* SELECT 上一帧状态，用于边沿检测 */
static int g_pending_reset = 0;   /* 本帧需要重启游戏（真机 RESET 键的等价物） */
static retro_environment_t environ_cb;

static void arc_log(const char *fmt, ...)
{
    char buf[512];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    if (log_cb) log_cb(RETRO_LOG_INFO, "[arcade] %s\n", buf);
    else fprintf(stderr, "[arcade] %s\n", buf);
}

/* ---------------- 性能统计 ----------------
 *
 * 核心选项 Performance Stats 打开后，每 120 帧往日志里打一行平均耗时：
 *   perf: step 8.2ms present 1.4ms audio 0.9ms total 10.5ms (budget 16.7)
 * step 是游戏逻辑（JS），present 是取画面+转像素，audio 是合成音频。
 * 设备上跑不动时先看这个，能立刻分清是 JS 太慢还是贴图/音频拖后腿。
 */
static int g_perf_on;
static double g_perf_step, g_perf_present, g_perf_audio;
static int g_perf_frames;

static double perf_now_ms(void)
{
#ifdef _WIN32
    static LARGE_INTEGER freq;
    LARGE_INTEGER c;
    if (!freq.QuadPart) QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&c);
    return (double)c.QuadPart * 1000.0 / (double)freq.QuadPart;
#else
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (double)ts.tv_sec * 1000.0 + (double)ts.tv_nsec / 1e6;
#endif
}

static void perf_flush(void)
{
    if (g_perf_frames <= 0) return;
    double n = (double)g_perf_frames;
    arc_log("perf: step %.1fms present %.1fms audio %.1fms total %.1fms (budget 16.7)",
            g_perf_step / n, g_perf_present / n, g_perf_audio / n,
            (g_perf_step + g_perf_present + g_perf_audio) / n);
    g_perf_step = g_perf_present = g_perf_audio = 0;
    g_perf_frames = 0;
}

/* ---------------- 状态 ---------------- */

static JSRuntime *js_rt;
static JSContext *js_ctx;
static JSValue fn_boot, fn_step, fn_rgba, fn_button, fn_audio, fn_fb;
static char *g_source;   /* binary.js 全文（NUL 结尾） */
static uint32_t *g_fb;
static int g_loaded;

typedef struct { const char *name; unsigned id; int state; } button_t;
static button_t g_buttons[] = {
    { "left",  RETRO_DEVICE_ID_JOYPAD_LEFT,  0 },
    { "right", RETRO_DEVICE_ID_JOYPAD_RIGHT, 0 },
    { "up",    RETRO_DEVICE_ID_JOYPAD_UP,    0 },
    { "down",  RETRO_DEVICE_ID_JOYPAD_DOWN,  0 },
    { "A",     RETRO_DEVICE_ID_JOYPAD_A,     0 },
    { "B",     RETRO_DEVICE_ID_JOYPAD_B,     0 },
    { "menu",  RETRO_DEVICE_ID_JOYPAD_START, 0 },
};
#define NBUTTONS ((int)(sizeof(g_buttons) / sizeof(g_buttons[0])))

/* ---------------- 音频：方波音源 ---------------- */

typedef struct { double freq; long samples; int amp; } tone_t;
#define MAX_TONES 8
static tone_t g_tones[MAX_TONES];
static int g_ntones;
static double g_phase;
static int16_t g_audio[AUDIO_HZ / 30 * 2 + 8];

/* 音量 0..255 -> 方波幅度。用平方根曲线：真机默认 20 也能听见，
   拉到 255 又不会削顶（12k 留了余量）。0 就是静音。 */
static int volume_to_amp(int vol)
{
    if (vol <= 0) return 0;
    if (vol > 255) vol = 255;
    return (int)(12000.0 * sqrt((double)vol / 255.0));
}

static void tone_push(double freq, int ms, int vol)
{
    if (g_ntones >= MAX_TONES) {
        memmove(g_tones, g_tones + 1, sizeof(tone_t) * (MAX_TONES - 1));
        g_ntones = MAX_TONES - 1;
    }
    g_tones[g_ntones].freq = freq;
    g_tones[g_ntones].samples = (long)((double)ms * AUDIO_HZ / 1000.0);
    g_tones[g_ntones].amp = volume_to_amp(vol);
    g_ntones++;
}

static int audio_render(int max_frames)
{
    int frames = 0;
    for (; frames < max_frames; frames++) {
        int16_t s = 0;
        if (g_ntones > 0 && g_tones[0].samples > 0) {
            double f = g_tones[0].freq;
            g_phase += f / AUDIO_HZ;
            if (g_phase >= 1.0) g_phase -= 1.0;
            s = (int16_t)((g_phase < 0.5) ? g_tones[0].amp : -g_tones[0].amp);
            if (--g_tones[0].samples <= 0) {
                memmove(g_tones, g_tones + 1, sizeof(tone_t) * (size_t)(g_ntones - 1));
                g_ntones--;
                g_phase = 0;
            }
        }
        g_audio[frames * 2] = s;
        g_audio[frames * 2 + 1] = s;
    }
    return frames;
}

/* ---------------- JS 原生回调 ---------------- */

static double now_ms(void);   /* 定义在下面（性能统计那段） */

/* ARCADE_LEGACY_PRESENT=1 时退回 v0.12 的取帧/渲染路径，用来逐字节对比输出 */
static int legacy_present(void)
{
    static int v = -1;
    if (v < 0) v = getenv("ARCADE_LEGACY_PRESENT") ? 1 : 0;
    return v;
}

static JSValue js_native_log(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    const char *lvl = argc > 0 ? JS_ToCString(ctx, argv[0]) : NULL;
    const char *msg = argc > 1 ? JS_ToCString(ctx, argv[1]) : NULL;
    if (msg) arc_log("[%s] %s", lvl ? lvl : "js", msg);
    if (lvl) JS_FreeCString(ctx, lvl);
    if (msg) JS_FreeCString(ctx, msg);
    return JS_UNDEFINED;
}

static JSValue js_native_now(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)ctx; (void)this_val; (void)argc; (void)argv;
    /* 微秒级时钟：Date.now 只有毫秒，量不出单次绘制/单帧里的小项 */
    return JS_NewFloat64(js_ctx, now_ms() * 1000.0);
}

static JSValue js_native_tone(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int32_t freq = 440, ms = 100, vol = 255;
    if (argc > 0) JS_ToInt32(ctx, &freq, argv[0]);
    if (argc > 1) JS_ToInt32(ctx, &ms, argv[1]);
    if (argc > 2) JS_ToInt32(ctx, &vol, argv[2]);
    if (freq > 20 && freq < 20000 && ms > 0 && ms < 5000) tone_push((double)freq, ms, vol);
    return JS_UNDEFINED;
}

static JSValue js_native_stop_audio(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)ctx; (void)this_val; (void)argc; (void)argv;
    g_ntones = 0;
    return JS_UNDEFINED;
}

/* ---------------- 初始化 ---------------- */

static int js_boot_impl(const char *source)
{
    JSValue arg = JS_NewString(js_ctx, source);
    JSValue ret = JS_Call(js_ctx, fn_boot, JS_UNDEFINED, 1, &arg);
    JS_FreeValue(js_ctx, arg);
    int ok = 1;
    if (JS_IsException(ret)) {
        JSValue exc = JS_GetException(js_ctx);
        const char *m = JS_ToCString(js_ctx, exc);
        arc_log("boot exception: %s", m ? m : "?");
        if (m) JS_FreeCString(js_ctx, m);
        JS_FreeValue(js_ctx, exc);
        ok = 0;
    } else {
        const char *err = JS_ToCString(js_ctx, ret);
        if (err && err[0]) {
            arc_log("boot failed: %s", err);
            ok = 0;
        }
        if (err) JS_FreeCString(js_ctx, err);
    }
    JS_FreeValue(js_ctx, ret);
    if (ok) {
        /* 自检/基准用：把 pxt 的虚拟时钟钉成固定步长（设备上不设，走真实时间）。
           墙钟驱动时 JS 慢一点 dt 就变大、pxt 追帧，每帧工作量会漂，耗时没可比性。 */
        const char *fd = getenv("ARCADE_FIXED_DT");
        if (fd && *fd) {
            JSValue g = JS_GetGlobalObject(js_ctx);
            JSValue f = JS_GetPropertyStr(js_ctx, g, "__setFixedStep");
            if (JS_IsFunction(js_ctx, f)) {
                JSValue a = JS_NewInt32(js_ctx, atoi(fd));
                JSValue r = JS_Call(js_ctx, f, JS_UNDEFINED, 1, &a);
                JS_FreeValue(js_ctx, r);
                JS_FreeValue(js_ctx, a);
            }
            JS_FreeValue(js_ctx, f);
            JS_FreeValue(js_ctx, g);
        }
    }
    return ok;
}

static int js_init(void)
{
    js_rt = JS_NewRuntime();
    if (!js_rt) return 0;
    /* 官方 sim + pxtc 产物（2MB+ 源码）+ 游戏运行堆，比 v0.8 需要更多 */
    JS_SetMemoryLimit(js_rt, 192u << 20);
    /* CPS 转换后的游戏代码递归较深，qjs_perf 验证用 4MB 栈 */
    JS_SetMaxStackSize(js_rt, 4u << 20);
    /* GC 阈值可调（ARCADE_GC_KB，0/未设为 QuickJS 默认）。低端设备上默认阈值
       偏小，堆一涨就回收，可以适当地抬高，由内存上限兜底。 */
    {
        const char *gck = getenv("ARCADE_GC_KB");
        if (gck && atoi(gck) > 0) JS_SetGCThreshold(js_rt, (size_t)atoi(gck) << 10);
    }
    js_ctx = JS_NewContext(js_rt);
    if (!js_ctx) return 0;

    JSValue global = JS_GetGlobalObject(js_ctx);
    JS_SetPropertyStr(js_ctx, global, "__native_log",
                      JS_NewCFunction(js_ctx, js_native_log, "__native_log", 2));
    JS_SetPropertyStr(js_ctx, global, "__native_now",
                      JS_NewCFunction(js_ctx, js_native_now, "__native_now", 0));
    JS_SetPropertyStr(js_ctx, global, "__native_tone",
                      JS_NewCFunction(js_ctx, js_native_tone, "__native_tone", 2));
    JS_SetPropertyStr(js_ctx, global, "__native_stop_audio",
                      JS_NewCFunction(js_ctx, js_native_stop_audio, "__native_stop_audio", 0));
    /* A/B 开关：关掉 sim 的逐像素快路径，量基线用（设备排查也能用） */
    if (getenv("ARCADE_NO_FASTOPS"))
        JS_SetPropertyStr(js_ctx, global, "__arcade_noFastOps", JS_NewBool(js_ctx, 1));
    if (legacy_present())
        JS_SetPropertyStr(js_ctx, global, "__arcade_legacy", JS_NewBool(js_ctx, 1));
    if (getenv("ARCADE_JS_PROFILE"))
        JS_SetPropertyStr(js_ctx, global, "__arcade_jsprof", JS_NewBool(js_ctx, 1));
    JS_FreeValue(js_ctx, global);

    JSValue r = JS_Eval(js_ctx, (const char *)pxt_bundle, pxt_bundle_len, "pxt_bundle.js", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(r)) {
        JSValue exc = JS_GetException(js_ctx);
        const char *m = JS_ToCString(js_ctx, exc);
        arc_log("bundle eval failed: %s", m ? m : "?");
        if (m) JS_FreeCString(js_ctx, m);
        JS_FreeValue(js_ctx, exc);
        JS_FreeValue(js_ctx, r);
        return 0;
    }
    JS_FreeValue(js_ctx, r);

    JSValue g2 = JS_GetGlobalObject(js_ctx);
    fn_boot = JS_GetPropertyStr(js_ctx, g2, "arcade_boot");
    fn_step = JS_GetPropertyStr(js_ctx, g2, "arcade_step");
    fn_rgba = JS_GetPropertyStr(js_ctx, g2, "arcade_rgba");
    fn_button = JS_GetPropertyStr(js_ctx, g2, "arcade_set_button");
    fn_audio = JS_GetPropertyStr(js_ctx, g2, "arcade_audio");
    fn_fb = JS_GetPropertyStr(js_ctx, g2, "arcade_fb32");
    JS_FreeValue(js_ctx, g2);

    if (!JS_IsFunction(js_ctx, fn_boot) || !JS_IsFunction(js_ctx, fn_step) || !JS_IsFunction(js_ctx, fn_rgba)) {
        arc_log("bundle did not export the expected entry points");
        return 0;
    }
    return 1;
}

static void js_shutdown(void)
{
    if (js_ctx) {
        JS_FreeValue(js_ctx, fn_boot);
        JS_FreeValue(js_ctx, fn_step);
        JS_FreeValue(js_ctx, fn_rgba);
        JS_FreeValue(js_ctx, fn_button);
        JS_FreeValue(js_ctx, fn_audio);
        JS_FreeValue(js_ctx, fn_fb);
        JS_FreeContext(js_ctx);
        js_ctx = NULL;
    }
    if (js_rt) {
        JS_FreeRuntime(js_rt);
        js_rt = NULL;
    }
}

/* ---------------- libretro 接口 ---------------- */

EXPORT void retro_init(void)
{
    g_fb = (uint32_t *)calloc(SCREEN_W * SCREEN_H, sizeof(uint32_t));
}

EXPORT void retro_deinit(void)
{
    free(g_fb);
    g_fb = NULL;
}

EXPORT unsigned retro_api_version(void) { return RETRO_API_VERSION; }

EXPORT void retro_set_environment(retro_environment_t cb)
{
    environ_cb = cb;
    if (!cb)
        return;

    /* 核心选项。注意选项值里只能用 ASCII，前端字体不一定有中文字形。 */
    static struct retro_variable vars[] = {
        { "arcade_ab_swap",
          "Swap A/B Buttons; disabled|enabled" },
        { "arcade_compile_cache",
          "Compile Cache (png carts, ~5s saved); enabled|disabled" },
        { "arcade_perf",
          "Performance Stats (log every 2s); disabled|enabled" },
        { NULL, NULL }
    };
    cb(RETRO_ENVIRONMENT_SET_VARIABLES, (void *)vars);
}

EXPORT void retro_set_video_refresh(retro_video_refresh_t cb) { video_cb = cb; }
EXPORT void retro_set_audio_sample(retro_audio_sample_t cb) { audio_sample_cb = cb; }
EXPORT void retro_set_audio_sample_batch(retro_audio_sample_batch_t cb) { audio_batch_cb = cb; }
EXPORT void retro_set_input_poll(retro_input_poll_t cb) { input_poll_cb = cb; }
EXPORT void retro_set_input_state(retro_input_state_t cb) { input_state_cb = cb; }

/* 读核心选项。前端改了选项后要重新读一次，见 retro_run 里的 GET_VARIABLE_UPDATE。 */
static void read_options(void)
{
    struct retro_variable v;
    g_ab_swap = false;
    g_compile_cache = true;
    if (!environ_cb)
        return;
    v.key = "arcade_ab_swap";
    v.value = NULL;
    if (environ_cb(RETRO_ENVIRONMENT_GET_VARIABLE, &v) && v.value)
        g_ab_swap = (strcmp(v.value, "enabled") == 0);
    v.key = "arcade_compile_cache";
    v.value = NULL;
    if (environ_cb(RETRO_ENVIRONMENT_GET_VARIABLE, &v) && v.value)
        g_compile_cache = (strcmp(v.value, "enabled") == 0);
    v.key = "arcade_perf";
    v.value = NULL;
    if (environ_cb(RETRO_ENVIRONMENT_GET_VARIABLE, &v) && v.value)
        g_perf_on = (strcmp(v.value, "enabled") == 0);
}

/*
 * 编译缓存目录。
 *
 * 放前端的存档目录下（RetroArch 是 saves/<核心名>/），跟着便携包和云同步走，
 * 不往系统目录里塞东西。ARCADE_CACHE_DIR 可以覆盖，自检和调试用。
 */
static const char *cache_dir(void)
{
    static char dir[1024];
    const char *env = getenv("ARCADE_CACHE_DIR");
    const char *base = NULL;

    if (env && env[0]) {
        snprintf(dir, sizeof(dir), "%s", env);
        return dir;
    }
    if (environ_cb && environ_cb(RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY, &base) && base && base[0]) {
        snprintf(dir, sizeof(dir), "%s/compile-cache", base);
        return dir;
    }
    return NULL;
}

/*
 * 声明输入描述符。没有这一步，RetroArch 的 Quick Menu -> Controls 里只能显示
 * libretro 的通用名字（B / Y / Select / Start / Up ...），玩家根本不知道哪个键
 * 在游戏里对应 MakeCode 的 A、B、方向、菜单。
 * 描述里写成「物理键 -> 游戏内功能」，A/B 交换后标签也跟着换。
 */
static void set_input_descriptors(void)
{
    /* 8 条描述 + 1 条结尾，数组必须留 9 格：之前写成 [8]，
       最后那条 terminator 写到了数组外面，踩掉了后面的静态变量
       （表现就是 video_cb 变成 NULL、画面永远出不来）。 */
    static struct retro_input_descriptor d[9];

    if (!environ_cb)
        return;
    memset(d, 0, sizeof(d));

    int n = 0;
    unsigned a_id = g_ab_swap ? RETRO_DEVICE_ID_JOYPAD_B : RETRO_DEVICE_ID_JOYPAD_A;
    unsigned b_id = g_ab_swap ? RETRO_DEVICE_ID_JOYPAD_A : RETRO_DEVICE_ID_JOYPAD_B;

    d[n].id = a_id; d[n].description = g_ab_swap ? "B -> MakeCode A (Jump/OK)" : "A -> MakeCode A (Jump/OK)"; n++;
    d[n].id = b_id; d[n].description = g_ab_swap ? "A -> MakeCode B" : "B -> MakeCode B"; n++;
    d[n].id = RETRO_DEVICE_ID_JOYPAD_UP;    d[n].description = "D-Pad Up";    n++;
    d[n].id = RETRO_DEVICE_ID_JOYPAD_DOWN;  d[n].description = "D-Pad Down";  n++;
    d[n].id = RETRO_DEVICE_ID_JOYPAD_LEFT;  d[n].description = "D-Pad Left";  n++;
    d[n].id = RETRO_DEVICE_ID_JOYPAD_RIGHT; d[n].description = "D-Pad Right"; n++;
    d[n].id = RETRO_DEVICE_ID_JOYPAD_START;  d[n].description = "Start -> Menu"; n++;
    d[n].id = RETRO_DEVICE_ID_JOYPAD_SELECT; d[n].description = "Select -> Reset Game"; n++;
    /* 结尾项：id 与 description 都为 0/NULL */
    d[n].id = 0;
    d[n].description = NULL;

    for (int i = 0; i <= n; i++) {
        d[i].port = 0;
        d[i].device = RETRO_DEVICE_JOYPAD;
        d[i].index = 0;
    }
    environ_cb(RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS, d);
}

/* 声明 1 个端口、1 种设备（RetroPad）。Controls 里的 “Device Type” 由它决定。 */
static void set_controller_info(void)
{
    static struct retro_controller_description types[2];
    static struct retro_controller_info infos[1];

    if (!environ_cb)
        return;
    types[0].desc = "MakeCode Arcade Gamepad";
    types[0].id = RETRO_DEVICE_JOYPAD;
    types[1].desc = NULL;
    types[1].id = 0;
    infos[0].types = types;
    infos[0].num_types = 1;
    environ_cb(RETRO_ENVIRONMENT_SET_CONTROLLER_INFO, infos);
}

EXPORT void retro_get_system_info(struct retro_system_info *info)
{
    memset(info, 0, sizeof(*info));
    info->library_name = "MakeCode Arcade (official runtime)";
    info->library_version = "0.13";
    info->valid_extensions = "js|png";
    info->need_fullpath = false;
    info->block_extract = true;
}

EXPORT void retro_get_system_av_info(struct retro_system_av_info *info)
{
    memset(info, 0, sizeof(*info));
    info->geometry.base_width = SCREEN_W;
    info->geometry.base_height = SCREEN_H;
    info->geometry.max_width = SCREEN_W;
    info->geometry.max_height = SCREEN_H;
    info->geometry.aspect_ratio = 4.0f / 3.0f;
    info->timing.fps = 60.0;
    info->timing.sample_rate = AUDIO_HZ;
}

EXPORT void retro_set_controller_port_device(unsigned port, unsigned device)
{
    if (port != 0)
        return;
    g_port_device = device;
    arc_log("port 0 device -> %u (%s)", device,
            device == RETRO_DEVICE_JOYPAD ? "RetroPad" :
            device == RETRO_DEVICE_NONE   ? "none" : "other");
}

static void set_pixel_format(void)
{
    if (environ_cb) {
        enum retro_pixel_format fmt = RETRO_PIXEL_FORMAT_XRGB8888;
        if (!environ_cb(RETRO_ENVIRONMENT_SET_PIXEL_FORMAT, &fmt))
            arc_log("frontend rejected XRGB8888");
    }
}

/* ---------------- 内容识别 ---------------- */

static double now_ms(void)
{
    /* 以前用 clock()：Windows 上是墙钟，Linux 上却是 CPU 时间，日志里的
       "编译用时 X 秒" 在设备上会偏小。统一走单调墙钟。 */
    return perf_now_ms();
}

/* PNG 签名。卡带是标准 PNG（工程数据藏在像素低位），所以头 8 字节一定对得上。 */
static int looks_like_png(const unsigned char *d, size_t n)
{
    static const unsigned char sig[8] = { 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a };
    return n >= 8 && memcmp(d, sig, 8) == 0;
}

static void compile_log(const char *msg, void *ud)
{
    (void)ud;
    arc_log("%s", msg);
}

EXPORT bool retro_load_game(const struct retro_game_info *game)
{
    struct retro_log_callback log;
    if (environ_cb && environ_cb(RETRO_ENVIRONMENT_GET_LOG_INTERFACE, &log))
        log_cb = log.log;

    if (!game || !game->data || game->size == 0) {
        arc_log("no content data");
        return false;
    }
    set_pixel_format();

    /* 输入相关的声明要在前端环境就绪后发出去，Controls 菜单才拿得到。 */
    set_controller_info();
    read_options();
    set_input_descriptors();
    g_bitmask_supported = environ_cb &&
        environ_cb(RETRO_ENVIRONMENT_GET_INPUT_BITMASKS, NULL);
    arc_log("input: descriptors sent, bitmask=%d, ab_swap=%d",
            (int)g_bitmask_supported, (int)g_ab_swap);

    free(g_source);
    g_source = NULL;

    if (looks_like_png((const unsigned char *)game->data, game->size)) {
        /* ---- png 卡带：当场编译 ---- */
        cart_t cart;
        memset(&cart, 0, sizeof(cart));
        arc_log("PNG 卡带 %u 字节，正在取出工程", (unsigned)game->size);
        if (cart_load_png((const unsigned char *)game->data, game->size, &cart) != 0) {
            arc_log("卡带解析失败: %s", cart.error[0] ? cart.error : "未知原因");
            cart_free(&cart);
            return false;
        }
        arc_log("工程源码 %u 字节（%s）", (unsigned)cart.source_len,
                cart.source_is_json ? "文件表" : "裸 TS");

        if (!cart.source_is_json) {
            arc_log("这张卡带只有裸 TS 源码（缺少生成的资源文件），无法编译");
            cart_free(&cart);
            return false;
        }
        if (!compiler_is_embedded()) {
            arc_log("本构建没有内嵌编译器。请先在 PC 上转换："
                    "node tools/cart_build.js 游戏.png -o out/ ，再加载 out/游戏/binary.js");
            cart_free(&cart);
            return false;
        }

        char err[256] = { 0 };
        size_t js_len = 0;
        double t0 = now_ms();

        /*
         * 编译缓存。同一份工程编出来的 binary.js 是确定的，所以键只取
         * 「工程文件表 + 编译器指纹」：换卡带内容或换核心版本都不会错命中。
         */
        char ckey[17] = { 0 };
        const char *cdir = g_compile_cache ? cache_dir() : NULL;
        int hit = 0;

        if (cdir) {
            cache_key(cart.source, cart.source_len, compiler_build_id(), ckey);
            int cr = cache_load(cdir, ckey, compiler_build_id(), &g_source, &js_len);
            if (cr == 0) {
                hit = 1;
                arc_log("编译缓存命中：binary.js %u 字节（键 %s），省去一次编译",
                        (unsigned)js_len, ckey);
            } else if (cr < 0) {
                arc_log("编译缓存 %s 损坏或来自别的编译器，重新编译", ckey);
            }
        } else if (g_compile_cache) {
            arc_log("编译缓存已开启，但拿不到存档目录（可用环境变量 ARCADE_CACHE_DIR 指定），"
                    "本次不缓存");
        }

        if (!hit) {
            arc_log("开始编译（首次约 5~6 秒，编过的卡带下次直接读缓存）…");
            int rc = compiler_build(cart.source, cart.source_len, &g_source, &js_len,
                                    compile_log, NULL, err, sizeof(err));
            if (rc != 0) {
                arc_log("编译失败: %s", err[0] ? err : "未知错误");
                free(g_source);
                g_source = NULL;
                cart_free(&cart);
                return false;
            }
            arc_log("编译完成：binary.js %u 字节，用时 %.1f 秒",
                    (unsigned)js_len, (now_ms() - t0) / 1000.0);

            if (cdir) {
                if (cache_save(cdir, ckey, compiler_build_id(), g_source, js_len) == 0)
                    arc_log("已写入编译缓存（%s/%s.bin）", cdir, ckey);
                else
                    arc_log("编译缓存写入失败（%s，不影响游戏）", cdir);
            }
        }
        cart_free(&cart);
    } else {
        /* ---- 已经是编译产物 binary.js ---- */
        g_source = (char *)malloc(game->size + 1);
        if (!g_source) {
            arc_log("out of memory loading binary.js (%u bytes)", (unsigned)game->size);
            return false;
        }
        memcpy(g_source, game->data, game->size);
        g_source[game->size] = '\0';
        arc_log("binary.js = %u bytes", (unsigned)game->size);
    }

    if (!js_init()) {
        js_shutdown();
        free(g_source);
        g_source = NULL;
        return false;
    }
    if (!js_boot_impl(g_source)) {
        js_shutdown();
        free(g_source);
        g_source = NULL;
        return false;
    }
    g_loaded = 1;
    arc_log("game booted");
    return true;
}

EXPORT bool retro_load_game_special(unsigned type, const struct retro_game_info *info, size_t num)
{
    (void)type; (void)info; (void)num;
    return false;
}

EXPORT void retro_unload_game(void)
{
    js_shutdown();
    free(g_source);
    g_source = NULL;
    g_loaded = 0;
}

EXPORT void retro_reset(void)
{
    /* 官方 runtime 的状态没法干净复位，走完全重建：丢弃 VM、重新 eval bundle。 */
    if (g_source) {
        js_shutdown();
        if (js_init() && js_boot_impl(g_source)) {
            arc_log("game reset ok");
        } else {
            js_shutdown();
            g_loaded = 0;
            arc_log("game reset FAILED");
        }
    }
}

static void poll_input(void)
{
    if (!input_poll_cb || !input_state_cb || !js_ctx) return;
    input_poll_cb();

    /* 前端支持位掩码时一次查询就能拿到全部按键，省 7 次回调 */
    int mask = -1;
    if (g_bitmask_supported)
        mask = (int)input_state_cb(0, RETRO_DEVICE_JOYPAD, 0, RETRO_DEVICE_ID_JOYPAD_MASK);

    for (int i = 0; i < NBUTTONS; i++) {
        unsigned id = g_buttons[i].id;

        /* 核心选项：交换 A/B。改的是「物理键 -> 游戏内按钮」的对应关系，
           与前端映射无关，所以玩家在 RetroArch 里怎么绑都能用。 */
        if (g_ab_swap) {
            if (id == RETRO_DEVICE_ID_JOYPAD_A) id = RETRO_DEVICE_ID_JOYPAD_B;
            else if (id == RETRO_DEVICE_ID_JOYPAD_B) id = RETRO_DEVICE_ID_JOYPAD_A;
        }

        int down;
        if (mask >= 0)
            down = (mask >> id) & 1;
        else
            down = input_state_cb(0, RETRO_DEVICE_JOYPAD, 0, id) ? 1 : 0;

        if (down == g_buttons[i].state) continue;
        g_buttons[i].state = down;
        JSValue a = JS_NewString(js_ctx, g_buttons[i].name);
        JSValue b = JS_NewBool(js_ctx, down);
        JSValue r = JS_Call(js_ctx, fn_button, JS_UNDEFINED, 2, (JSValueConst[]){ a, b });
        JS_FreeValue(js_ctx, r);
        JS_FreeValue(js_ctx, a);
        JS_FreeValue(js_ctx, b);
    }

    /* SELECT = 真机 RESET：只在按下的那一下触发，按住不会反复重启 */
    {
        int sel;
        if (mask >= 0)
            sel = (mask >> RETRO_DEVICE_ID_JOYPAD_SELECT) & 1;
        else
            sel = input_state_cb(0, RETRO_DEVICE_JOYPAD, 0, RETRO_DEVICE_ID_JOYPAD_SELECT) ? 1 : 0;
        if (sel && !g_select_state)
            g_pending_reset = 1;
        g_select_state = sel;
    }
}

static void present_frame(void)
{
    /*
     * 快路径：直接取 pxt 的 uint32 屏缓冲（0xAABBGGRR，低字节 R），C 里一趟转
     * XRGB8888。旧路径要在 JS 里逐像素写 4 个 Uint8ClampedArray 元素（带钳位），
     * 19.2k 像素在低端 ARM 上每帧要十几毫秒 —— 这是设备掉帧的主因之一。
     */
    if (JS_IsFunction(js_ctx, fn_fb)) {
        JSValue t = JS_Call(js_ctx, fn_fb, JS_UNDEFINED, 0, NULL);
        if (JS_IsException(t)) {
            JS_FreeValue(js_ctx, JS_GetException(js_ctx));
        } else {
            size_t off = 0, blen = 0, bpe = 0;
            JSValue ab = JS_GetTypedArrayBuffer(js_ctx, t, &off, &blen, &bpe);
            if (!JS_IsException(ab)) {
                size_t ablen = 0;
                uint8_t *p = JS_GetArrayBuffer(js_ctx, &ablen, ab);
                if (p && blen >= (size_t)SCREEN_W * SCREEN_H * 4) {
                    const uint8_t *src = p + off;
                    for (int i = 0; i < SCREEN_W * SCREEN_H; i++) {
                        uint32_t v;
                        memcpy(&v, src + (size_t)i * 4, 4);   /* 避免未对齐访问 */
                        g_fb[i] = 0xff000000u | ((v & 0xffu) << 16) |
                                  (v & 0xff00u) | ((v >> 16) & 0xffu);
                    }
                    JS_FreeValue(js_ctx, ab);
                    JS_FreeValue(js_ctx, t);
                    if (video_cb) video_cb(g_fb, SCREEN_W, SCREEN_H, SCREEN_W * sizeof(uint32_t));
                    return;
                }
                JS_FreeValue(js_ctx, ab);
            } else {
                JS_FreeValue(js_ctx, JS_GetException(js_ctx));
            }
            JS_FreeValue(js_ctx, t);
        }
    }

    /* 兼容路径：老的 RGBA 转换（arcade_fb32 不可用时） */
    JSValue v = JS_Call(js_ctx, fn_rgba, JS_UNDEFINED, 0, NULL);
    if (JS_IsException(v)) {
        JSValue exc = JS_GetException(js_ctx);
        const char *m = JS_ToCString(js_ctx, exc);
        arc_log("rgba exception: %s", m ? m : "?");
        if (m) JS_FreeCString(js_ctx, m);
        JS_FreeValue(js_ctx, exc);
        JS_FreeValue(js_ctx, v);
        return;
    }

    size_t off = 0, blen = 0, bpe = 0;
    JSValue ab = JS_GetTypedArrayBuffer(js_ctx, v, &off, &blen, &bpe);
    if (JS_IsException(ab)) {
        JS_FreeValue(js_ctx, ab);
        JS_FreeValue(js_ctx, v);
        return;
    }
    size_t ablen = 0;
    uint8_t *p = JS_GetArrayBuffer(js_ctx, &ablen, ab);
    if (p && blen >= (size_t)SCREEN_W * SCREEN_H * 4) {
        const uint8_t *src = p + off;
        for (int i = 0; i < SCREEN_W * SCREEN_H; i++) {
            g_fb[i] = 0xff000000u | ((uint32_t)src[i * 4] << 16) |
                      ((uint32_t)src[i * 4 + 1] << 8) | (uint32_t)src[i * 4 + 2];
        }
    }
    JS_FreeValue(js_ctx, ab);
    JS_FreeValue(js_ctx, v);

    if (video_cb) video_cb(g_fb, SCREEN_W, SCREEN_H, SCREEN_W * sizeof(uint32_t));
}

/*
 * 音频：官方 sim 的音源（music.playTone / 旋律 / soundExpression）由 JS 侧
 * 离线渲染成 44.1kHz int16 单声道（pxt_audio.js），这里每帧拉一次并复制成立体声。
 * JS 侧没产出时（启动头几帧）补静音，保持音频流连续。
 */
static int pull_audio(int16_t *stereo, int max_frames)
{
    (void)audio_render;   /* v0.8 方波合成保留作参考，pxt 模式下不再使用 */
    if (JS_IsFunction(js_ctx, fn_audio)) {
        JSValue v = JS_Call(js_ctx, fn_audio, JS_UNDEFINED, 0, NULL);
        if (!JS_IsException(v)) {
            int n = 0;
            size_t off = 0, blen = 0, bpe = 0;
            JSValue ab = JS_GetTypedArrayBuffer(js_ctx, v, &off, &blen, &bpe);
            if (!JS_IsException(ab)) {
                size_t ablen = 0;
                uint8_t *p = JS_GetArrayBuffer(js_ctx, &ablen, ab);
                if (p && blen >= 2) {
                    n = (int)(blen / 2);
                    if (n > max_frames) n = max_frames;
                    /* Int16Array 数据在 p+off，按 2 字节对齐 */
                    const int16_t *src = (const int16_t *)(p + off);
                    for (int i = 0; i < n; i++) {
                        stereo[i * 2] = src[i];
                        stereo[i * 2 + 1] = src[i];
                    }
                }
                JS_FreeValue(js_ctx, ab);
            } else {
                JS_FreeValue(js_ctx, ab);
            }
            JS_FreeValue(js_ctx, v);
            return n;
        }
        JSValue exc = JS_GetException(js_ctx);
        const char *m = JS_ToCString(js_ctx, exc);
        arc_log("audio exception: %s", m ? m : "?");
        if (m) JS_FreeCString(js_ctx, m);
        JS_FreeValue(js_ctx, exc);
        JS_FreeValue(js_ctx, v);
    }
    return 0;
}

EXPORT void retro_run(void)
{
    if (!g_loaded || !js_ctx) return;

    /* 玩家在 快速菜单 -> 核心选项 里改了开关：重新读选项并刷新描述符标签 */
    bool updated = false;
    if (environ_cb && environ_cb(RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE, &updated) && updated) {
        read_options();
        set_input_descriptors();
        arc_log("options updated: ab_swap=%d cache=%d", (int)g_ab_swap, (int)g_compile_cache);
    }

    poll_input();

    if (g_pending_reset) {
        g_pending_reset = 0;
        arc_log("reset via SELECT");
        retro_reset();
    }

    double tp0 = g_perf_on ? perf_now_ms() : 0.0;
    JSValue dt = JS_NewFloat64(js_ctx, FRAME_MS);
    JSValue r = JS_Call(js_ctx, fn_step, JS_UNDEFINED, 1, &dt);
    if (JS_IsException(r)) {
        JSValue exc = JS_GetException(js_ctx);
        const char *m = JS_ToCString(js_ctx, exc);
        arc_log("step exception: %s", m ? m : "?");
        if (m) JS_FreeCString(js_ctx, m);
        JS_FreeValue(js_ctx, exc);
    }
    JS_FreeValue(js_ctx, r);
    JS_FreeValue(js_ctx, dt);

    /* 官方 runtime 重度依赖 promise/microtask（CPS 转换的协程续体）。
       QuickJS 不会自动跑 pending job，必须由宿主每帧显式抽干。 */
    {
        JSContext *job_ctx = NULL;
        int drained = 0;
        while (JS_ExecutePendingJob(js_rt, &job_ctx) > 0) {
            if (++drained >= 5000) break;   /* 防御：卡死时别锁住整帧 */
        }
    }

    double tp1 = g_perf_on ? perf_now_ms() : 0.0;
    present_frame();
    double tp2 = g_perf_on ? perf_now_ms() : 0.0;

    int frames = pull_audio(g_audio, AUDIO_HZ / 30);
    if (frames <= 0) {
        /* 没拉到：补一帧静音，保持流连续 */
        frames = AUDIO_HZ / 60;
        memset(g_audio, 0, (size_t)frames * 2 * sizeof(int16_t));
    }
    if (audio_batch_cb) audio_batch_cb(g_audio, frames);
    else if (audio_sample_cb)
        for (int i = 0; i < frames; i++) audio_sample_cb((uint16_t)g_audio[i * 2], (uint16_t)g_audio[i * 2 + 1]);

    if (g_perf_on) {
        g_perf_step += tp1 - tp0;
        g_perf_present += tp2 - tp1;
        g_perf_audio += perf_now_ms() - tp2;
        if (++g_perf_frames >= 120) perf_flush();   /* 2 秒一行 */
    }
}

EXPORT size_t retro_serialize_size(void) { return 0; }

EXPORT bool retro_serialize(void *data, size_t size)
{
    (void)data; (void)size;
    return false;   /* 存档状态暂不支持（JS 堆里有闭包引用，无法可靠序列化） */
}

EXPORT bool retro_unserialize(const void *data, size_t size)
{
    (void)data; (void)size;
    return false;
}

EXPORT void retro_cheat_reset(void) { }
EXPORT void retro_cheat_set(unsigned index, bool enabled, const char *code)
{
    (void)index; (void)enabled; (void)code;
}

EXPORT unsigned retro_get_region(void) { return RETRO_REGION_NTSC; }

void *retro_get_memory_data(unsigned id) { (void)id; return NULL; }
EXPORT size_t retro_get_memory_size(unsigned id) { (void)id; return 0; }
