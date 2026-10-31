/*
 * host.js —— v0.8 手写运行时的 Node 宿主（只给 tools/dev/ 里的对照脚本用）。
 *
 *   createRuntime({log})   -> {load, tick, render, rgba, setButton, raw}
 *   Arcade / TsStrip       -> legacy/v0.8/js 里的两个模块（懒加载）
 *
 * 卡带解码已经拆到 ./cart.js：v0.9 的 tools/cart_build.js 只依赖那一层，
 * 不需要把 0.8 的 arcade.js 一起 require 进来。
 */
const path = require("path");
const { pngDecode, decodeCartridge } = require("./cart.js");

const LEGACY_DIR = path.join(__dirname, "../../legacy/v0.8/js");
let _legacy = null;

function legacy() {
  if (!_legacy) {
    global.MenuAssets = require(path.join(LEGACY_DIR, "menu_assets.js")); // arcade.js 画系统菜单要用
    _legacy = {
      Arcade: require(path.join(LEGACY_DIR, "arcade.js")),
      TsStrip: require(path.join(LEGACY_DIR, "tsstrip.js")),
    };
  }
  return _legacy;
}

function createRuntime(opts = {}) {
  const { Arcade } = legacy();
  const log = opts.log || ((lvl, m) => console.error("[" + lvl + "] " + m));
  let clock = 0;
  const rt = new Arcade.Runtime({
    log: (lvl, m) => log(lvl, m),
    warn: (m) => log("warn", m),
    now: () => clock,
    tone: opts.tone || (() => { }),
    audioStop: () => { },
    present: () => { }
  });
  // 让运行时的时间轴由 tick 推进
  rt._nowOverride = () => clock;
  return {
    load(source) {
      // 传整个 files 对象（含 .jres）或裸 main.ts 源码都行
      const js = rt.boot(source && typeof source === "object" ? JSON.stringify(source) : source);
      return js;
    },
    tick(dtMs) {
      clock += dtMs;
      rt.tick(dtMs);
    },
    get clock() { return clock; },
    render() { rt.render(); },
    rgba() { return rt.toRGBA(); },
    setButton(name, down) { rt.setButton(name, down); },
    raw: rt
  };
}

module.exports = {
  pngDecode,
  decodeCartridge,
  createRuntime,
  get Arcade() { return legacy().Arcade; },
  get TsStrip() { return legacy().TsStrip; },
};
