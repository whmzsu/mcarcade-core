// PPM(P6) -> PNG，可选放大倍数；支持一次处理多个文件
const fs = require("fs"), zlib = require("zlib");
let T = [];
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
function crc32(buf) { let c = 0xFFFFFFFF; for (const x of buf) c = T[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(t, d) { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const ty = Buffer.from(t, "ascii"); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([ty, d]))); return Buffer.concat([l, ty, d, c]); }
function convert(inp, outp, s) {
  s = s || 1;
  const b = fs.readFileSync(inp);
  const m = b.slice(0, 64).toString("ascii").match(/P6\n(\d+) (\d+)\n255\n/);
  const w = +m[1], h = +m[2], off = m[0].length;
  const raw = Buffer.alloc((w * s * 3 + 1) * h * s);
  for (let y = 0; y < h * s; y++) {
    const sy = (y / s) | 0; raw[y * (w * s * 3 + 1)] = 0;
    for (let x = 0; x < w * s; x++) {
      const sx = (x / s) | 0, si = off + (sy * w + sx) * 3, di = y * (w * s * 3 + 1) + 1 + x * 3;
      raw[di] = b[si]; raw[di + 1] = b[si + 1]; raw[di + 2] = b[si + 2];
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w * s, 0); ihdr.writeUInt32BE(h * s, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(outp, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
const scale = +(process.env.SCALE || 1);
for (const f of process.argv.slice(2)) convert(f, f.replace(/\.ppm$/, ".png"), scale);
