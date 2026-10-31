/*
 * qjsrun.c —— 探针用最小 QuickJS 宿主（不属于发布产物）
 *
 * 目的：在没有 Node 的环境里跑 pxt 编译器，量真实耗时与内存。
 * 提供：__readFile/__writeFile/__exists/__mkdirp/__readdir/__stat/__now/__exit/print
 *
 * 用法：qjsrun <script.js> [--mem=MB] [--timeout=SEC] [--args=a,b]
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <sys/stat.h>
#include <dirent.h>

#include "quickjs.h"

#ifdef _WIN32
#include <direct.h>
#include <windows.h>
#define MKDIR(p) _mkdir(p)
#else
#define MKDIR(p) mkdir(p, 0755)
#endif

static JSRuntime *g_rt;
static double g_t0;

static double now_ms(void)
{
#ifdef _WIN32
    LARGE_INTEGER f, c;
    QueryPerformanceFrequency(&f);
    QueryPerformanceCounter(&c);
    return (double)c.QuadPart * 1000.0 / (double)f.QuadPart;
#else
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000.0 + ts.tv_nsec / 1e6;
#endif
}

static char *read_all(const char *path, size_t *len)
{
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (n < 0) { fclose(f); return NULL; }
    char *b = (char *)malloc((size_t)n + 1);
    if (!b) { fclose(f); return NULL; }
    size_t got = fread(b, 1, (size_t)n, f);
    fclose(f);
    b[got] = 0;
    if (len) *len = got;
    return b;
}

static JSValue js_readFile(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    const char *p = argc > 0 ? JS_ToCString(ctx, argv[0]) : NULL;
    if (!p) return JS_NULL;
    size_t n = 0;
    char *b = read_all(p, &n);
    JS_FreeCString(ctx, p);
    if (!b) return JS_NULL;
    JSValue r = JS_NewStringLen(ctx, b, n);
    free(b);
    return r;
}

static JSValue js_writeFile(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    if (argc < 2) return JS_UNDEFINED;
    const char *p = JS_ToCString(ctx, argv[0]);
    size_t n = 0;
    const char *s = JS_ToCStringLen(ctx, &n, argv[1]);
    if (p && s) {
        FILE *f = fopen(p, "wb");
        if (f) { fwrite(s, 1, n, f); fclose(f); }
    }
    if (p) JS_FreeCString(ctx, p);
    if (s) JS_FreeCString(ctx, s);
    return JS_UNDEFINED;
}

static JSValue js_exists(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    const char *p = argc > 0 ? JS_ToCString(ctx, argv[0]) : NULL;
    struct stat st;
    int ok = p && stat(p, &st) == 0;
    if (p) JS_FreeCString(ctx, p);
    return JS_NewBool(ctx, ok);
}

static JSValue js_mkdirp(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    const char *p = argc > 0 ? JS_ToCString(ctx, argv[0]) : NULL;
    if (!p) return JS_UNDEFINED;
    char *tmp = strdup(p);
    for (char *q = tmp + 1; *q; q++) {
        if (*q == '/' || *q == '\\') {
            char c = *q; *q = 0;
            MKDIR(tmp);
            *q = c;
        }
    }
    MKDIR(tmp);
    free(tmp);
    JS_FreeCString(ctx, p);
    return JS_UNDEFINED;
}

static JSValue js_readdir(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    const char *p = argc > 0 ? JS_ToCString(ctx, argv[0]) : NULL;
    JSValue arr = JS_NewArray(ctx);
    if (!p) return arr;
    DIR *d = opendir(p);
    if (d) {
        struct dirent *e;
        uint32_t i = 0;
        while ((e = readdir(d))) {
            if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) continue;
            JS_SetPropertyUint32(ctx, arr, i++, JS_NewString(ctx, e->d_name));
        }
        closedir(d);
    }
    JS_FreeCString(ctx, p);
    return arr;
}

static JSValue js_stat(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    const char *p = argc > 0 ? JS_ToCString(ctx, argv[0]) : NULL;
    if (!p) return JS_NULL;
    struct stat st;
    int ok = stat(p, &st) == 0;
    JS_FreeCString(ctx, p);
    if (!ok) return JS_NULL;
    JSValue o = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, o, "size", JS_NewInt64(ctx, (int64_t)st.st_size));
    JS_SetPropertyStr(ctx, o, "dir", JS_NewBool(ctx, (st.st_mode & S_IFDIR) != 0));
    JS_SetPropertyStr(ctx, o, "mtime", JS_NewInt64(ctx, (int64_t)st.st_mtime * 1000));
    return o;
}

static JSValue js_now(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)ctx; (void)this_val; (void)argc; (void)argv;
    return JS_NewFloat64(ctx, now_ms() - g_t0);
}

static JSValue js_print(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    for (int i = 0; i < argc; i++) {
        size_t n = 0;
        const char *s = JS_ToCStringLen(ctx, &n, argv[i]);
        if (s) { fwrite(s, 1, n, stdout); JS_FreeCString(ctx, s); }
        if (i + 1 < argc) fputc(' ', stdout);
    }
    fputc('\n', stdout);
    fflush(stdout);
    return JS_UNDEFINED;
}

static double g_peak_mb;

static void sample_peak(JSRuntime *rt)
{
    JSMemoryUsage mu;
    JS_ComputeMemoryUsage(rt, &mu);
    double mb = mu.malloc_size / 1048576.0;
    if (mb > g_peak_mb) g_peak_mb = mb;
}

static void drain(JSRuntime *rt, int max_ms)
{
    JSContext *ctx1;
    double t0 = now_ms();
    int n = 0;
    for (;;) {
        int r = JS_ExecutePendingJob(rt, &ctx1);
        if (r == 0) break;            /* 队列空了 */
        if (r < 0) { fprintf(stderr, "[host] job error\n"); break; }
        n++;
        if ((n & 63) == 0) sample_peak(rt);
        if (now_ms() - t0 > max_ms) { fprintf(stderr, "[host] job timeout\n"); break; }
    }
    fprintf(stderr, "[host] jobs drained: %d\n", n);
}

