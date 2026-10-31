// 在真实 QuickJS 引擎（WASM 版）里跑官方 pxtsim + 卡带 binary.js，测启动耗时与每帧预算
// 用法: node tools/dev/qjs_perf.js <binary.js> [rounds] [--ppm=out.ppm]
const fs = require("fs");
const path = require("path");
const os = require("os");

const QJS_MOD = process.env.QJS_MOD || path.join(os.tmpdir(), "qjstest/node_modules/quickjs-emscripten");
const { getQuickJS } = require(QJS_MOD);

const BUILD_ROOT = process.env.PXTBUILD || path.join(os.tmpdir(), "pxtbuild");
const PXTSIM = path.join(BUILD_ROOT, "node_modules/pxt-core/built/pxtsim.js");
const COMMON_SIM = path.join(BUILD_ROOT, "node_modules/pxt-arcade/built/common-sim.js");
const ARCADE_SIM = path.join(BUILD_ROOT, "node_modules/pxt-arcade/built/sim.js");

const binaryPath = process.argv[2];
if (!binaryPath) { console.error("usage: node qjs_perf.js <binary.js> [rounds] [--ppm=out.ppm]"); process.exit(1); }
const ROUNDS = parseInt(process.argv[3] || "300", 10);
const PPM_OUT = (process.argv.find(a => a.startsWith("--ppm=")) || "").split("=")[1];

const now = () => Number(process.hrtime.bigint() / 1000n) / 1000;

const TIMERS = `
var __timers = [], __intervals = {}, __tid = 0, __now = 1000;
function setTimeout(fn, ms) { __timers.push(fn); return ++__tid; }
function clearTimeout(id) {}
function setInterval(fn, ms) { __intervals[++__tid] = fn; return __tid; }
function clearInterval(id) { delete __intervals[id]; }
function requestAnimationFrame(fn) { __timers.push(fn); return ++__tid; }
function cancelAnimationFrame(id) {}
function __pump(n) {
  var ran = 0;
  for (var i = 0; i < n; i++) {
    var batch = __timers; __timers = [];
    for (var j = 0; j < batch.length; j++) { batch[j](); ran++; }
    for (var k in __intervals) { __intervals[k](); ran++; }
    __now += 16.6667;              // 一轮 = 一帧 = 16.67ms，符合真实节奏
    if (!__timers.length && !Object.keys(__intervals).length) break;
  }
  return ran;
}
var performance = { now: function () { return __now; } };
var __logs = [];
var console = {
  log: function () { __logs.push(Array.prototype.join.call(arguments, " ")); },
  warn: function () { __logs.push("[warn] " + Array.prototype.join.call(arguments, " ")); },
  error: function () { __logs.push("[err] " + Array.prototype.join.call(arguments, " ")); },
  info: function () {}, debug: function () {}, trace: function () {},
  setPriority: function () {}, inspect: function (x) { return String(x); }
};
function __takeLogs() { var l = __logs; __logs = []; return l.slice(0, 15).join(" | "); }
`;

