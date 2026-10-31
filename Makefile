# 薄壳：全部转发到 zig build（真正的构建逻辑在 build.zig）
#
#   make                 本机平台核心 → zig-out/lib/
#   make release         全部发布目标（Windows x64 / Linux x64 / Linux aarch64 / Android aarch64）
#   make test            自检（卡带解析 + ping 90 帧）
#   make tools           只编自检程序
#   make deps            首次拉第三方源码
#   make cart PNG=...    卡带 → binary.js（等价 node tools/cart_build.js）
#   make clean
#
# 交叉编译直接透传：make ZIGARGS="-Dtarget=aarch64-linux-gnu"

ZIG ?= zig
ZIGARGS ?=
PY ?= python

.PHONY: all release test tools deps cart clean

all:
	$(ZIG) build $(ZIGARGS)

release:
	$(ZIG) build release $(ZIGARGS)

test:
	$(ZIG) build test $(ZIGARGS)

tools:
	$(ZIG) build tools $(ZIGARGS)

deps:
	$(PY) scripts/fetch_deps.py

cart:
	@test -n "$(PNG)" || (echo "用法: make cart PNG=卡带.png [OUT=out/名字/]"; exit 1)
	node tools/cart_build.js "$(PNG)" -o "$(or $(OUT),out/$(basename $(notdir $(PNG))))"

clean:
	rm -rf zig-out .zig-cache build
