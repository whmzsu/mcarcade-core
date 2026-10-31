#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
gen_compiler_bundle.py —— 把 pxt 编译器载荷打包成 C 头文件

载荷 = pxt_hack.js（自带 TypeScript 编译器）+ target.json（pxt-arcade 全部库源码）
     + nodeutil.js 及其同目录 require 链上的模块（几十 KB）

处理：逐个 LZMA 压缩（字典 4MB，解压内存可控），再写进 C 头。

编码用十六进制文本，而不是 \xNN 转义字面量：
转义虽然能让载荷在 .rdata 里只占 1.97MB（十六进制要 4MB），但 zig 0.17 的
`zig build-lib`（自托管链接器）遇到 2MB 级转义字面量会直接段错误，
`zig cc -c` 却编得过——换成十六进制就完全正常，所以这里选稳妥的那条。

输出：
    build/gen/pxt_compiler_bundle.h

用法：
    python scripts/gen_compiler_bundle.py --pxt-core <node_modules/pxt-core> \
                                          --pxt-arcade <node_modules/pxt-arcade>
"""
import argparse
import io
import lzma
import os
import re
import sys

# 这两个是入口，其余沿 require("./x") 递归收集
ENTRY = ["pxt-core/built/pxt_hack.js", "pxt-core/built/nodeutil.js"]
EXTRA = ["pxt-arcade/built/target.json"]

REQ = re.compile(r'require\(\s*["\'](\.{1,2}/[^"\']+)["\']\s*\)')

DICT_SIZE = 4 << 20


def collect(root_pairs):
    """root_pairs: [(逻辑前缀, 磁盘目录)]，返回 {逻辑名: 磁盘路径}"""
    files = {}

    def disk_of(name):
        for prefix, d in root_pairs:
            if name.startswith(prefix):
                return os.path.join(d, name[len(prefix):].replace("/", os.sep))
        return None

    def add(name):
        if name in files:
            return
        p = disk_of(name)
        if not p or not os.path.isfile(p):
            return
        files[name] = p
        if not name.endswith(".js"):
            return
        with io.open(p, encoding="utf-8", errors="replace") as f:
            body = f.read()
        base = os.path.dirname(name).replace(os.sep, "/")
        for m in REQ.finditer(body):
            dep = m.group(1)
            cand = os.path.normpath(os.path.join(base, dep)).replace(os.sep, "/")
            for c in (cand, cand + ".js", cand + ".json", cand + "/index.js"):
                p2 = disk_of(c)
                if p2 and os.path.isfile(p2):
                    add(c)
                    break

    for n in ENTRY + EXTRA:
        add(n)
    return files


def hexify(data):
    return "".join("%02x" % b for b in data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pxt-core", required=True)
    ap.add_argument("--pxt-arcade", required=True)
    ap.add_argument("--out", default=os.path.join("build", "gen", "pxt_compiler_bundle.h"))
    ap.add_argument("--runtime", default=os.path.join("runtime", "compiler.js"))
    args = ap.parse_args()

    pairs = [("pxt-core/", args.pxt_core), ("pxt-arcade/", args.pxt_arcade)]
    files = collect(pairs)
    if "pxt-core/built/pxt_hack.js" not in files:
        sys.exit("找不到 pxt_hack.js，--pxt-core 指错了？")
    if "pxt-arcade/built/target.json" not in files:
        sys.exit("找不到 target.json，--pxt-arcade 指错了？")

    filt = [{"id": lzma.FILTER_LZMA1, "dict_size": DICT_SIZE, "lc": 3, "lp": 0, "pb": 2,
             "mode": lzma.MODE_NORMAL, "nice_len": 273}]

    names = sorted(files)
    blobs = []
    raw_total = 0
    comp_total = 0
    for name in names:
        with open(files[name], "rb") as f:
            data = f.read()
        comp = lzma.compress(data, format=lzma.FORMAT_ALONE, filters=filt)
        blobs.append((name, hexify(comp), len(data)))
        raw_total += len(data)
        comp_total += len(comp)

    with io.open(args.runtime, encoding="utf-8") as f:
        glue = f.read()

    out_dir = os.path.dirname(os.path.abspath(args.out))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    W = 108
    with io.open(args.out, "w", encoding="utf-8", newline="\n") as o:
        o.write("/*\n * 由 scripts/gen_compiler_bundle.py 自动生成，请勿手改。\n *\n")
        o.write(" * pxt 编译器载荷：%d 个文件，原始 %.2f MB，LZMA 后 %.2f MB。\n"
                % (len(names), raw_total / 1048576.0, comp_total / 1048576.0))
        o.write(" * 数据以十六进制字符串存放，运行时 hex 解码后 LZMA 解压。\n */\n")
        o.write("#ifndef PXT_COMPILER_BUNDLE_H\n#define PXT_COMPILER_BUNDLE_H\n\n")

        o.write("typedef struct {\n")
        o.write("    const char *name;\n")
        o.write("    const char *hex;      /* LZMA-alone 数据的十六进制 */\n")
        o.write("    unsigned int hex_len;\n")
        o.write("    unsigned int raw_len; /* 解压后字节数（仅用于日志/统计） */\n")
        o.write("} pxt_asset;\n\n")

        for i, (name, hx, raw) in enumerate(blobs):
            o.write("static const char pxt_a%d_hex[] =\n" % i)
            for k in range(0, len(hx), W):
                o.write('"%s"\n' % hx[k:k + W])
            o.write(";\n")

        o.write("\nstatic const pxt_asset pxt_compiler_assets[] = {\n")
        for i, (name, hx, raw) in enumerate(blobs):
            o.write('    { "%s", pxt_a%d_hex, %d, %d },\n' % (name, i, len(hx), raw))
        o.write("};\n\n")
        o.write("static const unsigned int pxt_compiler_asset_count = %d;\n\n" % len(blobs))

        # 胶水本身不大（~23KB），不压缩，省一次解压。
        # 按**原始行**切，转义在切片之后做——否则会把 "\n" 这类转义序列切成两半。
        glue = glue.rstrip("\n") + "\n"     # 统一行尾，长度才好算准
        CHUNK = 160
        o.write("static const char pxt_compiler_js[] =\n")
        for line in glue.split("\n")[:-1]:
            k = 0
            while True:
                piece = line[k:k + CHUNK]
                k += CHUNK
                esc = piece.replace("\\", "\\\\").replace('"', '\\"')
                if k < len(line):
                    o.write('"%s"\n' % esc)
                else:
                    o.write('"%s\\n"\n' % esc)
                    break
        o.write(";\n")
        o.write("static const unsigned int pxt_compiler_js_len = %d;\n\n" % len(glue.encode("utf-8")))

        o.write("#endif /* PXT_COMPILER_BUNDLE_H */\n")

    # 十六进制转义后长度会有偏差（"\\n" 在 JS 里被转义成一个字符），这里按转义后字节数修正
    print("assets: %d files, raw %.2f MB -> lzma %.2f MB" % (len(names), raw_total / 1048576.0, comp_total / 1048576.0))
    for name, hx, raw in blobs:
        print("  %8d -> %7d  %s" % (raw, len(hx) // 2, name))
    print("glue: %d bytes -> %s" % (len(glue.encode("utf-8")), args.runtime))
    print("written: %s" % args.out)


if __name__ == "__main__":
    main()
