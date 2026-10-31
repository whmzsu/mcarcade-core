/*
 * menu_test.js —— 系统菜单功能自测（Node 路径，跑的是同一份 js/arcade.js）
 *
 *   node tools/menu_test.js
 *
 * 覆盖：暂停/恢复、导航夹紧、A 松开才执行、音量加减、STATS/CONSOLE 开关、B/MENU 关闭。
 */
const fs = require("fs");
const path = require("path");
const H = require("../lib/host.js");

const ROOT = path.dirname(__dirname);
const DT = 1000 / 60;

let fails = 0;
function ok(cond, label, extra) {
  const tag = cond ? "PASS" : "FAIL";
  if (!cond) fails++;
  console.log(`  [${tag}] ${label}${extra === undefined ? "" : "  (" + extra + ")"}`);
}

function boot(file) {
  const cart = H.decodeCartridge(fs.readFileSync(path.join(ROOT, file)));
  const rt = H.createRuntime({ log: () => { } });
  rt.load(cart.mainTs);
  return rt;
}

function frames(rt, n) { for (let i = 0; i < n; i++) { rt.tick(DT); rt.render(); } }
function tap(rt, key) { rt.setButton(key, true); frames(rt, 1); rt.setButton(key, false); frames(rt, 1); }
function st() { return H.Arcade._debug(); }

/* 通过左右移动把选中项挪到 n（菜单里左右 = ±1 格，到边即停） */
function seek(rt, n) {
  for (let i = 0; i < 12 && st().sysMenu.index !== n; i++)
    tap(rt, st().sysMenu.index < n ? "right" : "left");
}
function ball(rt) {
  const s = st().sprites.filter((s) => s.kind === 4 && s._alive);
  return s.length ? s[0].x : null;
}

console.log("ping.png / 菜单基本行为");
{
  const rt = boot("dist/ping.png");
  frames(rt, 30);
  const before = ball(rt);
  tap(rt, "menu");
  ok(st().sysMenu.open, "MENU 打开菜单");
  ok(st().sysMenu.index === 0, "默认选中第 0 张卡片");

  const x1 = ball(rt);
  frames(rt, 30);
  ok(ball(rt) === x1, "菜单打开时游戏暂停（球不移动）", `x=${x1}`);

  // 导航：先压到左边界，再一路向下压到底
  tap(rt, "left");
  ok(st().sysMenu.index === 0, "第 0 张再按左仍停在 0（不绕回）");
  for (let i = 0; i < 4; i++) tap(rt, "down");
  ok(st().sysMenu.index === 5, "连按 4 次下到下边界 5（不绕回）", st().sysMenu.index);
  tap(rt, "right");
  ok(st().sysMenu.index === 5, "下边界再按右仍停在 5");

  // A：按下只高亮，松开才执行（当前是 CLOSE，松开后菜单应关闭）
  rt.setButton("A", true); frames(rt, 2);
  ok(st().sysMenu.open === true, "A 按住时菜单仍在（未执行）");
  rt.setButton("A", false); frames(rt, 2);
  ok(st().sysMenu.open === false, "A 松开才执行 CLOSE");

  const x2 = ball(rt);
  frames(rt, 20);
  ok(ball(rt) !== x2, "关闭菜单后游戏继续（球又动了）");
}

console.log("音量 / STATS / CONSOLE / SLEEP");
{
  const rt = boot("dist/ping.png");
  frames(rt, 10);
  ok(st().volume === 20, "初始音量 20（pxt 默认）", st().volume);

  tap(rt, "menu");
  tap(rt, "right");           // VOLUME UP
  tap(rt, "A");
  ok(st().volume === 32, "VOLUME UP：20 -> 32");
  tap(rt, "A");
  ok(st().volume === 64, "VOLUME UP：32 -> 64");
  tap(rt, "left");            // VOLUME DOWN
  tap(rt, "A");
  ok(st().volume === 32, "VOLUME DOWN：64 -> 32");

  // 一路减到 0
  for (let i = 0; i < 3; i++) { tap(rt, "A"); }
  ok(st().volume === 0, "减到 0（静音）", st().volume);
  tap(rt, "right");           // 回到 VOLUME UP
  tap(rt, "A");
  ok(st().volume === 32, "0 之后按 + 回到 32");

  // 菜单里的卡片只能左右移动，用 seek 精确选到目标卡片
  seek(rt, 2);                // SHOW STATS
  tap(rt, "A");
  ok(st().showStats === true, "SHOW STATS 打开");
  tap(rt, "A");
  ok(st().showStats === false, "再按一次变 HIDE STATS");

  // CONSOLE
  seek(rt, 3);
  tap(rt, "A");
  ok(st().showConsole === true, "SHOW CONSOLE 打开");
  tap(rt, "A");
  ok(st().showConsole === false, "再按一次变 HIDE CONSOLE");

  // SLEEP 不崩、菜单保持打开
  seek(rt, 4);
  ok(st().sysMenu.index === 4, "选中 SLEEP");
  let threw = false;
  try { tap(rt, "A"); } catch (e) { threw = true; }
  ok(!threw && st().sysMenu.open, "SLEEP 空操作不报错、菜单不关");

  // B 关闭
  tap(rt, "B");
  ok(st().sysMenu.open === false, "B 关闭菜单");
}

console.log("游戏自己接管 MENU 时不弹我们的菜单");
{
  const rt = boot("tests/data/btnprobe.png");
  frames(rt, 5);
  tap(rt, "menu");
  ok(st().sysMenu.open === false, "btnprobe 注册了 controller.menu，START 直接转发给游戏");
}

console.log(fails === 0 ? "\n全部通过" : `\n有 ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
