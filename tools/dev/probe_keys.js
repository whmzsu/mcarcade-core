/*
 * probe_keys.js —— 在 Node 里按住某个键，观察游戏里的精灵是否真的动起来。
 *   node tools/probe_keys.js <cart.png> <button> [from] [to] [frames]
 * 例：node tools/probe_keys.js dist/ping.png up 30 90 150
 */
const fs = require("fs");
const H = require("../lib/host.js");

const args = process.argv.slice(2);
const cartPath = args[0] || "dist/ping.png";
const btn = args[1] || "up";
const from = parseInt(args[2] || "30", 10);
const to = parseInt(args[3] || "90", 10);
const frames = parseInt(args[4] || "150", 10);

const cart = H.decodeCartridge(fs.readFileSync(cartPath));
const rt = H.createRuntime({ log: (l, m) => console.log(`  [${l}] ${m}`) });
rt.load(cart.mainTs);

const dt = 1000 / 30;
let prev = null;
let moved = 0;

for (let f = 0; f < frames; f++) {
  rt.setButton(btn, f >= from && f < to);
  rt.tick(dt);
  rt.render();
  const st = H.Arcade._debug();
  const players = st.sprites.filter(s => s.kind === 1);
  const cur = players.map(s => `${s.x.toFixed(1)},${s.y.toFixed(1)}`).join(" | ");
  if (prev !== null && prev !== cur) moved++;
  if (f % 10 === 0 || f === frames - 1) {
    console.log(`f${String(f).padStart(3)} ${f >= from && f < to ? "[" + btn + "]" : "     "} ${cur}`);
  }
  prev = cur;
}

// 按键处理器登记情况
const ctl = H.Arcade && H.Arcade._controllerDebug ? H.Arcade._controllerDebug() : null;
console.log("\n画面变动帧数:", moved, "/", frames);
if (ctl) console.log("已登记处理器:", JSON.stringify(ctl));
