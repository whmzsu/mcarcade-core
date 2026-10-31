#!/usr/bin/env bash
# 交叉编译 Linux 版 libretro core（用 zig cc，无需 Linux 机器）
#   ./tools/build_linux.sh            两个架构都编
#   ./tools/build_linux.sh x86_64     只编一个
set -e
cd "$(dirname "$0")/.."

ZIG=${ZIG:-../tools/zig/node_modules/@oven/zig-win32-x64/zig.exe}
[ -f "$ZIG" ] || { echo "找不到 zig: $ZIG"; exit 1; }

PY=${PY:-python3}
INC="-Isrc -Ithird_party/quickjs -Ithird_party/miniz -Ithird_party/lzma -Ithird_party/libretro"
CFLAGS="-O2 -g -std=gnu99 -fPIC -fno-strict-aliasing -Wall -Wextra -Wno-unused-parameter -Wno-typedef-redefinition $INC"
SRC="src/core.c src/cart.c third_party/quickjs/quickjs.c third_party/quickjs/dtoa.c \
third_party/quickjs/libregexp.c third_party/quickjs/libunicode.c \
third_party/miniz/miniz_tinfl.c third_party/lzma/LzmaDec.c"

echo "[1/3] 生成 js 打包 src/js_bundle.h"
"$PY" scripts/bundle_js.py src/js_bundle.h

build_one() {
  local arch=$1 triple=$2 out=$3
  echo "[2/3] 编译 $arch ($triple) -> $out"
  # shellcheck disable=SC2086
  "$ZIG" cc -target "$triple" $CFLAGS -shared -o "$out" $SRC -lm -lpthread
  ls -l --time-style=full-iso "$out"
  md5sum "$out"
}

case "${1:-all}" in
  x86_64|amd64) build_one x86_64 x86_64-linux-gnu dist/arcade_libretro.so ;;
  aarch64|arm64) build_one aarch64 aarch64-linux-gnu dist/arcade_libretro_aarch64.so ;;
  all)
    build_one x86_64 x86_64-linux-gnu dist/arcade_libretro.so
    build_one aarch64 aarch64-linux-gnu dist/arcade_libretro_aarch64.so
    ;;
  *) echo "用法: $0 [all|x86_64|aarch64]"; exit 1 ;;
esac

echo "[3/3] 校验"
for f in dist/*.so; do
  printf "%-40s %s\n" "$f" "$(head -c 20 "$f" | od -An -c | tr -s ' ')"
done
echo "完成：$(date '+%Y-%m-%d %H:%M:%S')"
