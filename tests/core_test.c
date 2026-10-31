/*
 * core_test.c —— 假前端：直接调用 libretro 接口，跑若干帧并把画面存成 PPM。
 * 用于没有 RetroArch 的环境下验证整条链路（卡带 → JS → 画面）。
 *
 *   zig-out/bin/core_test <game.js> <out.ppm> [frames]   （v0.9 内容 = pxtc 产物 .js）
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <math.h>
#include <time.h>   /* Linux 上 clock_gettime / CLOCK_MONOTONIC / nanosleep */

#include "libretro.h"

/* core.c 导出的 libretro 接口 */
void retro_init(void);
void retro_deinit(void);
unsigned retro_api_version(void);
void retro_set_environment(retro_environment_t);
void retro_set_video_refresh(retro_video_refresh_t);
void retro_set_audio_sample(retro_audio_sample_t);
void retro_set_audio_sample_batch(retro_audio_sample_batch_t);
void retro_set_input_poll(retro_input_poll_t);
void retro_set_input_state(retro_input_state_t);
void retro_get_system_info(struct retro_system_info *);
void retro_get_system_av_info(struct retro_system_av_info *);
bool retro_load_game(const struct retro_game_info *);
void retro_unload_game(void);
void retro_run(void);

static unsigned char *g_frame;
static unsigned g_w, g_h;

/* 可选：从第 5 帧开始按住某个键，用来验证游戏内手感（比如 ping 的挡板）
 *   --press=UP   --press=START   --release=90（第 90 帧松开） */
static int g_hold = -1;
static int g_frame_no = 0;
static int g_release_at = 0;

/* 可选：按键脚本，用来走菜单。--seq=START@6,RIGHT@12,A@16,A@22
 * 每个 key 只在指定帧按下（下一帧松开），足够触发"按下沿"和"松开沿"。 */
#define MAX_SEQ 64
static int g_seq_key[MAX_SEQ];
static int g_seq_at[MAX_SEQ];
static int g_nseq;

/* 音频能量统计，用来验证音量真的生效 */
static int g_met_from = -1;
static int g_peak;
static double g_energy;
static long g_audio_samples;

/* 可选：在第 N 帧调用 retro_reset()，验证重置路径（0.9 是整机重建） */
static int g_reset_at = -1;
/* 可选：每 N 帧抓一张图，文件名 <out>_fNNN.ppm，用来看动画/进度是否推进 */
static int g_every = 0;

/* 可选：--wav=path 把整场音频录成 16bit 单声道 WAV（验证音高/时长用） */
/* 可选：--cache=DIR 扮演「前端给了存档目录」，让核心启用编译缓存 */
static const char *g_save_dir = NULL;
/* 可选：--nocache 把核心选项 arcade_compile_cache 设成 disabled，验证开关真的生效 */
static int g_cache_off = 0;
/* 可选：--pace 按 60fps 节流（真实前端是 16.7ms 一帧；不节流跑得太快，
 * 而 runtime 的定时器按真实时间触发，step 会被严重低估，性能数据不可信） */
static int g_pace = 0;

#if defined(_WIN32)
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
static double wall_ms(void) { return (double)GetTickCount64(); }
static void wall_sleep_ms(double ms) { if (ms > 0) Sleep((DWORD)(ms + 0.5)); }
#else
static double wall_ms(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (double)ts.tv_sec * 1000.0 + (double)ts.tv_nsec / 1e6;
}
static void wall_sleep_ms(double ms)
{
    if (ms <= 0) return;
    struct timespec ts;
    ts.tv_sec = (time_t)(ms / 1000.0);
    ts.tv_nsec = (long)((ms - (double)ts.tv_sec * 1000.0) * 1e6);
    nanosleep(&ts, NULL);
}
#endif

static const char *g_wav_path = NULL;
static short *g_wav = NULL;
static long g_wav_n = 0, g_wav_cap = 0;

static int key_id(const char *s);

static int seq_pressed(int id)
{
    for (int i = 0; i < g_nseq; i++)
        if (g_seq_key[i] == id && g_seq_at[i] == g_frame_no) return 1;
    return 0;
}

static void parse_seq(const char *spec)
{
    char buf[512];
    strncpy(buf, spec, sizeof(buf) - 1);
    buf[sizeof(buf) - 1] = 0;
    char *save = NULL;
    for (char *tok = strtok_r(buf, ",", &save); tok; tok = strtok_r(NULL, ",", &save)) {
        char *at = strchr(tok, '@');
        if (!at) continue;
        *at = 0;
        int k = key_id(tok), f = atoi(at + 1);
        if (k >= 0 && g_nseq < MAX_SEQ) { g_seq_key[g_nseq] = k; g_seq_at[g_nseq] = f; g_nseq++; }
    }
}

