/*
 * probe_game.js —— 真机行为探针：加载卡带、走一段输入脚本、打印物理/菜单/计分状态。
 *   node tools/probe_game.js <cart.png> [frames]
 */
const fs = require("fs");
const H = require("../lib/host.js");

const cartPath = process.argv[2];
const total = parseInt(process.argv[3] || "240", 10);
const buf = fs.readFileSync(cartPath);
const cart = H.decodeCartridge(buf);
const logs = [];
const rt = H.createRuntime({ log: (l, m) => logs.push(`[${l}] ${m}`) });
rt.load(cart.files);

const A = H.Arcade._debug();
function dbg() {
  const st = H.Arcade._debug();
  const hero = st.sprites.find(s => s.kind === 1);
  const raw = rt.raw;
  return {
    hero: hero ? { x: +hero._x.toFixed(1), y: +hero._y.toFixed(1), vx: hero.vx, vy: +hero.vy.toFixed(1) } : null,
    hitBottom: hero ? hero.isHittingTile(4) : null,
    hitLeft: hero ? hero.isHittingTile(1) : null,
    hitRight: hero ? hero.isHittingTile(2) : null,
    cam: { x: Math.round(st.cam.x), y: Math.round(st.cam.y) },
    tilemap: st.tilemap ? { w: st.tilemap.width, h: st.tilemap.height } : null,
    score: st.score,
    sprites: st.sprites.length
  };
}

const dt = 1000 / 60;
let held = {};
function press(name, n) { held[name] = n; }

const script = [];
for (let i = 0; i < 5; i++) script.push({ at: 10 + i * 20, key: "A", tap: true });   // 关掉 3 条教学提示
script.push({ at: 200, key: "right", hold: 60 });
script.push({ at: 260, key: "A", tap: true });
script.push({ at: 300, key: "right", hold: 60 });
script.push({ at: 380, key: "A", tap: true });

for (let f = 0; f < total; f++) {
  for (const ev of script) {
    if (ev.at === f) {
      if (ev.hold) { rt.setButton(ev.key, true); (ev.releaseAt = f + ev.hold); }
      if (ev.tap) { rt.setButton(ev.key, true); ev.releaseAt = f + 3; }
    }
    if (ev.releaseAt === f) rt.setButton(ev.key, false);
  }
  rt.tick(dt);
  rt.render();
  if (f % 30 === 0 || f === total - 1) console.log(f, JSON.stringify(dbg()));
}
console.log("--- logs");
for (const l of logs) console.log(l);
