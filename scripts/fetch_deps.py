#!/usr/bin/env python3
"""
拉取/升级 third_party/ 里的第三方源码。

third_party/ 是**原样 vendored 入库**的（`git clone` 后直接能编，不需要联网）。
这个脚本只在两种情况下用：升级某个依赖的版本，或者本地误删了文件想补回来。

  third_party/quickjs/   quickjs-ng（MIT）—— JS 引擎
  third_party/miniz/     miniz（MIT）—— 只用 miniz_tinfl 解 PNG 的 zlib 流
  third_party/lzma/      LZMA SDK（公有领域）—— 解卡带里的 LZMA 流
  third_party/libretro/  libretro.h

用法： python3 scripts/fetch_deps.py [--force]
"""
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TP = os.path.join(ROOT, "third_party")

QJS_SHA = "7a23d8e3fedb010070ef1a03873c55500c7aa1a9"

GROUPS = [
    ("quickjs", "https://cdn.jsdelivr.net/gh/quickjs-ng/quickjs@%s/%%s" % QJS_SHA, [
        "quickjs.c", "quickjs.h", "quickjs-atom.h", "quickjs-opcode.h", "quickjs-c-atomics.h",
        "cutils.h", "dtoa.c", "dtoa.h", "libregexp.c", "libregexp.h", "libregexp-opcode.h",
        "libunicode.c", "libunicode.h", "libunicode-table.h", "list.h",
        "builtin-array-fromasync.h", "builtin-iterator-zip.h", "builtin-iterator-zip-keyed.h",
    ]),
    ("miniz", "https://cdn.jsdelivr.net/gh/richgel999/miniz@master/%s", [
        "miniz.h", "miniz_common.h", "miniz_tdef.h", "miniz_tinfl.h", "miniz_tinfl.c",
        "miniz_zip.h",
    ]),
    ("lzma", "https://cdn.jsdelivr.net/gh/ip7z/7zip@main/C/%s", [
        "LzmaDec.c", "LzmaDec.h", "7zTypes.h", "Precomp.h", "CpuArch.h",
    ]),
    ("libretro", "https://cdn.jsdelivr.net/gh/libretro/libretro-common@master/include/%s", [
        "libretro.h",
    ]),
]

MIRRORS = ["https://cdn.jsdelivr.net", "https://gcore.jsdelivr.net", "https://fastly.jsdelivr.net"]

STUB_MINIZ_EXPORT = """/* 上游 miniz_export.h 由构建系统生成，这里给个最小替身 */
#ifndef MINIZ_EXPORT
#define MINIZ_EXPORT
#endif
"""


def fetch(url):
    path = url.split("cdn.jsdelivr.net", 1)[1]
    last = None
    for i in range(len(MIRRORS) * 2):
        try:
            with urllib.request.urlopen(MIRRORS[i % len(MIRRORS)] + path, timeout=120) as r:
                return r.read()
        except Exception as e:
            last = e
    raise RuntimeError("download failed: %s (%s)" % (url, last))


def main():
    force = "--force" in sys.argv
    for name, pattern, files in GROUPS:
        d = os.path.join(TP, name)
        os.makedirs(d, exist_ok=True)
        for f in files:
            dst = os.path.join(d, f)
            if os.path.exists(dst) and not force and os.path.getsize(dst) > 0:
                continue
            data = fetch(pattern % f)
            if len(data) < 200:
                raise RuntimeError("suspiciously small file: %s (%d bytes)" % (f, len(data)))
            with open(dst, "wb") as fh:
                fh.write(data)
            print("  %-34s %8d bytes" % (name + "/" + f, len(data)))

    stub = os.path.join(TP, "miniz", "miniz_export.h")
    if force or not os.path.exists(stub):
        with open(stub, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(STUB_MINIZ_EXPORT)
        print("  miniz/miniz_export.h (本地 stub)")

    print("deps ok ->", TP)


if __name__ == "__main__":
    main()
