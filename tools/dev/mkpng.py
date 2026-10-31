#!/usr/bin/env python3
"""
MakeCode Arcade PNG 卡带容器工具。

官方容器格式（出自 microsoft/pxt pxtlib/util.ts: encodeBlobAsync / decodeBlobAsync）：
  数据不是放在 PNG chunk 里，而是藏在像素的最低位（LSB 隐写）。
  - pixel0 的 R/G/B 最低位组成 bpp（1..4 bit/通道）
  - 从第 4 个字节开始，按 bpp 位一组把数据写进 R/G/B 通道（alpha 固定 0xff，跳过）
  - 前 36 字节为头：9 个小端 u32 = [magic, blobLen, addedLines, 0*6]
    magic = 0x59347a7d ('}z4Y')
  - 尾部若放不下，则整行新增到图片底部，用 8bit/字节 存放
  - blob 是工程 JSON（{"meta":..,"source":".."}），若不以 '{' 开头则是 LZMA-alone 压缩流

用法：
  python mkpng.py decode  game.png [-o project.json]
  python mkpng.py encode  project.json out.png [--lzma]
  python mkpng.py from-share 06042-66270-49137-36569 out.png [--lzma]
  python mkpng.py screenshot out.png W H          # 生成纯色测试底图
"""
import sys, os, json, zlib, struct, urllib.request

MAGIC = 0x59347A7D
HDR = 36


# ---------- 极简 PNG 读写（8bit, RGBA/RGB, 非隔行） ----------

def png_read(path_or_bytes):
    d = path_or_bytes
    if not isinstance(d, (bytes, bytearray)):
        d = open(path_or_bytes, "rb").read()
    assert d[:8] == b"\x89PNG\r\n\x1a\n", "not a png"
    pos, idat, w, h, bitdepth, ctype, interlace = 8, b"", 0, 0, 0, 0, 0
    while pos < len(d):
        ln = struct.unpack(">I", d[pos:pos + 4])[0]
        typ = d[pos + 4:pos + 8]
        body = d[pos + 8:pos + 8 + ln]
        pos += 12 + ln
        if typ == b"IHDR":
            w, h, bitdepth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", body)
        elif typ == b"IDAT":
            idat += body
        elif typ == b"IEND":
            break
    if bitdepth != 8 or interlace != 0 or ctype not in (2, 6):
        raise ValueError("unsupported png: depth=%d ctype=%d interlace=%d" % (bitdepth, ctype, interlace))
    ch = 3 if ctype == 2 else 4
    raw = zlib.decompress(idat)
    stride = w * ch
    out = bytearray(w * h * 4)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
        if f == 1:
            for i in range(ch, stride):
                line[i] = (line[i] + line[i - ch]) & 0xFF
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif f == 3:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif f == 4:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                b = prev[i]
                c = prev[i - ch] if i >= ch else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        elif f != 0:
            raise ValueError("bad filter %d" % f)
        o = y * w * 4
        if ch == 4:
            out[o:o + w * 4] = line
        else:
            for x in range(w):
                out[o + x * 4:o + x * 4 + 3] = line[x * 3:x * 3 + 3]
                out[o + x * 4 + 3] = 255
        prev = line
    return w, h, out


def png_write(path, w, h, rgba):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += rgba[y * w * 4:(y + 1) * w * 4]

    def chunk(typ, body):
        return struct.pack(">I", len(body)) + typ + body + struct.pack(">I", zlib.crc32(typ + body) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n"
    data += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    data += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)


# ---------- 隐写容器 ----------

def arcade_decode(png):
    w, h, d = png_read(png)
    bpp = (d[0] & 1) | ((d[1] & 1) << 1) | ((d[2] & 1) << 2)
    if bpp == 0 or bpp > 5:
        raise ValueError("invalid encoded png (bpp=%d)" % bpp)

    def dec(ptr, bits, n):
        shift = 0
        acc = 0
        mask = (1 << bits) - 1
        out = bytearray()
        while len(out) < n:
            acc |= (d[ptr] & mask) << shift
            ptr += 1
            if (ptr & 3) == 3:
                ptr += 1
            shift += bits
            if shift >= 8:
                out.append(acc & 0xFF)
                acc >>= 8
                shift -= 8
        return ptr, bytes(out)

    ptr, hd = dec(4, bpp, HDR)
    magic, blob_len, added = struct.unpack("<III", hd[:12])
    if magic != MAGIC:
        raise ValueError("invalid magic 0x%08x" % magic)
    if added > 0:
        orig_size = (h - added) * w
        img_cap = ((orig_size - 1) * 3 * bpp) >> 3
        _, tmp = dec(ptr, bpp, img_cap - HDR)
        _, more = dec(orig_size * 4, 8, blob_len - len(tmp))
        blob = tmp + more
    else:
        _, blob = dec(ptr, bpp, blob_len)
    return blob