static int key_id(const char *s)
{
    if (!strcmp(s, "B")) return RETRO_DEVICE_ID_JOYPAD_B;
    if (!strcmp(s, "Y")) return RETRO_DEVICE_ID_JOYPAD_Y;
    if (!strcmp(s, "SELECT")) return RETRO_DEVICE_ID_JOYPAD_SELECT;
    if (!strcmp(s, "START")) return RETRO_DEVICE_ID_JOYPAD_START;
    if (!strcmp(s, "UP")) return RETRO_DEVICE_ID_JOYPAD_UP;
    if (!strcmp(s, "DOWN")) return RETRO_DEVICE_ID_JOYPAD_DOWN;
    if (!strcmp(s, "LEFT")) return RETRO_DEVICE_ID_JOYPAD_LEFT;
    if (!strcmp(s, "RIGHT")) return RETRO_DEVICE_ID_JOYPAD_RIGHT;
    if (!strcmp(s, "A")) return RETRO_DEVICE_ID_JOYPAD_A;
    if (!strcmp(s, "X")) return RETRO_DEVICE_ID_JOYPAD_X;
    return -1;
}

static void cb_video(const void *data, unsigned width, unsigned height, size_t pitch)
{
    g_w = width;
    g_h = height;
    if (!data) return;
    if (!g_frame) g_frame = (unsigned char *)malloc((size_t)width * height * 4);
    const unsigned char *src = (const unsigned char *)data;
    for (unsigned y = 0; y < height; y++)
        memcpy(g_frame + (size_t)y * width * 4, src + (size_t)y * pitch, (size_t)width * 4);
}

static void cb_audio_sample(int16_t l, int16_t r)
{
    int v = l < 0 ? -l : l;
    if (v > g_peak) g_peak = v;
    g_energy += (double)l * l;
    g_audio_samples++;
    (void)r;
}
static size_t cb_audio_batch(const int16_t *data, size_t frames)
{
    for (size_t i = 0; i < frames; i++) cb_audio_sample(data[i * 2], data[i * 2 + 1]);
    if (g_wav_path && frames > 0) {
        if (g_wav_n + (long)frames > g_wav_cap) {
            g_wav_cap = g_wav_cap ? g_wav_cap * 2 : 44100 * 30;
            while (g_wav_n + (long)frames > g_wav_cap) g_wav_cap *= 2;
            g_wav = (short *)realloc(g_wav, (size_t)g_wav_cap * sizeof(short));
        }
        for (size_t i = 0; i < frames; i++) g_wav[g_wav_n++] = data[i * 2];
    }
    return frames;
}

/* 把当前帧写盘（XRGB8888 -> RGB24 PPM）。--every 定时抓拍用 */
static int dump_ppm(const char *path)
{
    if (!g_frame) return 0;
    FILE *out = fopen(path, "wb");
    if (!out) { fprintf(stderr, "cannot write %s\n", path); return 0; }
    fprintf(out, "P6\n%u %u\n255\n", g_w, g_h);
    for (unsigned i = 0; i < g_w * g_h; i++) {
        fputc(g_frame[i * 4 + 2], out);
        fputc(g_frame[i * 4 + 1], out);
        fputc(g_frame[i * 4 + 0], out);
    }
    fclose(out);
    return 1;
}
static void cb_input_poll(void) { }
static int16_t cb_input_state(unsigned port, unsigned device, unsigned index, unsigned id)
{
    (void)port; (void)device; (void)index;
    if (id == RETRO_DEVICE_ID_JOYPAD_MASK) {
        unsigned mask = 0;
        if (g_hold >= 0 && g_frame_no >= 5 && !(g_release_at > 0 && g_frame_no >= g_release_at))
            mask |= 1u << (unsigned)g_hold;
        for (int i = 0; i < g_nseq; i++)
            if (g_seq_at[i] == g_frame_no) mask |= 1u << (unsigned)g_seq_key[i];
        return (int16_t)mask;
    }
    if (seq_pressed((int)id)) return 1;
    if (g_hold < 0 || g_frame_no < 5) return 0;
    if (g_release_at > 0 && g_frame_no >= g_release_at) return 0;
    return id == (unsigned)g_hold ? 1 : 0;
}
/* 核心的日志走这里（真实前端也是这么接的）。转发到 stdout，别让它落到 stderr：
 * zig build 的 run 步骤会把子进程 stderr 当错误报告，一堆正常日志会很难看。 */
static void core_log(enum retro_log_level level, const char *fmt, ...)
{
    va_list ap;
    (void)level;
    va_start(ap, fmt);
    vprintf(fmt, ap);
    va_end(ap);
    fflush(stdout);
}

