// 在 Node 里用官方 pxsim + pxtc 编译产物跑一帧，验证整条链路
// 用法: node tools/dev/sim_run.js <binary.js> [--frames=30]
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const os = require("os");

const BUILD_ROOT = process.env.PXTBUILD || path.join(os.tmpdir(), "pxtbuild");
const PXTSIM = path.join(BUILD_ROOT, "node_modules/pxt-core/built/pxtsim.js");
const COMMON_SIM = path.join(BUILD_ROOT, "node_modules/pxt-arcade/built/common-sim.js");
const ARCADE_SIM = path.join(BUILD_ROOT, "node_modules/pxt-arcade/built/sim.js");

const binaryPath = process.argv[2];
const framesArg = process.argv.find(a => a.startsWith("--frames="));
const MAX_FRAMES = framesArg ? parseInt(framesArg.split("=")[1], 10) : 30;
if (!binaryPath) { console.error("usage: node sim_run.js <binary.js>"); process.exit(1); }

// ---------------- 最小 DOM ----------------
const screenShots = [];

function makeImageData(w, h) {
  return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
}

function makeCanvas(w, h) {
  const el = {
    tagName: "CANVAS", width: w || 0, height: h || 0,
    style: makeStyle(), dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, removeChild() {}, insertBefore() {},
    getBoundingClientRect() { return { width: el.width, height: el.height, left: 0, top: 0, right: el.width, bottom: el.height }; },
    setAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; },
  };
  const ctx2d = {
    canvas: el,
    imageSmoothingEnabled: true,
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, globalAlpha: 1,
    font: "10px monospace", textAlign: "left", textBaseline: "top",
    save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, setTransform() {}, resetTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    fill() {}, stroke() {}, clip() {},
    fillRect() {}, strokeRect() {}, clearRect() {},
    fillText() {}, strokeText() {}, measureText(t) { return { width: String(t).length * 6 }; },
    drawImage() {},
    createImageData(w2, h2) { return makeImageData(w2, h2); },
    getImageData(x, y, w2, h2) { return makeImageData(w2, h2); },
    putImageData(img) { screenShots.push(img); },
    createLinearGradient() { return { addColorStop() {} }; },
  };
  el.getContext = () => ctx2d;
  el._ctx = ctx2d;
  return el;
}

const EMPTY_LIST = { length: 0, item: () => null, forEach() {}, map: () => [] };

function makeStyle() {
  const s = {
    setProperty(k, v) { s[k] = v; },
    getPropertyValue(k) { return s[k] || ""; },
    removeProperty(k) { const v = s[k]; delete s[k]; return v || ""; },
  };
  return s;
}

function makeStubEl(tag) {
  const el = {
    tagName: String(tag || "DIV").toUpperCase(), style: makeStyle(), dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    children: [], childNodes: [], innerHTML: "", textContent: "", value: "",
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    appendChild(c) { el.children.push(c); return c; }, removeChild() {}, insertBefore() {}, replaceChild() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    getBoundingClientRect() { return { width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 }; },
    getElementsByClassName() { return EMPTY_LIST; },
    getElementsByTagName() { return EMPTY_LIST; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    focus() {}, blur() {}, click() {}, scrollIntoView() {},
    getContext() { return null; },
    parentElement: null, parentNode: null, nextSibling: null,
  };
  return el;
}

const GAME_SCREEN = makeCanvas(160, 120);

// Web Audio：官方 mixer 走 AudioContext，这一层最终要在 core 里换成真实音频输出
function makeAudioParam(v) {
  return {
    value: v || 0,
    setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; }, setTargetAtTime() { return this; },
    cancelScheduledValues() { return this; }, setValueCurveAtTime() { return this; },
  };
}
function makeAudioNode() {
  return {
    connect() { return this; }, disconnect() { return this; },
    gain: makeAudioParam(1), frequency: makeAudioParam(440), Q: makeAudioParam(1),
    detune: makeAudioParam(0), playbackRate: makeAudioParam(1), type: "square",
    onended: null, buffer: null, loop: false,
    start() {}, stop() {},
  };
}
function makeAudioContext() {
  const ctx = {
    sampleRate: 44100, currentTime: 0, state: "running",
    destination: makeAudioNode(),
    createGain: () => makeAudioNode(),
    createOscillator: () => makeAudioNode(),
    createBiquadFilter: () => makeAudioNode(),
    createDynamicsCompressor: () => makeAudioNode(),
    createBufferSource: () => makeAudioNode(),
    createChannelMerger: () => makeAudioNode(),
    createChannelSplitter: () => makeAudioNode(),
    createAnalyser: () => {
      const n = makeAudioNode();
      n.fftSize = 2048;
      n.frequencyBinCount = 1024;
      n.getByteTimeDomainData = a => a.fill(128);
      n.getByteFrequencyData = a => a.fill(0);
      n.getFloatTimeDomainData = a => a.fill(0);
      return n;
    },
    createStereoPanner: () => makeAudioNode(),
    createWaveShaper: () => makeAudioNode(),
    createDelay: () => makeAudioNode(),
    createConvolver: () => makeAudioNode(),
    createPanner: () => makeAudioNode(),
    createPeriodicWave: () => ({}),
    createScriptProcessor: () => makeAudioNode(),
    createBuffer: (ch, len, rate) => ({
      numberOfChannels: ch, length: len, sampleRate: rate, duration: len / rate,
      getChannelData: () => new Float32Array(len),
      copyToChannel() {},
    }),
    decodeAudioData: () => Promise.resolve({ duration: 0, getChannelData: () => new Float32Array(0) }),
    resume: () => Promise.resolve(), suspend: () => Promise.resolve(), close: () => Promise.resolve(),
  };
  return ctx;
}