int main(int argc, char **argv)
{
    if (argc < 2) { fprintf(stderr, "usage: qjsrun <script.js> [--mem=MB] [--timeout=SEC]\n"); return 2; }
    const char *script = argv[1];
    size_t mem_limit = 0;
    int timeout_s = 180;
    for (int i = 2; i < argc; i++) {
        if (!strncmp(argv[i], "--mem=", 6)) mem_limit = (size_t)atol(argv[i] + 6) * 1024 * 1024;
        else if (!strncmp(argv[i], "--timeout=", 10)) timeout_s = atoi(argv[i] + 10);
    }

    g_t0 = now_ms();
    g_rt = JS_NewRuntime();
    if (mem_limit) JS_SetMemoryLimit(g_rt, mem_limit);
    JS_SetMaxStackSize(g_rt, 4 * 1024 * 1024);
    JSContext *ctx = JS_NewContext(g_rt);

    JSValue g = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, g, "__readFile", JS_NewCFunction(ctx, js_readFile, "__readFile", 1));
    JS_SetPropertyStr(ctx, g, "__writeFile", JS_NewCFunction(ctx, js_writeFile, "__writeFile", 2));
    JS_SetPropertyStr(ctx, g, "__exists", JS_NewCFunction(ctx, js_exists, "__exists", 1));
    JS_SetPropertyStr(ctx, g, "__mkdirp", JS_NewCFunction(ctx, js_mkdirp, "__mkdirp", 1));
    JS_SetPropertyStr(ctx, g, "__readdir", JS_NewCFunction(ctx, js_readdir, "__readdir", 1));
    JS_SetPropertyStr(ctx, g, "__stat", JS_NewCFunction(ctx, js_stat, "__stat", 1));
    JS_SetPropertyStr(ctx, g, "__now", JS_NewCFunction(ctx, js_now, "__now", 0));
    JS_SetPropertyStr(ctx, g, "print", JS_NewCFunction(ctx, js_print, "print", 1));

    /* scriptArgs：脚本自己的参数（argv[2..]） */
    JSValue sargs = JS_NewArray(ctx);
    for (int i = 2, k = 0; i < argc; i++) {
        if (!strncmp(argv[i], "--mem=", 6) || !strncmp(argv[i], "--timeout=", 10)) continue;
        JS_SetPropertyUint32(ctx, sargs, (uint32_t)k++, JS_NewString(ctx, argv[i]));
    }
    JS_SetPropertyStr(ctx, g, "scriptArgs", sargs);
    JS_FreeValue(ctx, g);

    size_t n = 0;
    char *src = read_all(script, &n);
    if (!src) { fprintf(stderr, "cannot read %s\n", script); return 2; }
    fprintf(stderr, "[host] script %s (%zu bytes) loaded at %.0f ms\n", script, n, now_ms() - g_t0);

    JSValue v = JS_Eval(ctx, src, n, script, JS_EVAL_TYPE_GLOBAL);
    fprintf(stderr, "[host] eval done at %.0f ms\n", now_ms() - g_t0);
    free(src);

    if (JS_IsException(v)) {
        JSValue ex = JS_GetException(ctx);
        const char *s = JS_ToCString(ctx, ex);
        fprintf(stderr, "[host] EXCEPTION: %s\n", s ? s : "(null)");
        if (s) JS_FreeCString(ctx, s);
        JSValue st = JS_GetPropertyStr(ctx, ex, "stack");
        if (!JS_IsUndefined(st)) {
            const char *ss = JS_ToCString(ctx, st);
            if (ss) { fprintf(stderr, "%s\n", ss); JS_FreeCString(ctx, ss); }
        }
        JS_FreeValue(ctx, st);
        JS_FreeValue(ctx, ex);
    }
    JS_FreeValue(ctx, v);

    drain(g_rt, timeout_s * 1000);

    JSMemoryUsage mu;
    JS_ComputeMemoryUsage(g_rt, &mu);
    if (mu.malloc_size / 1048576.0 > g_peak_mb) g_peak_mb = mu.malloc_size / 1048576.0;
    fprintf(stderr, "[host] malloc_count=%lld malloc_size=%.1f MB  peak=%.1f MB  total %.0f ms\n",
            (long long)mu.malloc_count, mu.malloc_size / 1048576.0, g_peak_mb, now_ms() - g_t0);

    JS_FreeContext(ctx);
    JS_FreeRuntime(g_rt);
    return 0;
}
