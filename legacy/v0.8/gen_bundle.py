#!/usr/bin/env python3
"""
把 legacy/v0.8/js/ 下的 v0.8 手写层运行时打包成 C 源码（js_bundle.h）。

  python legacy/v0.8/gen_bundle.py [输出路径]

顺序固定：tsstrip.js -> menu_assets.js -> arcade.js -> glue.js
每个文件都是 UMD 形式，在 QuickJS 的全局 eval 里会挂到 globalThis 上。
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ["legacy/v0.8/js/tsstrip.js", "legacy/v0.8/js/menu_assets.js",
         "legacy/v0.8/js/arcade.js", "legacy/v0.8/js/glue.js"]


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "legacy", "v0.8", "js_bundle.h")
    parts = []
    for f in FILES:
        with open(os.path.join(ROOT, f), "r", encoding="utf-8") as fh:
            parts.append("/* ==== %s ==== */\n" % f + fh.read())
    bundle = "\n".join(parts)
    data = bundle.encode("utf-8")

    with open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("/* 自动生成，勿手改（见 scripts/bundle_js.py） */\n")
        fh.write("#ifndef ARCADE_JS_BUNDLE_H\n#define ARCADE_JS_BUNDLE_H\n\n")
        fh.write("static const unsigned char js_bundle[] = {\n")
        for i in range(0, len(data), 24):
            fh.write("  " + ",".join(str(b) for b in data[i:i + 24]) + ",\n")
        fh.write("  0\n};\n\n")
        fh.write("static const unsigned int js_bundle_len = %d;\n\n" % len(data))
        fh.write("#endif\n")
    print("wrote %s (%d bytes)" % (out_path, len(data)))


if __name__ == "__main__":
    main()
