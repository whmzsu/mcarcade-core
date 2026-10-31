/*
 * cache.h —— 编译缓存（png 卡带的 binary.js 落盘复用）
 *
 * 缓存键 = 工程源码 + 内嵌编译器指纹，所以改了卡带或换了编译器都不会错命中。
 * 目录由调用方给（core.c 用存档目录），cache.c 只管读写和淘汰。
 */
#ifndef ARCADE_CACHE_H
#define ARCADE_CACHE_H

#include <stddef.h>
#include <stdint.h>

/* 缓存目录里最多保留几份产物（每份 1.7~2.6MB，64 份约 160MB）。超出按最久没用的删。 */
#define CACHE_MAX_ENTRIES 64

/*
 * 算缓存键：16 位小写十六进制，直接当文件名用。
 * src 是卡带的工程文件表（JSON），build_id 是编译器指纹（compiler_build_id()）。
 */
void cache_key(const char *src, size_t len, const char *build_id, char out[17]);

/*
 * 读缓存。
 *   0  命中，*out 返回 malloc 的 binary.js（NUL 结尾，调用方 free）
 *   1  没有这个键（正常的未命中）
 *  -1  文件在但不可信（头不对 / 长度不对 / CRC 不对 / 编译器指纹不符），当未命中处理
 */
int cache_load(const char *dir, const char *key, const char *build_id,
               char **out, size_t *out_len);

/*
 * 写缓存（先写 .tmp 再改名，中途被杀不会留半个文件），成功后顺带淘汰旧项。
 * 返回 0 成功，-1 失败（调用方只记日志，不影响游戏）。
 */
int cache_save(const char *dir, const char *key, const char *build_id,
               const char *src, size_t len);

/* 只保留最近使用的 CACHE_MAX_ENTRIES 份。只删自己命名的 <16 hex>.bin，不碰别的文件。 */
void cache_prune(const char *dir);

#endif /* ARCADE_CACHE_H */