static bool cb_environment(unsigned cmd, void *data)
{
    if (cmd == RETRO_ENVIRONMENT_SET_PIXEL_FORMAT) return true;
    if (cmd == RETRO_ENVIRONMENT_GET_LOG_INTERFACE) {
        struct retro_log_callback *cb = (struct retro_log_callback *)data;
        cb->log = core_log;
        return true;
    }
    /* --cache=DIR 时假装自己有存档目录，用来验证编译缓存（第二次跑应该直接命中） */
    if (cmd == RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY) {
        *(const char **)data = g_save_dir;
        return g_save_dir != NULL;
    }
    if (cmd == RETRO_ENVIRONMENT_GET_VARIABLE) {
        struct retro_variable *v = (struct retro_variable *)data;
        if (!strcmp(v->key, "arcade_compile_cache")) {
            v->value = g_cache_off ? "disabled" : "enabled";
            return true;
        }
        /* 性能统计：ARCADE_PERF=1 时打开（本地对标设备用） */
        if (!strcmp(v->key, "arcade_perf")) {
            v->value = getenv("ARCADE_PERF") ? "enabled" : "disabled";
            return true;
        }
        return false;
    }
    return false;
}

static unsigned char *read_file(const char *path, size_t *len)
{
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    unsigned char *buf = (unsigned char *)malloc((size_t)n);
    if (!buf || fread(buf, 1, (size_t)n, f) != (size_t)n) { fclose(f); free(buf); return NULL; }
    fclose(f);
    *len = (size_t)n;
    return buf;
}

/* 全部流程（原来是 main 的主体），改个名字是为了能在指定栈大小的线程里跑 */
static int run_all(int argc, char **argv);

#if defined(_WIN32)
#include <windows.h>
typedef struct { int argc; char **argv; int rc; } stack_arg;
static DWORD WINAPI stack_thread(LPVOID p)
{
    stack_arg *a = (stack_arg *)p;
    a->rc = run_all(a->argc, a->argv);
    return 0;
}
#else
#include <pthread.h>
typedef struct { int argc; char **argv; int rc; } stack_arg;
static void *stack_thread(void *p)
{
    stack_arg *a = (stack_arg *)p;
    a->rc = run_all(a->argc, a->argv);
    return NULL;
}
#endif

/*
 * --stack=KB 在指定栈大小的线程里跑整套流程。
 * 用来模拟 RetroArch：Windows 上它给主线程的栈只有 1MB，而我们自己编的
 * core_test.exe 有 16MB —— 不这么测一遍，内嵌编译器在真机上可能踩穿栈。
 */
int main(int argc, char **argv)
{
    int stack_kb = 0;
    for (int i = 1; i < argc; i++)
        if (!strncmp(argv[i], "--stack=", 8)) stack_kb = atoi(argv[i] + 8);

    if (stack_kb <= 0) return run_all(argc, argv);

    stack_arg a;
    a.argc = argc;
    a.argv = argv;
    a.rc = 1;
#if defined(_WIN32)
    HANDLE h = CreateThread(NULL, (SIZE_T)stack_kb * 1024, stack_thread, &a, 0, NULL);
    if (!h) { fprintf(stderr, "CreateThread failed\n"); return 2; }
    WaitForSingleObject(h, INFINITE);
    CloseHandle(h);
#else
    pthread_t th;
    pthread_attr_t attr;
    pthread_attr_init(&attr);
    pthread_attr_setstacksize(&attr, (size_t)stack_kb * 1024);
    if (pthread_create(&th, &attr, stack_thread, &a) != 0) {
        fprintf(stderr, "pthread_create failed\n");
        return 2;
    }
    pthread_join(th, NULL);
    pthread_attr_destroy(&attr);
#endif
    return a.rc;
}

