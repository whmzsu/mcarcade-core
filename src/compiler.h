/*
 * compiler.h —— 内嵌 pxt 编译器（png → binary.js）
 *
 * 把卡带里的 TypeScript 工程，用官方 pxtc 编译成可被官方 runtime 直接执行的
 * binary.js。编译器本体（pxt_hack.js + target.json）以 LZMA 压缩后嵌在核心里。
 */
#ifndef ARCADE_COMPILER_H
#define ARCADE_COMPILER_H

#include <stddef.h>

/* 1 = 本次构建把编译器编进去了（zig build -Dincart_compiler=true） */
int compiler_is_embedded(void);

/*
 * 编译卡带工程。
 *   proj_json / proj_len : cart_load_png 得到的工程文件表 JSON
 *   out_js / out_len     : 成功时返回 malloc 的 binary.js（NUL 结尾），调用方 free
 *   log                  : 进度/诊断回调，可为 NULL
 *   err                  : 失败原因
 * 返回 0 成功。
 */
int compiler_build(const char *proj_json, size_t proj_len,
                   char **out_js, size_t *out_len,
                   void (*log)(const char *msg, void *ud), void *log_ud,
                   char *err, size_t errcap);

#endif
