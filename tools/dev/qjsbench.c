// 在 QuickJS 里跑官方 pxtsim + binary.js，测兼容性与性能
// 用法: qjsbench <pxtsim.js> <common-sim.js> <sim.js> <binary.js> [frames]
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "quickjs.h"

static char *read_file(const char *path, size_t *len) {
    FILE *f = fopen(path, "rb");
    if (!f) { fprintf(stderr, "cannot open %s\n", path); return NULL; }
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *buf = malloc(n + 1);
    if (fread(buf, 1, n, f) != (size_t)n) { fclose(f); free(buf); return NULL; }
    buf[n] = 0;
    fclose(f);
    if (len) *len = n;
    return buf;
}

static double now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000.0 + ts.tv_nsec / 1e6;
}

static int eval_file(JSContext *ctx, const char *path, const char *name) {
    size_t len = 0;
    char *src = read_file(path, &len);
    if (!src) return 0;
    double t0 = now_ms();
    JSValue v = JS_Eval(ctx, src, len, name, JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(v)) {
        JSValue e = JS_GetException(ctx);
        const char *s = JS_ToCString(ctx, e);
        fprintf(stderr, "EVAL ERROR in %s: %s\n", name, s ? s : "?");
        JS_FreeCString(ctx, s);
        JS_FreeValue(ctx, e);
        free(src);
        return 0;
    }
    printf("  %-14s %8.1f KB  eval %7.1f ms\n", name, len / 1024.0, now_ms() - t0);
    JS_FreeValue(ctx, v);
    free(src);
    return 1;
}

int main(int argc, char **argv) {
    if (argc < 5) {
        fprintf(stderr, "usage: %s <pxtsim.js> <common-sim.js> <sim.js> <binary.js> [frames]\n", argv[0]);
        return 1;
    }
    JSRuntime *rt = JS_NewRuntime();
    // pxt 的代码量大，默认栈可能不够
    JS_SetMaxStackSize(rt, 8 << 20);
    JS_SetMemoryLimit(rt, 512 << 20);
    JSContext *ctx = JS_NewContext(rt);

    printf("[quickjs] engine ready\n");
    if (!eval_file(ctx, argv[1], "pxtsim.js")) return 2;
    if (!eval_file(ctx, argv[2], "common-sim.js")) return 2;
    if (!eval_file(ctx, argv[3], "sim.js")) return 2;
    if (!eval_file(ctx, argv[4], "binary.js")) return 2;

    // 取 pxsim.Runtime 的可用性（不真正构造，因为需要 DOM）
    JSValue g = JS_GetGlobalObject(ctx);
    JSValue pxsim = JS_GetPropertyStr(ctx, g, "pxsim");
    int ok = !JS_IsUndefined(pxsim) && !JS_IsNull(pxsim);
    if (ok) {
        JSValue rtc = JS_GetPropertyStr(ctx, pxsim, "Runtime");
        ok = JS_IsFunction(ctx, rtc);
        JS_FreeValue(ctx, rtc);
    }
    printf("[quickjs] pxsim.Runtime %s\n", ok ? "present" : "MISSING");
    printf("[quickjs] memory used: %.1f MB\n", JS_ComputeMemoryUsage(rt).malloc_size / 1048576.0);
    JS_FreeValue(ctx, pxsim);
    JS_FreeValue(ctx, g);

    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    return ok ? 0 : 3;
}