static int run_all(int argc, char **argv)
{
    if (argc < 3) {
        fprintf(stderr, "usage: %s <cart.png|game.js> <out.ppm> [frames] [--stack=KB] ...\n", argv[0]);
        return 2;
    }
    int frames = argc > 3 ? atoi(argv[3]) : 60;
    for (int i = 1; i < argc; i++) {
        if (!strncmp(argv[i], "--press=", 8)) g_hold = key_id(argv[i] + 8);
        else if (!strncmp(argv[i], "--release=", 10)) g_release_at = atoi(argv[i] + 10);
        else if (!strncmp(argv[i], "--seq=", 6)) parse_seq(argv[i] + 6);
        else if (!strncmp(argv[i], "--metfrom=", 10)) g_met_from = atoi(argv[i] + 10);
        else if (!strncmp(argv[i], "--reset-at=", 11)) g_reset_at = atoi(argv[i] + 11);
        else if (!strncmp(argv[i], "--wav=", 6)) g_wav_path = argv[i] + 6;
        else if (!strncmp(argv[i], "--every=", 8)) g_every = atoi(argv[i] + 8);
        else if (!strncmp(argv[i], "--cache=", 8)) g_save_dir = argv[i] + 8;
        else if (!strcmp(argv[i], "--nocache")) g_cache_off = 1;
        else if (!strcmp(argv[i], "--pace")) g_pace = 1;
    }
    size_t len = 0;
    unsigned char *buf = read_file(argv[1], &len);
    if (!buf) { fprintf(stderr, "cannot read %s\n", argv[1]); return 2; }

    retro_set_environment(cb_environment);
    retro_set_video_refresh(cb_video);
    retro_set_audio_sample(cb_audio_sample);
    retro_set_audio_sample_batch(cb_audio_batch);
    retro_set_input_poll(cb_input_poll);
    retro_set_input_state(cb_input_state);
    retro_init();

    struct retro_system_info si;
    retro_get_system_info(&si);
    printf("core: %s %s (ext=%s)\n", si.library_name, si.library_version, si.valid_extensions);

    struct retro_game_info game;
    memset(&game, 0, sizeof(game));
    game.path = argv[1];
    game.data = buf;
    game.size = len;

    if (!retro_load_game(&game)) {
        fprintf(stderr, "retro_load_game failed\n");
        return 1;
    }
    double pace_t0 = wall_ms();
    for (int i = 0; i < frames; i++) {
        g_frame_no = i;
        if (g_pace) {
            /* 每帧对齐到 60fps 时间线：真实前端给核心的就是 16.7ms 一帧，
               runtime 的定时器按墙钟触发，不节流测出来的 step 会偏小。 */
            double due = (double)(i + 1) * (1000.0 / 60.0);
            double now = wall_ms() - pace_t0;
            if (due > now) wall_sleep_ms(due - now);
        }
        if (i == g_met_from) { g_peak = 0; g_energy = 0; g_audio_samples = 0; }
        retro_run();
        if (i == g_reset_at) retro_reset();
        if (g_every > 0 && i > 0 && (i % g_every) == 0) {
            char p[512];
            snprintf(p, sizeof(p), "%.*s_f%04d.ppm", (int)(strlen(argv[2]) - 4), argv[2], i);
            dump_ppm(p);
        }
    }

    if (!g_frame) { fprintf(stderr, "no frame produced\n"); return 1; }

    FILE *out = fopen(argv[2], "wb");
    if (!out) { fprintf(stderr, "cannot write %s\n", argv[2]); return 1; }
    fprintf(out, "P6\n%u %u\n255\n", g_w, g_h);
    for (unsigned i = 0; i < g_w * g_h; i++) {
        /* XRGB8888 -> RGB */
        fputc(g_frame[i * 4 + 2], out);
        fputc(g_frame[i * 4 + 1], out);
        fputc(g_frame[i * 4 + 0], out);
    }
    fclose(out);
    printf("wrote %s (%ux%u, %d frames)\n", argv[2], g_w, g_h, frames);
    if (g_audio_samples > 0) {
        double rms = g_energy > 0 ? sqrt(g_energy / (double)g_audio_samples) : 0;
        printf("audio: peak=%d rms=%.1f samples=%ld\n", g_peak, rms, g_audio_samples);
    }

    if (g_wav_path && g_wav && g_wav_n > 0) {
        FILE *wf = fopen(g_wav_path, "wb");
        if (wf) {
            unsigned sr = 44100, bits = 16, ch = 1;
            unsigned dr = 36 + (unsigned)g_wav_n * 2;
            unsigned br = sr * 2;
            short fmt = 1;
            fwrite("RIFF", 1, 4, wf);
            fwrite(&dr, 4, 1, wf); fwrite("WAVE", 1, 4, wf);
            fwrite("fmt ", 1, 4, wf);
            unsigned fsz = 16; fwrite(&fsz, 4, 1, wf);
            fwrite(&fmt, 2, 1, wf); fwrite(&ch, 2, 1, wf);
            fwrite(&sr, 4, 1, wf); fwrite(&br, 4, 1, wf);
            short align = 2; fwrite(&align, 2, 1, wf); fwrite(&bits, 2, 1, wf);
            fwrite("data", 1, 4, wf);
            unsigned dsz = (unsigned)g_wav_n * 2; fwrite(&dsz, 4, 1, wf);
            fwrite(g_wav, 2, (size_t)g_wav_n, wf);
            fclose(wf);
            printf("wav: %s (%ld samples, %.2fs)\n", g_wav_path, g_wav_n, g_wav_n / 44100.0);
        }
    }
    free(g_wav);

    retro_unload_game();
    retro_deinit();
    free(g_frame);
    free(buf);
    return 0;
}