(async () => {
  const QuickJS = await getQuickJS();
  const rt = QuickJS.newRuntime({ maxStackSizeBytes: 4 << 20, maxMemoryBytes: 512 << 20 });
  const vm = rt.newContext();

  const evalStr = (code, label) => {
    const r = vm.evalCode(code, label);
    if (r.error) throw new Error(label + ": " + JSON.stringify(vm.dump(r.error)).slice(0, 400));
    const v = vm.dump(r.value);
    r.value.dispose();
    return v;
  };

  const evalFile = (file) => {
    const code = fs.readFileSync(file, "utf8");
    const t0 = now();
    evalStr(code, path.basename(file));
    const dt = now() - t0;
    console.log(`  ${path.basename(file).padEnd(16)} ${(code.length / 1024).toFixed(0).padStart(6)} KB  ${dt.toFixed(0).padStart(7)} ms`);
    return dt;
  };

  console.log("[quickjs] engine ready");
  evalStr(TIMERS, "timers.js");

  evalFile(path.join(__dirname, "../../runtime/dom_mock.js"));
  evalStr("var __env = installMockDom(globalThis, {width:160, height:120});", "install-dom.js");
  console.log("  [dom mock installed]");

  const tLoad = now();
  evalFile(PXTSIM);
  evalFile(COMMON_SIM);
  evalFile(ARCADE_SIM);
  const loadMs = now() - tLoad;
  console.log(`[quickjs] pxsim layers loaded in ${loadMs.toFixed(0)} ms`);

  const binary = fs.readFileSync(binaryPath, "utf8");
  const bstr = vm.newString(binary);
  vm.setProp(vm.global, "__binary", bstr);
  bstr.dispose();

  const tBoot = now();
  const entry = evalStr(`
    var __rt = new pxsim.Runtime({
      type: "run", id: "qjs", code: __binary,
      boardDefinition: { name: "arcade", visual: { width: 160, height: 120 } },
      partDefinitions: {}, parts: [], builtinParts: [], mute: true, light: false
    });
    __rt.run(function(){ __toplevelDone = true; });
    typeof __rt.entry;
  `, "boot.js");
  const bootMs = now() - tBoot;
  console.log(`[quickjs] entry = ${entry}`);
  console.log(`[quickjs] Runtime + binary.js compiled in ${bootMs.toFixed(0)} ms`);

  const tRun = now();
  let ticks = 0, jobs = 0, idle = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const r = vm.evalCode("__pump(1)", "pump.js");
    if (r.error) {
      console.error("[quickjs] pump failed at round " + i + ":", JSON.stringify(vm.dump(r.error)).slice(0, 300));
      console.error("logs:", evalStr("__takeLogs()", "logs"));
      break;
    }
    ticks += vm.dump(r.value);
    r.value.dispose();
    for (;;) {
      const jr = rt.executePendingJobs(2000);
      if (jr.error || !jr.value) break;
      jobs += jr.value;
    }
    const alive = evalStr("(__timers.length + Object.keys(__intervals).length)", "alive");
    if (!alive) { if (++idle > 5) break; } else idle = 0;
  }
  const runMs = now() - tRun;

  const frameCount = evalStr("__env.frameCount()", "frames");
  console.log("toplevel done  :", evalStr("(typeof __toplevelDone !== \"undefined\")", "td"));
  console.log("scene pushed   :", evalStr("(function(){try{return pxsim.runtime && pxsim.runtime.board ? String(!!pxsim.runtime.board.screenState) : 'noboard'}catch(e){return 'err:'+e.message}})()", "sc"));
  console.log("logs           :", evalStr("__takeLogs()", "lg"));
  try { console.log("palette[0..5]  :", evalStr("Array.prototype.map.call(pxsim.runtime.board.screenState.palette,function(v){return (v>>>0).toString(16)}).slice(0,6).join(",")", "pal")); } catch(e) {}
  try { console.log("pixel[0..4]    :", evalStr("Array.prototype.slice.call(pxsim.runtime.board.screenState.screen,0,5).map(function(v){return (v>>>0).toString(16)}).join(",")", "px")); } catch(e) {}

  console.log("");
  console.log("=== QuickJS (WASM) ===");
  console.log("rounds         :", ROUNDS);
  console.log("timer callbacks:", ticks, " microtask jobs:", jobs);
  console.log("wall time      :", runMs.toFixed(0), "ms");
  console.log("screen pushes  :", frameCount);
  if (frameCount > 0) {
    const per = runMs / frameCount;
    console.log("per frame      :", per.toFixed(2), "ms  =>", (1000 / per).toFixed(0), "fps");
  }
  console.log("boot total     :", (loadMs + bootMs).toFixed(0), "ms");

  const shot = evalStr(`
    (function(){
      var im = __env.lastImage();
      if (im && im.data && im.data.length) {
        var n = im.data.length, out = new Uint8Array((n / 4) * 3);
        for (var i = 0, j = 0; i < n; i += 4, j += 3) {
          out[j] = im.data[i]; out[j+1] = im.data[i+1]; out[j+2] = im.data[i+2];
        }
        return { w: im.width, h: im.height, src: "canvas", d: Array.prototype.slice.call(out),
          pal: Array.prototype.map.call(pxsim.runtime.board.screenState.palette, function (v) { return (v >>> 0).toString(16); }).join(","),
          px: Array.prototype.slice.call(pxsim.runtime.board.screenState.screen, 0, 4).map(function (v) { return (v >>> 0).toString(16); }).join(",") };
      }
      var st = pxsim.runtime.board.screenState;
      var s = st.screen, m = s.length, o2 = new Uint8Array(m * 3);
      for (var k = 0, q = 0; k < m; k++, q += 3) {
        var v = s[k];
        o2[q] = (v >> 16) & 255; o2[q+1] = (v >> 8) & 255; o2[q+2] = v & 255;
      }
      return { w: st.width, h: st.height, src: "screenState", d: Array.prototype.slice.call(o2) };
    })()
  `, "shot.js");

  if (shot && shot.d) {
    const data = Buffer.from(shot.d);
    let nonBlack = 0;
    for (let i = 0; i < data.length; i += 3) if (data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8) nonBlack++;
    console.log("last frame     :", shot.w + "x" + shot.h, "src=" + shot.src, "non-black:", nonBlack);
    if (shot.pal) console.log("palette        :", shot.pal);
    if (shot.px) console.log("pixel[0..3]    :", shot.px);
    if (PPM_OUT) {
      fs.writeFileSync(PPM_OUT, Buffer.concat([Buffer.from("P6\n" + shot.w + " " + shot.h + "\n255\n", "ascii"), Buffer.from(shot.d)]));
      console.log("wrote", PPM_OUT);
    }
  }

  vm.dispose();
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