const doc = {
  head: { appendChild() {} },
  body: { appendChild() {}, removeChild() {}, style: {} },
  documentElement: { style: makeStyle(), dataset: {} },
  createElement(tag) { return tag === "canvas" ? makeCanvas(0, 0) : makeStubEl(tag); },
  createElementNS(ns, tag) { return doc.createElement(tag); },
  createTextNode(t) { return { text: t }; },
  getElementById(id) {
    if (id === "game-screen") return GAME_SCREEN;
    return makeStubEl("div");
  },
  getElementsByClassName() { return EMPTY_LIST; },
  getElementsByTagName() { return EMPTY_LIST; },
  querySelector() { return makeStubEl("div"); },
  querySelectorAll() { return []; },
  createDocumentFragment() { return makeStubEl("fragment"); },
  addEventListener() {}, removeEventListener() {},
  readyState: "complete",
  location: { href: "http://localhost/", query: "", search: "" },
};

const listeners = {};
const win = {
  document: doc,
  location: doc.location,
  navigator: { userAgent: "node", maxTouchPoints: 0, onLine: true, platform: "node" },
  innerWidth: 960, innerHeight: 720, devicePixelRatio: 1,
  performance: { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 },
  addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
  removeEventListener() {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame(f) { return setTimeout(() => f(Date.now()), 16); },
  cancelAnimationFrame(id) { clearTimeout(id); },
  getComputedStyle() { return { getPropertyValue() { return ""; } }; },
  matchMedia() { return { matches: false, addListener() {}, addEventListener() {} }; },
  Image: function () { return makeCanvas(0, 0); },
  ImageData: function (w, h) { return makeImageData(w, h); },
  CanvasRenderingContext2D: function () {},
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  alert() {}, console,
};
win.window = win;
win.AudioContext = makeAudioContext;
win.webkitAudioContext = makeAudioContext;
win.btoa = s => Buffer.from(String(s), "binary").toString("base64");
win.atob = s => Buffer.from(String(s), "base64").toString("binary");
win.self = win;
win.globalThis = win;
win.parent = win;
win.top = win;

const sandbox = Object.assign({}, win);
sandbox.window = win;
sandbox.document = doc;
sandbox.console = console;
sandbox.setTimeout = setTimeout;
sandbox.clearTimeout = clearTimeout;
sandbox.setInterval = setInterval;
sandbox.clearInterval = clearInterval;
sandbox.Uint8ClampedArray = Uint8ClampedArray;
sandbox.Uint8Array = Uint8Array;
sandbox.ImageData = win.ImageData;
sandbox.Image = win.Image;
sandbox.performance = win.performance;
sandbox.requestAnimationFrame = win.requestAnimationFrame;
sandbox.cancelAnimationFrame = win.cancelAnimationFrame;
sandbox.navigator = win.navigator;
sandbox.localStorage = win.localStorage;
sandbox.matchMedia = win.matchMedia;
sandbox.getComputedStyle = win.getComputedStyle;
sandbox.AudioContext = makeAudioContext;
sandbox.webkitAudioContext = makeAudioContext;
sandbox.OfflineAudioContext = makeAudioContext;
sandbox.AudioBuffer = function(){};
sandbox.OscillatorNode = function(){};
sandbox.AudioBufferSourceNode = function(){};
sandbox.GainNode = function(){};
sandbox.AnalyserNode = function(){};
sandbox.AudioNode = function(){};
sandbox.AudioParam = function(){};
sandbox.TextEncoder = TextEncoder;
sandbox.TextDecoder = TextDecoder;
sandbox.URL = URL;
sandbox.btoa = s => Buffer.from(String(s), "binary").toString("base64");
sandbox.atob = s => Buffer.from(String(s), "base64").toString("binary");
sandbox.globalThis = sandbox;

vm.createContext(sandbox);

function loadInto(file, label) {
  const code = fs.readFileSync(file, "utf8");
  try {
    vm.runInContext(code, sandbox, { filename: label });
    console.log("  loaded", label, code.length, "bytes");
  } catch (e) {
    console.error("  FAIL loading", label, ":", e.message);
    console.error((e.stack || "").split("\n").slice(1, 4).join("\n"));
    process.exit(1);
  }
}

console.log("loading pxsim layers...");
loadInto(PXTSIM, "pxtsim.js");
loadInto(COMMON_SIM, "common-sim.js");
loadInto(ARCADE_SIM, "sim.js");

const pxsim = sandbox.pxsim;
console.log("pxsim =", typeof pxsim, " Runtime =", typeof pxsim.Runtime, " initCurrentRuntime =", typeof pxsim.initCurrentRuntime);

// ---------------- 启动 ----------------
const binaryJs = fs.readFileSync(binaryPath, "utf8");
const msg = {
  type: "run",
  id: "probe",
  code: binaryJs,
  boardDefinition: { name: "arcade", visual: { width: 160, height: 120 } },
  partDefinitions: {},
  parts: [],
  builtinParts: [],
  mute: true,
  light: false,
};

let rt;
try {
  rt = new pxsim.Runtime(msg);
  console.log("Runtime created. entry =", typeof rt.entry);
} catch (e) {
  console.error("Runtime FAILED:", e.message);
  console.error((e.stack || "").split("\n").slice(1, 8).join("\n"));
  process.exit(1);
}

let ticks = 0;
const t0 = Date.now();
try {
  rt.run(() => { console.log("  [toplevel code finished]"); });
  console.log("run() returned, running =", rt.running);
} catch (e) {
  console.error("run FAILED:", e.message);
  console.error((e.stack || "").split("\n").slice(1, 8).join("\n"));
  process.exit(1);
}

setTimeout(() => {
  console.log("after", Date.now() - t0, "ms: running =", rt.running, " dead =", rt.dead,
    " displayUpdates =", rt.numDisplayUpdates);
  report();
  process.exit(0);
}, 2000);

function report() {
  console.log("screen pushes:", screenShots.length);
  if (screenShots.length) {
    const img = screenShots[screenShots.length - 1];
    const nonBlack = countNonBlack(img);
    console.log("last frame:", img.width + "x" + img.height, "non-black px:", nonBlack);
    // 额外从 ScreenState 直接读一次，确认与 putImageData 一致
    const st = pxsim.runtime && pxsim.runtime.board && pxsim.runtime.board.screenState;
    if (st && st.screen) {
      console.log("screenState:", st.width + "x" + st.height, "bpp =", st.bpp ? st.bpp() : "?",
        "palette =", st.palette ? st.palette.length : "?");
    }
    const ppmPath = (process.argv.find(a => a.startsWith("--ppm=")) || "").split("=")[1];
    if (ppmPath) {
      writePPM(ppmPath, img);
      console.log("wrote", ppmPath);
    }
  }
}

function writePPM(file, img) {
  const { width: w, height: h, data } = img;
  const head = Buffer.from(`P6\n${w} ${h}\n255\n`, "ascii");
  const body = Buffer.alloc(w * h * 3);
  for (let i = 0, j = 0; i < w * h * 4; i += 4, j += 3) {
    body[j] = data[i]; body[j + 1] = data[i + 1]; body[j + 2] = data[i + 2];
  }
  fs.writeFileSync(file, Buffer.concat([head, body]));
}

function countNonBlack(img) {
  let n = 0;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 8 || d[i + 1] > 8 || d[i + 2] > 8) n++;
  }
  return n;
}
