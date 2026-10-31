/* cart_test.c —— 卡带解析自检：不依赖 RetroArch，直接用 C 把 .png 卡带读成 main.ts */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cart.h"

static unsigned char *read_file(const char *path, size_t *len)
{
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (n <= 0) { fclose(f); return NULL; }
    unsigned char *buf = (unsigned char *)malloc((size_t)n);
    if (!buf) { fclose(f); return NULL; }
    if (fread(buf, 1, (size_t)n, f) != (size_t)n) { free(buf); fclose(f); return NULL; }
    fclose(f);
    *len = (size_t)n;
    return buf;
}

int main(int argc, char **argv)
{
    if (argc < 2) {
        fprintf(stderr, "usage: %s <cart.png> [out.ts]\n", argv[0]);
        return 2;
    }
    size_t len = 0;
    unsigned char *buf = read_file(argv[1], &len);
    if (!buf) {
        fprintf(stderr, "cannot read %s\n", argv[1]);
        return 2;
    }

    cart_t cart;
    int rc = cart_load_png(buf, len, &cart);
    free(buf);

    if (rc != 0) {
        fprintf(stderr, "FAIL %s: %s\n", argv[1], cart.error);
        return 1;
    }

    printf("OK   %s: source = %u bytes (%s), first line: ", argv[1], (unsigned)cart.source_len,
           cart.source_is_json ? "project files" : "raw");
    for (size_t i = 0; i < cart.source_len && i < 60; i++) {
        char c = cart.source[i];
        putchar(c == '\n' ? ' ' : c);
    }
    printf("\n");

    if (argc > 2) {
        FILE *out = fopen(argv[2], "wb");
        if (out) {
            fwrite(cart.source, 1, cart.source_len, out);
            fclose(out);
            printf("     wrote %s\n", argv[2]);
        }
    }
    cart_free(&cart);
    return 0;
}
