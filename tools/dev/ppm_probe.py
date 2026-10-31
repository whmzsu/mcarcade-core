#!/usr/bin/env python3
"""ppm_probe.py —— 从 core_test 输出的 PPM 里量出左右挡板的纵向位置。

    python3 tools/ppm_probe.py build/ping_up.ppm

只认 palette 里的红(255,33,33) 和深蓝(0,63,173)，ping 的两块挡板就是这两个颜色。
"""
import sys

RED = bytes((255, 33, 33))
BLUE = bytes((0, 63, 173))


def load(path):
    with open(path, "rb") as f:
        data = f.read()
    # P6\n<w> <h>\n255\n
    parts = data.split(b"\n", 3)
    assert parts[0] == b"P6", "not a P6 PPM"
    w, h = map(int, parts[1].split())
    px = parts[3]
    return w, h, px


def extent(px, w, h, color, xr):
    ys, xs = [], []
    for y in range(h):
        row = y * w * 3
        for x in xr:
            i = row + x * 3
            if px[i:i + 3] == color:
                ys.append(y)
                xs.append(x)
    if not ys:
        return None
    return min(ys), max(ys), min(xs), max(xs)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "build/ping_up.ppm"
    w, h, px = load(path)
    left = extent(px, w, h, RED, range(0, 12))
    right = extent(px, w, h, BLUE, range(w - 12, w))
    fmt = lambda e: "无" if not e else f"y {e[0]}..{e[1]}（中心 {(e[0] + e[1]) / 2:.1f}）"
    print(f"{path}: {w}x{h}")
    print(f"  左挡板(红) {fmt(left)}")
    print(f"  右挡板(蓝) {fmt(right)}")


if __name__ == "__main__":
    main()
