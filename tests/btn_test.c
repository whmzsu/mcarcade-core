/*
 * btn_test.c —— 按键映射验证用假前端。
 *
 *   zig-out/bin/btn_test <game.js> <button> [frames]
 *
 * button: libretro 侧的物理按键名（A / B / X / Y / L / R / START / UP ...），
 * 从第 5 帧开始一直按住，看核心把事件派发给了 MakeCode 的哪个按钮。
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <stdint.h>

#include "libretro.h"

void retro_init(void);
void retro_deinit(void);
void retro_set_environment(retro_environment_t);
void retro_set_video_refresh(retro_video_refresh_t);
void retro_set_audio_sample(retro_audio_sample_t);
void retro_set_audio_sample_batch(retro_audio_sample_batch_t);
void retro_set_input_poll(retro_input_poll_t);
void retro_set_input_state(retro_input_state_t);
void retro_get_system_info(struct retro_system_info *);
bool retro_load_game(const struct retro_game_info *);
void retro_unload_game(void);
void retro_run(void);

static int g_hold = -1;
static int g_frame = 0;
static int g_bitmask = 0;        /* --bitmask：让核心走位掩码轮询路径 */
static int g_swap = 0;           /* --swap：核心选项 arcade_ab_swap=enabled */
static int g_release_at = 0;     /* --release N：第 N 帧松开，用于验证 Released 事件 */

static void cb_video(const void *d, unsigned w, unsigned h, size_t p) { (void)d; (void)w; (void)h; (void)p; }
static void cb_audio_sample(int16_t l, int16_t r) { (void)l; (void)r; }
static size_t cb_audio_batch(const int16_t *d, size_t f) { (void)d; return f; }
static void cb_input_poll(void) { }

static int16_t cb_input_state(unsigned port, unsigned device, unsigned index, unsigned id)
{
    (void)port; (void)device; (void)index;
    if (g_frame < 5) return 0;
    if (g_release_at > 0 && g_frame >= g_release_at) return 0;
    if (id == RETRO_DEVICE_ID_JOYPAD_MASK)   /* 位掩码查询：只看当前按住的那个键 */
        return (int16_t)(1u << (unsigned)g_hold);
    return id == (unsigned)g_hold ? 1 : 0;
}

static void log_cb(enum retro_log_level level, const char *fmt, ...)
{
    (void)level;
    va_list ap;
    va_start(ap, fmt);
    vprintf(fmt, ap);
    va_end(ap);
}

static bool cb_environment(unsigned cmd, void *data)
{
    if (cmd == RETRO_ENVIRONMENT_SET_PIXEL_FORMAT) return true;
    if (cmd == RETRO_ENVIRONMENT_GET_LOG_INTERFACE) {
        ((struct retro_log_callback *)data)->log = log_cb;
        return true;
    }
    if (cmd == RETRO_ENVIRONMENT_GET_INPUT_BITMASKS) return g_bitmask != 0;
    if (cmd == RETRO_ENVIRONMENT_GET_VARIABLE) {
        struct retro_variable *v = (struct retro_variable *)data;
        if (v && strcmp(v->key, "arcade_ab_swap") == 0) {
            v->value = g_swap ? "enabled" : "disabled";
            return true;
        }
        return false;
    }
    if (cmd == RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS) {
        const struct retro_input_descriptor *d = (const struct retro_input_descriptor *)data;
        printf("-- 核心声明的输入描述符 --\n");
        for (; d && d->description; d++)
            printf("   port%u btn id=%-3u  %s\n", d->port, d->id, d->description);
        return true;
    }
    if (cmd == RETRO_ENVIRONMENT_SET_CONTROLLER_INFO) {
        const struct retro_controller_info *ci = (const struct retro_controller_info *)data;
        printf("-- 端口声明：%u 种设备 --\n", ci ? ci->num_types : 0);
        return true;
    }
    return false;
}

static int id_of(const char *s)
{
    if (!strcasecmp(s, "A")) return RETRO_DEVICE_ID_JOYPAD_A;
    if (!strcasecmp(s, "B")) return RETRO_DEVICE_ID_JOYPAD_B;
    if (!strcasecmp(s, "X")) return RETRO_DEVICE_ID_JOYPAD_X;
    if (!strcasecmp(s, "Y")) return RETRO_DEVICE_ID_JOYPAD_Y;
    if (!strcasecmp(s, "L")) return RETRO_DEVICE_ID_JOYPAD_L;
    if (!strcasecmp(s, "R")) return RETRO_DEVICE_ID_JOYPAD_R;
    if (!strcasecmp(s, "START")) return RETRO_DEVICE_ID_JOYPAD_START;
    if (!strcasecmp(s, "SELECT")) return RETRO_DEVICE_ID_JOYPAD_SELECT;
    if (!strcasecmp(s, "UP")) return RETRO_DEVICE_ID_JOYPAD_UP;
    if (!strcasecmp(s, "DOWN")) return RETRO_DEVICE_ID_JOYPAD_DOWN;
    if (!strcasecmp(s, "LEFT")) return RETRO_DEVICE_ID_JOYPAD_LEFT;
    if (!strcasecmp(s, "RIGHT")) return RETRO_DEVICE_ID_JOYPAD_RIGHT;
    return -1;
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

int main(int argc, char **argv)
{
    if (argc < 3) {
        fprintf(stderr, "usage: %s <cart.png> <A|B|X|Y|START|UP...> [frames]\n", argv[0]);
        return 2;
    }
    /* argv[3..] 里可能混着数字（帧数）和 --flag，不能直接 atoi(argv[3]) */
    int frames = 30;
    for (int i = 3; i < argc; i++) {
        if (strncmp(argv[i], "--", 2) == 0) {
            if (strcmp(argv[i], "--bitmask") == 0) g_bitmask = 1;
            else if (strcmp(argv[i], "--swap") == 0) g_swap = 1;
            else if (strcmp(argv[i], "--release") == 0 && i + 1 < argc) g_release_at = atoi(argv[++i]);
            else { fprintf(stderr, "unknown flag %s\n", argv[i]); return 2; }
        } else {
            frames = atoi(argv[i]);
        }
    }
    g_hold = id_of(argv[2]);
    if (g_hold < 0) { fprintf(stderr, "unknown button %s\n", argv[2]); return 2; }

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

    struct retro_game_info game;
    memset(&game, 0, sizeof(game));
    game.path = argv[1];
    game.data = buf;
    game.size = len;

    printf("== 按住 libretro 按键 %s（id=%d, bitmask=%d, ab_swap=%d）==\n",
           argv[2], g_hold, g_bitmask, g_swap);
    if (!retro_load_game(&game)) { fprintf(stderr, "load failed\n"); return 1; }
    for (g_frame = 0; g_frame < frames; g_frame++) retro_run();
    printf("== 结束（%d 帧）==\n", frames);

    retro_unload_game();
    retro_deinit();
    free(buf);
    return 0;
}