def arcade_encode(rgba, w, h, blob):
    needed = HDR + len(blob)
    usable = (w * h - 1) * 3
    bpp = 1
    while bpp < 4:
        if usable * bpp >= needed * 8:
            break
        bpp += 1
    img_cap = (usable * bpp) >> 3
    missing = needed - img_cap
    added = 0
    if missing > 0:
        added = -(-missing // (w * 3))
    H = h + added
    img = bytearray(w * H * 4)
    img[:len(rgba)] = rgba
    for i in range(3, len(img), 4):
        img[i] = 255

    def enc(img, ptr, bits, data):
        """解码器的严格逆运算：把 data 摊成 LSB-first 位流，按 bits 位一组写进像素通道。"""
        mask = (1 << bits) - 1
        total = len(data) * 8
        pos = 0
        while pos < total:
            v = 0
            for k in range(bits):
                if pos + k < total:
                    byte = data[(pos + k) >> 3]
                    v |= ((byte >> ((pos + k) & 7)) & 1) << k
            if ptr + 1 >= len(img):
                break
            img[ptr] = (img[ptr] & ~mask) | (v & mask)
            ptr += 1
            if (ptr & 3) == 3:
                img[ptr] = 255
                ptr += 1
            pos += bits
        return ptr

    header = struct.pack("<9I", MAGIC, len(blob), added, 0, 0, 0, 0, 0, 0)
    ptr = enc(img, 0, 1, bytes([bpp]))
    ptr = enc(img, 4, bpp, header)
    if added == 0:
        enc(img, ptr, bpp, blob)
    else:
        first = img_cap - HDR
        enc(img, ptr, bpp, blob[:first])
        enc(img, w * h * 4, 8, blob[first:])
    return w, H, bytes(img)


# ---------- CLI ----------

def fetch_share(sid):
    url = "https://makecode.com/api/%s/text" % sid
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 1
    cmd = argv[1]
    if cmd == "decode":
        blob = arcade_decode(argv[2])
        try:
            txt = blob.decode("utf-8")
        except UnicodeDecodeError:
            import lzma
            txt = lzma.decompress(blob).decode("utf-8")
        out = json.loads(txt)
        src = json.loads(out["source"])
        print("files:", list(src.keys()))
        dst = argv[4] if len(argv) > 4 and argv[3] == "-o" else None
        if dst:
            open(dst, "w", encoding="utf-8").write(json.dumps(out, indent=1))
            print("wrote", dst)
        else:
            print(txt[:600])
        return 0

    if cmd == "from-share":
        files = fetch_share(argv[2])
        proj = {"meta": {"editor": "arcade", "name": argv[2]}, "source": json.dumps(files)}
        blob = json.dumps(proj).encode("utf-8")
        return _write_png(blob, argv[3], "--lzma" in argv)

    if cmd == "encode":
        proj = open(argv[2], "rb").read()
        return _write_png(proj, argv[3], "--lzma" in argv)

    if cmd == "screenshot":
        w, h = int(argv[3]), int(argv[4])
        rgba = bytearray(w * h * 4)
        for y in range(h):
            for x in range(w):
                o = (y * w + x) * 4
                rgba[o] = (x * 255 // w)
                rgba[o + 1] = (y * 255 // h)
                rgba[o + 2] = 64
                rgba[o + 3] = 255
        png_write(argv[2], w, h, rgba)
        return 0
    print(__doc__)
    return 1


def _write_png(blob, out, use_lzma):
    if use_lzma:
        import lzma
        blob = lzma.compress(blob, format=lzma.FORMAT_ALONE)
    # 320x240 的底图，和编辑器的卡带缩略图尺寸同量级
    w, h = 320, 240
    rgba = bytearray(w * h * 4)
    for y in range(h):
        for x in range(w):
            o = (y * w + x) * 4
            rgba[o] = 32 + (x * 60 // w)
            rgba[o + 1] = 40 + (y * 50 // h)
            rgba[o + 2] = 80
            rgba[o + 3] = 255
    w2, h2, img = arcade_encode(rgba, w, h, blob)
    png_write(out, w2, h2, img)
    # 自检：解回来验证
    back = arcade_decode(open(out, "rb").read())
    if back != blob:
        raise SystemExit("roundtrip mismatch! %d vs %d" % (len(back), len(blob)))
    print("wrote %s  (%dx%d, blob=%d bytes%s, bpp ok)" % (out, w2, h2, len(blob), ", lzma" if use_lzma else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
