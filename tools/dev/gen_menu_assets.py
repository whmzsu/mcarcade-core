#!/usr/bin/env python3
"""
从 pxt-common-packages 的原始资源生成 js/menu_assets.js：

  build/font8.txt          -> pxt font8 字形（8x8，ASCII 32..126）
  build/systemmenuicons.ts -> 三张卡片 + 六个图标（img` ` 十六进制位图）

用法： python tools/gen_menu_assets.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "build", "font8.txt")
ICONS = os.path.join(ROOT, "build", "systemmenuicons.ts")
OUT = os.path.join(ROOT, "js", "menu_assets.js")

WANT = [
    "CARD_NORMAL", "CARD_SELECTED", "CARD_ACTIVE",
    "VOLUME_DOWN_ICON", "VOLUME_UP_ICON", "STATS_ICON",
    "CONSOLE_ICON", "SLEEP_ICON", "CLOSE_MENU_ICON",
]


def parse_font():
    txt = open(FONT, encoding="utf-8").read()
    glyphs = {}
    for m in re.finditer(r"\* '(.*?)' (\d+)\n(.*?)(?=\n\* |\Z)", txt, re.S):
        ch, code, body = m.group(1), int(m.group(2)), m.group(3)
        rows = [r for r in body.split("\n") if r.strip(" .#")]
        rows = [r for r in body.strip("\n").split("\n") if r.strip()]
        bits = []
        for r in rows:
            v = 0
            for i, t in enumerate(r.split()):
                if t == "#":
                    v |= 1 << (7 - i)
            bits.append(v)
        bits = bits[:8] + [0] * (8 - len(bits))
        glyphs[code] = bits
    return glyphs


def parse_images():
    src = open(ICONS, encoding="utf-8").read()
    out = {}
    for m in re.finditer(r"export const (\w+) = img`([^`]*)`", src):
        name, body = m.group(1), m.group(2)
        if name not in WANT:
            continue
        rows = [r.split() for r in body.strip("\n").split("\n") if r.strip()]
        w = len(rows[0])
        h = len(rows)
        data = "".join(("0" if t == "." else t) for r in rows for t in r)
        out[name] = (w, h, data)
    return out


def main():
    glyphs = parse_font()
    imgs = parse_images()

    font_hex = "".join(
        "%02x" % b for code in range(32, 127) for b in glyphs.get(code, [0] * 8)
    )

    lines = []
    lines.append("/* 自动生成，勿手改（见 tools/gen_menu_assets.py）")
    lines.append(" * 数据来源：pxt-common-packages scripts/font-compiler/src/font8.txt")
    lines.append(" *           pxt-common-packages libs/game/systemmenuicons.ts")
    lines.append(" */")
    lines.append("(function (root, factory) {")
    lines.append('  if (typeof module === "object" && module.exports) module.exports = factory();')
    lines.append("  else root.MenuAssets = factory();")
    lines.append('})(typeof self !== "undefined" ? self : this, function () {')
    lines.append('  "use strict";')
    lines.append("  // font8：ASCII 32..126，每个字形 8 行 × 8 位，按行高频在前")
    lines.append('  var FONT8 = "%s";' % font_hex)
    lines.append("  // 图片：w/h + 每像素一个十六进制调色板下标（0 = 透明）")
    lines.append("  var IMGS = {")
    for name in WANT:
        if name not in imgs:
            continue
        w, h, data = imgs[name]
        lines.append('    %s: { w: %d, h: %d, d: "%s" },' % (name, w, h, data))
    lines.append("  };")
    lines.append("  return { font8: FONT8, imgs: IMGS };")
    lines.append("});")
    lines.append("")

    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines))
    print("wrote %s (%d bytes), %d glyphs, %d images"
          % (OUT, os.path.getsize(OUT), len(glyphs), len(imgs)))


if __name__ == "__main__":
    main()
