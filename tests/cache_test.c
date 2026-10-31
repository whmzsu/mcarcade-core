/*
 * cache_test.c —— 编译缓存的自检（不加载卡带、不需要前端）
 *
 * 覆盖：未命中 / 写入后命中 / 逐字节一致 / 截断 / 载荷篡改 / 编译器指纹不符 /
 *       目录不存在时自动创建 / 条数上限淘汰。
 *
 *   cache_test <临时目录>
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "cache.h"

static int fails;

#define CHECK(cond, ...) do {                       \
    if (cond) { printf("ok   "); }                   \
    else { printf("FAIL "); fails++; }               \
    printf(__VA_ARGS__); printf("\n");               \
} while (0)

static char *slurp(const char *path, size_t *len)
{
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *b = (char *)malloc((size_t)n + 1);
    if (!b || fread(b, 1, (size_t)n, f) != (size_t)n) { fclose(f); free(b); return NULL; }
    fclose(f);
    b[n] = '\0';
    *len = (size_t)n;
    return b;
}

static int dump(const char *path, const char *b, size_t n)
{
    FILE *f = fopen(path, "wb");
    if (!f) return -1;
    int ok = fwrite(b, 1, n, f) == n;
    fclose(f);
    return ok ? 0 : -1;
}

int main(int argc, char **argv)
{
    char dir[512];
    snprintf(dir, sizeof(dir), "%s/cc-test", argc > 1 ? argv[1] : ".");
    printf("cache dir: %s\n", dir);

    const char *bid = "0123456789abcdef";
    char payload[300];
    for (size_t i = 0; i < sizeof(payload); i++)
        payload[i] = (char)((i * 7 + 3) & 0xFF);

    /* 每轮源码都不一样（时间 + 时钟），保证第一条断言永远是「未命中」 */
    char src[256];
    snprintf(src, sizeof(src), "{\"files\":{\"main.ts\":\"let t = %ld%ld\"}}",
             (long)time(NULL), (long)clock());
    size_t slen = strlen(src);

    char key[17];
    cache_key(src, slen, bid, key);
    CHECK(strlen(key) == 16, "键是 16 位十六进制：%s", key);

    char *out = NULL;
    size_t olen = 0;

    /* 1. 目录还不存在 -> 未命中（不是错误） */
    CHECK(cache_load(dir, key, bid, &out, &olen) == 1 && out == NULL,
          "没有缓存时返回未命中");

    /* 2. 写入（目录是新建的）-> 读回逐字节一致 */
    CHECK(cache_save(dir, key, bid, payload, sizeof(payload)) == 0, "写入缓存（自动建目录）");
    CHECK(cache_load(dir, key, bid, &out, &olen) == 0, "写入后命中");
    CHECK(olen == sizeof(payload) && out && memcmp(out, payload, olen) == 0,
          "读回 %u 字节，内容一致", (unsigned)olen);
    free(out); out = NULL; olen = 0;

    /* 3. 换一个编译器指纹：同一个键也不能用 */
    CHECK(cache_load(dir, key, "ffffffffffffffff", &out, &olen) < 0,
          "编译器指纹不符视为无效");
    free(out); out = NULL;

    /* 4. 换个键当然也不该命中 */
    {
        char k2[17];
        cache_key("other source", 12, bid, k2);
        CHECK(cache_load(dir, k2, bid, &out, &olen) == 1, "另一个键未命中");
        free(out); out = NULL;
    }

    /* 5. 截断的文件（进程被杀 / 磁盘满）不能拿来当产物 */
    char path[600];
    snprintf(path, sizeof(path), "%s/%s.bin", dir, key);
    CHECK(dump(path, "MCC1", 4) == 0, "手工截断缓存文件");
    CHECK(cache_load(dir, key, bid, &out, &olen) < 0, "截断文件视为无效");
    free(out); out = NULL;

    /* 6. 载荷被改坏 -> CRC 抓到 */
    {
        CHECK(cache_save(dir, key, bid, payload, sizeof(payload)) == 0, "重写缓存");
        size_t n = 0;
        char *raw = slurp(path, &n);
        CHECK(raw && n == 32 + sizeof(payload), "文件长度 = 头 32 + 载荷 %u", (unsigned)sizeof(payload));
        if (raw) {
            raw[n - 1] ^= 0x5A;          /* 改载荷最后一个字节 */
            dump(path, raw, n);
            free(raw);
            CHECK(cache_load(dir, key, bid, &out, &olen) < 0, "载荷篡改被 CRC 抓到");
            free(out); out = NULL;
        }
    }

    /* 7. 条数上限：存 70 份后，能读出来的不超过 CACHE_MAX_ENTRIES */
    {
        int total = CACHE_MAX_ENTRIES + 6;
        for (int i = 0; i < total; i++) {
            char s2[300], k2[17];
            snprintf(s2, sizeof(s2), "%s#%d", src, i);
            cache_key(s2, strlen(s2), bid, k2);
            if (cache_save(dir, k2, bid, payload, sizeof(payload)) != 0)
                CHECK(0, "第 %d 份写入失败", i);
        }
        int alive = 0;
        for (int i = 0; i < total; i++) {
            char s2[300], k2[17];
            snprintf(s2, sizeof(s2), "%s#%d", src, i);
            cache_key(s2, strlen(s2), bid, k2);
            if (cache_load(dir, k2, bid, &out, &olen) == 0) { alive++; free(out); out = NULL; }
        }
        CHECK(alive <= CACHE_MAX_ENTRIES, "淘汰后只剩 %d 份（上限 %d）", alive, CACHE_MAX_ENTRIES);
    }

    printf("%s\n", fails ? "cache tests FAILED" : "cache tests passed");
    return fails ? 1 : 0;
}
