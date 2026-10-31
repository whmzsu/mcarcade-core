/*
 * cart.js —— 卡带解码（Node 侧；C 核心里有等价实现 src/cart.c）
 *
 *   pngDecode(缓冲区)        -> {w, h, rgba}
 *   decodeCartridge(缓冲区)   -> {files, mainTs, proj, source}
 *
 * PNG 里藏的是 pxt 工程源码：缩略图像素最低位（magic 0x59347a7d），
 * 可能是裸 JSON，也可能是 LZMA-alone 压缩流（Node 没内置 lzma，借 python 解）。
 *
 * 只依赖 zlib / child_process，不牵扯任何运行时实现 —— tools/cart_build.js 只要这一层。
 */
const zlib = require("zlib");
const { execFileSync } = require("child_process");

// ---------- 最小 PNG 解码（8bit RGB/RGBA，非隔行） ----------
function pngDecode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");
  let pos = 8, idat = [], w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const typ = buf.toString("latin1", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (typ === "IHDR") {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4);
      depth = body[8]; ctype = body[9]; interlace = body[12];
    } else if (typ === "IDAT") idat.push(body);
    else if (typ === "IEND") break;
  }
  if (depth !== 8 || interlace !== 0 || (ctype !== 2 && ctype !== 6))
    throw new Error(`unsupported png depth=${depth} ctype=${ctype}`);
  const ch = ctype === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const line = Buffer.from(raw.subarray(p, p + stride)); p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      if (f === 1) line[i] = (line[i] + a) & 255;
      else if (f === 2) line[i] = (line[i] + b) & 255;
      else if (f === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    const o = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (ch === 4) line.copy(out, o + x * 4, x * 4, x * 4 + 4);
      else { out[o + x * 4] = line[x * 3]; out[o + x * 4 + 1] = line[x * 3 + 1]; out[o + x * 4 + 2] = line[x * 3 + 2]; out[o + x * 4 + 3] = 255; }
    }
    prev = line;
  }
  return { w, h, rgba: out };
}

const MAGIC = 0x59347a7d;
const HDR = 36;

function decodeCartridge(buf) {
  const { w, h, rgba } = pngDecode(buf);
  const d = rgba;
  const bpp = (d[0] & 1) | ((d[1] & 1) << 1) | ((d[2] & 1) << 2);
  if (bpp === 0 || bpp > 5) throw new Error("invalid encoded png");

  function dec(ptr, bits, n) {
    let shift = 0, acc = 0;
    const mask = (1 << bits) - 1;
    const out = Buffer.alloc(n);
    let i = 0;
    while (i < n) {
      acc |= (d[ptr++] & mask) << shift;
      if ((ptr & 3) === 3) ptr++;
      shift += bits;
      if (shift >= 8) { out[i++] = acc & 0xff; acc >>= 8; shift -= 8; }
    }
    return [ptr, out];
  }

  let [ptr, hd] = dec(4, bpp, HDR);
  const magic = hd.readUInt32LE(0), blobLen = hd.readUInt32LE(4), added = hd.readUInt32LE(8);
  if (magic !== MAGIC) throw new Error("invalid magic 0x" + magic.toString(16));
  let blob;
  if (added > 0) {
    const origSize = (h - added) * w;
    const imgCap = ((origSize - 1) * 3 * bpp) >> 3;
    const [, tmp] = dec(ptr, bpp, imgCap - HDR);
    const moreLen = blobLen - tmp.length;
    const [, more] = dec(origSize * 4, 8, moreLen);
    blob = Buffer.concat([tmp, more]);
  } else {
    blob = dec(ptr, bpp, blobLen)[1];
  }
  let text = blob.toString("utf8");
  if (text[0] !== "{") {
    // LZMA-alone：交给 python(lzma) 解，Node 自带模块没有 lzma
    const tmp = require("os").tmpdir() + "/cart_" + Date.now() + ".lzma";
    require("fs").writeFileSync(tmp, blob);
    const out = execFileSync("python", ["-c",
      "import sys,lzma;sys.stdout.buffer.write(lzma.decompress(open(sys.argv[1],'rb').read()))", tmp]);
    require("fs").unlinkSync(tmp);
    text = out.toString("utf8");
  }
  const proj = JSON.parse(text);
  const files = JSON.parse(proj.source);
  const mainTs = files["main.ts"];
  if (!mainTs) throw new Error("no main.ts in cartridge");
  return { files, mainTs, proj, source: proj.source };
}

module.exports = { pngDecode, decodeCartridge };
