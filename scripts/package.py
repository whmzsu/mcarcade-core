#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
package.py —— 把 dist/ 里的发布二进制打成 out/mcarcade-core-<ver>-<stamp>.zip。

    python scripts/package.py                    # 版本从 build.zig.zon 读，时间戳取当前
    python scripts/package.py --stamp 20261031-1347
    python scripts/package.py --ver 0.10

做的事：
  1. 校验 dist/ 四个二进制齐全（缺一个就报错，不静默少打）
  2. 重算 dist/CHECKSUMS.txt（sha256 + 字节数，含 .info）
  3. 组装临时目录并压成 zip：
       <name>/arcade_libretro.dll / .so / _aarch64.so / .info
       <name>/android/arcade_libretro.so / .info     ← Android 要与桌面 Linux 同名，只能分目录
       <name>/README.md
       <name>/CHECKSUMS.txt
"""
import argparse
import hashlib
import os
import re
import shutil
import sys
import tempfile
import time
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
OUT = os.path.join(ROOT, "out")

# (dist 里的文件名, zip 里的相对路径)
FILES = [
    ("arcade_libretro.dll", "arcade_libretro.dll"),
    ("arcade_libretro.so", "arcade_libretro.so"),
    ("arcade_libretro_aarch64.so", "arcade_libretro_aarch64.so"),
    ("arcade_libretro_a55.so", "arcade_libretro_a55.so"),
    ("arcade_libretro.info", "arcade_libretro.info"),
    ("arcade_libretro_android.so", "android/arcade_libretro.so"),
]
# .info 要跟着 android so 一起进子目录
INFO_COPY = ("arcade_libretro.info", "android/arcade_libretro.info")


def read_version():
    zon = os.path.join(ROOT, "build.zig.zon")
    with open(zon, encoding="utf-8") as f:
        m = re.search(r'\.version\s*=\s*"([^"]+)"', f.read())
    if not m:
        sys.exit("build.zig.zon 里找不到 .version")
    return m.group(1)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_checksums(ver):
    lines = [f"mcarcade-core {ver}  sha256"]
    for name, _ in FILES:
        p = os.path.join(DIST, name)
        lines.append(f"{sha256(p)}  {name}  ({os.path.getsize(p)} bytes)")
    text = "\n".join(lines) + "\n"
    with open(os.path.join(DIST, "CHECKSUMS.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ver", default=None, help="版本号，默认取 build.zig.zon")
    ap.add_argument("--stamp", default=None, help="时间戳 YYYYMMDD-HHMM，默认当前")
    args = ap.parse_args()

    ver = args.ver or read_version()
    stamp = args.stamp or time.strftime("%Y%m%d-%H%M")

    missing = [n for n, _ in FILES if not os.path.isfile(os.path.join(DIST, n))]
    if missing:
        sys.exit("dist/ 缺文件：" + ", ".join(missing) + "\n先跑 zig build release -Dndk=...")

    sums = write_checksums(ver)
    print("CHECKSUMS.txt:")
    print(sums.rstrip())

    base = f"mcarcade-core-{ver}-{stamp}"
    os.makedirs(OUT, exist_ok=True)
    zpath = os.path.join(OUT, base + ".zip")

    with tempfile.TemporaryDirectory() as td:
        stage = os.path.join(td, base)
        for src, rel in FILES + [INFO_COPY]:
            dst = os.path.join(stage, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(os.path.join(DIST, src), dst)
        shutil.copy2(os.path.join(ROOT, "README.md"), os.path.join(stage, "README.md"))
        shutil.copy2(os.path.join(DIST, "CHECKSUMS.txt"), os.path.join(stage, "CHECKSUMS.txt"))

        with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for dirpath, _, names in os.walk(stage):
                for n in sorted(names):
                    full = os.path.join(dirpath, n)
                    rel = os.path.relpath(full, td).replace(os.sep, "/")
                    z.write(full, rel)

    total = sum(i.file_size for i in zipfile.ZipFile(zpath).infolist())
    print(f"\n{os.path.relpath(zpath, ROOT)}")
    print(f"  压缩后 {os.path.getsize(zpath):,} 字节 / 解开 {total:,} 字节")
    print(f"  sha256 {sha256(zpath)}")


if __name__ == "__main__":
    main()
