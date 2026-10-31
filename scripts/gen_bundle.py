#!/usr/bin/env python3
"""
把 runtime/ 下的 JS + 官方 pxt sim 三层打包成 C 头文件。

  python scripts/gen_bundle.py [输出路径]      # 默认 build/gen/pxt_bundle.h

顺序（与 tools/dev/qjs_perf.js 验证过的一致，不能换）：
  1. runtime/timers.js           真实时间驱动时钟 + console 捕获
  2. runtime/dom_mock.js         DOM/WebAudio/TextEncoder 替身
  3. install 调用                installMockDom(globalThis)
  4. third_party/pxt-sim/pxtsim.js      pxt-core 官方 sim 基座
  5. third_party/pxt-sim/common-sim.js  pxt-arcade 公共 sim
  6. third_party/pxt-sim/sim.js         pxt-arcade 游戏 sim（screen/board/buttons）
  7. runtime/audio.js            官方 AudioContextManager 出口 → 44.1kHz 离线渲染
  8. runtime/glue.js             arcade_boot/step/rgba/set_button/audio 入口
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FILES = [
    "runtime/timers.js",
    "runtime/dom_mock.js",
    "third_party/pxt-sim/pxtsim.js",
    "third_party/pxt-sim/common-sim.js",
    "third_party/pxt-sim/sim.js",
    "runtime/audio.js",
    "runtime/glue.js",
]

INSTALL_SNIPPET = "var __env = installMockDom(globalThis, { width: 160, height: 120 });\n"

HEADER = """/* 自动生成，勿手改（见 scripts/gen_bundle.py）
 *
 * 内容 = runtime/*.js + third_party/pxt-sim/*.js 的顺序拼接，作为 C 字节数组
 * 交给 QuickJS 一次性 eval。
 */
#ifndef ARCADE_PXT_BUNDLE_H
#define ARCADE_PXT_BUNDLE_H

"""


def main():
    """
    两种调用方式：
      gen_bundle.py <out.h>         指定头文件路径
      gen_bundle.py --outdir <dir>  写到 <dir>/pxt_bundle.h（zig build 用这个）
    """
    args = sys.argv[1:]
    # --dep <path>：仅供 zig 把输入文件算进缓存键，脚本自己不用（见 build.zig genBundle）
    while "--dep" in args:
        i = args.index("--dep")
        del args[i:i + 2]
    out_dir_arg = None
    if "--outdir" in args:
        i = args.index("--outdir")
        out_dir_arg = args[i + 1]
        del args[i:i + 2]
    if out_dir_arg:
        out_path = os.path.join(out_dir_arg, "pxt_bundle.h")
    elif args:
        out_path = args[0]
    else:
        out_path = os.path.join(ROOT, "build", "gen", "pxt_bundle.h")

    out_dir = os.path.dirname(os.path.abspath(out_path))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    parts = []
    total = 0
    for f in FILES:
        with open(os.path.join(ROOT, f), "r", encoding="utf-8") as fh:
            content = fh.read()
        total += len(content.encode("utf-8"))
        parts.append("/* ==== %s ==== */\n" % f + content)
        # dom_mock 之后紧接 install 调用
        if f.endswith("dom_mock.js"):
            parts.append("/* ==== install mock dom ==== */\n" + INSTALL_SNIPPET)
    bundle = "\n".join(parts)
    data = bundle.encode("utf-8")

    with open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(HEADER)
        fh.write("static const unsigned char pxt_bundle[] = {\n")
        for i in range(0, len(data), 24):
            fh.write("  " + ",".join(str(b) for b in data[i:i + 24]) + ",\n")
        fh.write("  0\n};\n\n")
        fh.write("static const unsigned int pxt_bundle_len = %d;\n\n" % len(data))
        fh.write("#endif\n")
    print("wrote %s (%d bytes, sources %d bytes)" % (out_path, len(data), total))


if __name__ == "__main__":
    main()
