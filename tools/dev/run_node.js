/*
 * run_node.js —— 在 Node 里跑卡带，导出截图，用于没有 RetroArch 时的联调。
 *   node tools/run_node.js <cart.png> [out.png] [frames] [--press=A:A@10-20,...]
 */
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");
const H = require("../lib/host.js");

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngWrite(file, w, h, rgba, scale = 1) {
  const W = w * scale, Hh = h * scale;
  const raw = Buffer.alloc(W * Hh * 4 + Hh);
  for (let y = 0; y < Hh; y++) {
    raw[y * (W * 4 + 1)] = 0;
    const sy = (y / scale) | 0;
    for (let x = 0; x < W; x++) {
      const sx = (x / scale) | 0;
      const si = (sy * w + sx) * 4, di = y * (W * 4 + 1) + 1 + x * 4;
      raw[di] = rgba[si]; raw[di + 1] = rgba[si + 1]; raw[di + 2] = rgba[si + 2]; raw[di + 3] = 255;
    }
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const t = Buffer.from(type, "latin1");
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, body])));
    return Buffer.concat([len, t, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(Hh, 4); ihdr[8] = 8; ihdr[9] = 6;
  const out = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, out);
}

function main() {
  const args = process.argv.slice(2);
  if (!args[0]) { console.log("usage: node tools/run_node.js <cart.png> [out.png] [frames]"); return 1; }
  const cartPath = args[0];
  const outPath = args[1] && !args[1].startsWith("--") ? args[1] : "build/shot.png";
  const frames = parseInt(args[2] || "90", 10);
  const buf = fs.readFileSync(cartPath);

  console.log("cartridge:", path.basename(cartPath), buf.length, "bytes");
  const cart = H.decodeCartridge(buf);
  console.log("files:", Object.keys(cart.files).join(", "));
  console.log("main.ts:", cart.mainTs.split("\n").length, "lines");

  const rt = H.createRuntime({ log: (l, m) => console.log(`  [${l}] ${m}`) });
  const js = rt.load(cart.files);
  fs.writeFileSync("build/transpiled.js", js);
  console.log("transpiled:", js.length, "bytes");

  const SW = H.Arcade.SCREEN_W, SH = H.Arcade.SCREEN_H;
  const dt = 1000 / 30;
  let rgba = null;

  for (let f = 0; f < frames; f++) {
    // 简易自动玩家：主角下落且低于中线就点一下 A，用来验证物理/重叠/计分确实在运转
    const st = H.Arcade._debug();
    const player = st.sprites.find(s => s.kind === 1);
    const wantJump = !process.argv.includes("--nokeys") && !!(player && player._y > 58 && player.vy > 0);
    if (wantJump) rt.setButton("A", true); else rt.setButton("A", false);
    rt.tick(dt);
    rt.render();
    if (f === frames - 1 || f === Math.floor(frames / 2)) rgba = rt.rgba();
    if (f % 30 === 0) {
      console.log(`  f${f} sprites=${st.sprites.length} score=${st.score} over=${st.over}`);
    }
  }
  rgba = rt.rgba();
  // 统计非背景像素，判断画面是否真的有内容
  let nonBg = 0;
  for (let i = 0; i < SW * SH; i++) {
    const p = rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2];
    if (p !== 0) nonBg++;
  }
  console.log(`frame ${frames}: non-black pixels ${nonBg}/${SW * SH}`);
  pngWrite(outPath, SW, SH, rgba, 3);
  console.log("wrote", outPath);
  return 0;
}

process.exit(main());
