#!/usr/bin/env node
/*
 * probe_pxt.js —— 在 Node 沙箱里加载官方 runtime，逐层暴露缺失的 shim。
 *   node tools/dev/probe_pxt.js           只加载，报告第一个缺口
 *   node tools/dev/probe_pxt.js --stub    注入最小桩再加载
 *   node tools/dev/probe_pxt.js --trace   打印完整堆栈
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "../..");
const RUNTIME = path.join(ROOT, "build/pxt-runtime.js");
const STUB = process.argv.includes("--stub");
const TRACE = process.argv.includes("--trace");

const out = s => process.stdout.write(s + "\n");
const noop = () => {};

function makeCtx() {
  const ctx = {
    Math, Date, Array, Object, String, Number, Boolean, RegExp, Error, TypeError,
    RangeError, parseInt, parseFloat, isNaN, isFinite, Uint8Array, Int32Array,
    Float32Array, ArrayBuffer, DataView, Map, Set, Promise, Symbol, JSON,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
  };
  // pxt 会接管全局 console，这里给它一个独立的，避免污染宿主
  ctx.console = { log: noop, warn: noop, error: noop, info: noop, debug: noop,
    inspect: x => String(x), setPriority: noop, addListener: noop };
  ctx.globalThis = ctx;

  if (STUB) {
    // 最小 shim：让加载继续往下走，暴露下一个缺口
    ctx.control = {
      millis: () => Date.now() | 0,
      delay: noop, raiseEvent: noop, allocateNotifyEvent: () => 0,
      dmesg: noop, __log: noop, __phys: noop, gc: noop,
      profilingEnabled: () => false, enablePerfCounter: noop, dmesgPerfCounters: noop,
      _setPlayerKeys: noop, _setSystemKeys: noop, _setUserKeys: noop,
      _setImage: noop, _setPinEvents: noop, _setTimerEvents: noop,
      _waitForEvent: noop, _pollForEvent: noop, _enableFiber: noop,
      __queueEvent: noop, __pullEvent: () => -1,
      runInParallel: noop, runInBackground: noop,
    };
  }
  return ctx;
}

if (!fs.existsSync(RUNTIME)) {
  out("先运行: node tools/dev/build_pxt.js");
  process.exit(1);
}
const code = fs.readFileSync(RUNTIME, "utf8");
const SHIM = path.join(ROOT, "legacy/v0.8/js/pxt_shim.js");
const ctx = makeCtx();
vm.createContext(ctx);
if (fs.existsSync(SHIM)) {
  try {
    vm.runInContext(fs.readFileSync(SHIM, "utf8"), ctx, { filename: "pxt_shim.js" });
  } catch (e) {
    out("SHIM_FAIL: " + e.message);
    process.exit(3);
  }
}

const t0 = Date.now();
try {
  vm.runInContext(code, ctx, { filename: "pxt-runtime.js" });
  out(`LOAD_OK  (${Date.now() - t0} ms)`);
} catch (e) {
  out("LOAD_FAIL: " + e.message);
  const frames = (e.stack || "").split("\n").slice(1, TRACE ? 12 : 4);
  out(frames.join("\n"));
  process.exit(2);
}

const names = ["game", "scene", "sprites", "info", "controller", "music",
  "screen", "image", "tiles", "control", "Math", "helpers", "settings", "effects"];
for (const n of names) {
  const v = ctx[n];
  const desc = v === undefined ? "MISSING"
    : typeof v === "function" ? "function"
    : v && typeof v === "object" ? Object.keys(v).length + " members" : typeof v;
  out(n.padEnd(12) + desc);
}
out("Math.idiv = " + typeof (ctx.Math && ctx.Math.idiv));
