/*
 * harness.js —— 在裸 QuickJS 里跑官方 pxtc 编译器（可行性探针，不进发布产物）
 *
 * 目的：验证「core 内嵌 png→js」到底能不能跑、跑得多慢、吃多少内存。
 * 这里刻意用最少的胶水：CommonJS 装载器 + node 内置模块的最小替身（读写仍走真实文件系统，
 * 换成虚拟 FS 只是把 __readFile 等换成本地查表，工作量固定）。
 *
 * 用法：qjsrun harness.js <pxt-core 目录> <pxt-arcade 目录> <卡带 json> <输出目录>
 */
"use strict";

var T0 = __now();
var TRACE_READS = true;   /* 打印编译器真正读取的每个文件（统计内嵌载荷用） */
if (TRACE_READS && typeof __readFile === "function") {
  var _rf0 = __readFile, _seen = {};
  globalThis.__readFile = function (p) {
    var k = String(p);
    if (k.indexOf("pxt_modules") < 0 && !_seen[k]) { _seen[k] = 1; print("[read] " + k); }
    return _rf0(p);
  };
}
var DEBUG_FS = false;   /* true 时打印 pxt.json / pxt_modules 的读写，排障用 */
function log(s) { print("[probe]" + (__now() - T0).toFixed(0) + "ms " + s); }

var ARGS = scriptArgs || [];
var CORE_DIR = ARGS[0];
var ARCADE_DIR = ARGS[1];
var CARD_JSON = ARGS[2];   /* 卡带里的工程文件表（cart_test 导出） */
var OUT_DIR = ARGS[3] || ".";
var WORK = ARGS[4] || CORE_DIR + "/../../cartwork";
var CWD = { v: WORK };   /* fs / path 的相对路径都按它解析 */

/* ---------------- 最小 Buffer ---------------- */
function utf8ToBytes(s) {
  var out = [], i, c;
  for (i = 0; i < s.length; i++) {
    c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0xd800 || c >= 0xe000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else { i++; c = 0x10000 + (((c & 0x3ff) << 10) | (s.charCodeAt(i) & 0x3ff)); out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
  }
  return out;
}
function bytesToUtf8(b) {
  var s = "", i = 0, c;
  while (i < b.length) {
    c = b[i++];
    if (c < 0x80) s += String.fromCharCode(c);
    else if (c < 0xe0) s += String.fromCharCode(((c & 31) << 6) | (b[i++] & 63));
    else if (c < 0xf0) s += String.fromCharCode(((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63));
    else { var cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63); cp -= 0x10000; s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff)); }
  }
  return s;
}
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function toBase64(b) {
  var s = "", i;
  for (i = 0; i + 2 < b.length; i += 3) {
    var n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (i + 1 === b.length) { var n1 = b[i] << 16; s += B64[(n1 >> 18) & 63] + B64[(n1 >> 12) & 63] + "=="; }
  else if (i + 2 === b.length) { var n2 = (b[i] << 16) | (b[i + 1] << 8); s += B64[(n2 >> 18) & 63] + B64[(n2 >> 12) & 63] + B64[(n2 >> 6) & 63] + "="; }
  return s;
}
function Buffer(arg, enc) {
  if (!(this instanceof Buffer)) return new Buffer(arg, enc);
  var src = typeof arg === "number" ? new Array(arg) : (typeof arg === "string" ? utf8ToBytes(arg) : arg);
  var u = new Uint8Array(src.length);
  for (var i = 0; i < src.length; i++) u[i] = src[i] & 255;
  return u;
}
Buffer.from = function (x, enc) {
  if (typeof x === "string") return new Uint8Array(utf8ToBytes(x));
  return new Uint8Array(x);
};
Buffer.alloc = function (n, fill) { var u = new Uint8Array(n); if (fill) u.fill(fill); return u; };
Buffer.isBuffer = function (o) { return o instanceof Uint8Array; };
Buffer.concat = function (list, n) {
  var total = 0, i;
  for (i = 0; i < list.length; i++) total += list[i].length;
  var u = new Uint8Array(n === undefined ? total : n), off = 0;
  for (i = 0; i < list.length && off < u.length; i++) { u.set(list[i].subarray(0, u.length - off), off); off += list[i].length; }
  return u;
};
Buffer.byteLength = function (s) { return typeof s === "string" ? utf8ToBytes(s).length : s.length; };

/* ---------------- path 替身（POSIX 语义，Windows 盘符照抄） ---------------- */
var P = (function () {
  function normAll(p) { return String(p).replace(/\\/g, "/"); }
  function split(p) { return normAll(p).split("/"); }
  function normalize(p) {
    var s = normAll(p), pre = "", abs = false;
    var m = /^([A-Za-z]:)?\//.exec(s);
    if (m) { pre = m[1] || ""; abs = true; s = s.slice(m[0].length); }
    var parts = s.split("/"), out = [];
    for (var i = 0; i < parts.length; i++) {
      var x = parts[i];
      if (!x || x === ".") continue;
      if (x === "..") { if (out.length && out[out.length - 1] !== "..") out.pop(); else if (!abs) out.push(".."); }
      else out.push(x);
    }
    var body = out.join("/");
    if (!abs) return body || ".";
    if (!pre) return "/" + body;
    return body ? pre + "/" + body : pre + "/";
  }
  function join() {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) if (arguments[i] !== "" && arguments[i] != null) parts.push(normAll(arguments[i]));
    var s = parts.join("/");
    return s ? normalize(s) : ".";
  }
  function resolve() {
    var cur = process.cwd(), parts = [];
    for (var i = 0; i < arguments.length; i++) {
      var a = normAll(arguments[i]);
      if (!a) continue;
      if (/^([A-Za-z]:)?\//.test(a)) { parts = [a]; } else parts.push(a);
    }
    return normalize(parts.length ? join.apply(null, parts) : cur);
  }
  function dirname(p) {
    var s = normalize(p);
    var i = s.lastIndexOf("/");
    if (i <= 0) return s.slice(0, 1) === "/" ? "/" : ".";
    return s.slice(0, i);
  }
  function basename(p, ext) {
    var s = normalize(p), b = s.slice(s.lastIndexOf("/") + 1);
    if (ext && b.slice(-ext.length) === ext) b = b.slice(0, -ext.length);
    return b;
  }
  function extname(p) {
    var b = basename(p), i = b.lastIndexOf(".");
    return i <= 0 ? "" : b.slice(i);
  }
  function relative(from, to) {
    var a = resolve(from).split("/").filter(Boolean), b = resolve(to).split("/").filter(Boolean), i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    var up = [];
    for (var k = i; k < a.length; k++) up.push("..");
    return up.concat(b.slice(i)).join("/") || "";
  }
  return {
    sep: "/", delimiter: ";", normalize: normalize, join: join, resolve: resolve, dirname: dirname,
    basename: basename, extname: extname, relative: relative, isAbsolute: function (p) { return /^([A-Za-z]:)?\//.test(String(p)); },
    parse: function (p) {
      var d = dirname(p), b = basename(p), e = extname(p);
      return { root: "", dir: d, base: b, ext: e, name: b.slice(0, b.length - e.length) };
    },
    format: function (o) { return join(o.dir || "", (o.name || "") + (o.ext || "")); },
    posix: null, win32: null
  };
})();
P.posix = P; P.win32 = P;

/* ---------------- fs 替身（读写真实文件） ---------------- */
var FS = (function () {
  /* node 的 fs 接受相对路径，按 process.cwd() 解析 */
  function R(p) { var s = String(p); return P.isAbsolute(s) ? s : P.resolve(CWD.v, s); }
  function statObj(p) {
    var s = __stat(R(p));
    if (!s) return null;
    return {
      size: s.size, mtimeMs: s.mtime, mode: s.dir ? 0o40000 : 0o100000,
      isDirectory: function () { return !!s.dir; },
      isFile: function () { return !s.dir; },
      isSymbolicLink: function () { return false; }
    };
  }
  var api = {
    existsSync: function (p) { return !!__stat(R(p)); },
    readFileSync: function (p, opt) {
      var s = __readFile(R(p));
      if (s === null || s === undefined) {
        var e = new Error("ENOENT: " + p); e.code = "ENOENT"; throw e;
      }
      var enc = typeof opt === "string" ? opt : (opt && opt.encoding);
      if (!enc || enc === "utf8" || enc === "utf-8" || enc === "ascii") return s;
      return Buffer.from(s);
    },
    writeFileSync: function (p, data) {
      var dst = R(p);
      __mkdirp(P.dirname(dst));
      __writeFile(dst, typeof data === "string" ? data : bytesToUtf8(data));
    },
    appendFileSync: function (p, data) {
      var old = __readFile(R(p)) || "";
      __writeFile(R(p), old + (typeof data === "string" ? data : bytesToUtf8(data)));
    },
    mkdirSync: function (p) { __mkdirp(R(p)); },
    readdirSync: function (p, opt) {
      var names = __readdir(R(p)) || [];
      if (opt && opt.withFileTypes) return names.map(function (n) {
        var st = statObj(R(p) + "/" + n);
        return { name: n, isDirectory: function () { return st && st.isDirectory(); }, isFile: function () { return st && st.isFile(); } };
      });
      return names;
    },
    statSync: function (p) {
      var s = statObj(p);
      if (!s) { var e = new Error("ENOENT: " + p); e.code = "ENOENT"; throw e; }
      return s;
    },
    lstatSync: function (p) { return api.statSync(p); },
    realpathSync: function (p) { return R(p); },
    unlinkSync: function () { },
    rmSync: function () { },
    renameSync: function (a, b) { var d = __readFile(R(a)); if (d !== null) api.writeFileSync(b, d); },
    copyFileSync: function (a, b) { var d = __readFile(R(a)); if (d !== null) api.writeFileSync(b, d); },
    readFile: function (p, opt, cb) {
      if (typeof opt === "function") { cb = opt; opt = null; }
      try { cb(null, api.readFileSync(p, opt)); } catch (e) { cb(e); }
    },
    writeFile: function (p, d, opt, cb) {
      if (typeof opt === "function") { cb = opt; }
      try { api.writeFileSync(p, d); if (cb) cb(null); } catch (e) { if (cb) cb(e); }
    },
    mkdir: function (p, opt, cb) {
      if (typeof opt === "function") cb = opt;
      api.mkdirSync(p); if (cb) cb(null);
    },
    readdir: function (p, opt, cb) {
      if (typeof opt === "function") { cb = opt; }
      try { cb(null, api.readdirSync(p)); } catch (e) { cb(e); }
    },
    stat: function (p, cb) { try { cb(null, api.statSync(p)); } catch (e) { cb(e); } },
    createReadStream: function () { throw new Error("createReadStream not supported"); },
    createWriteStream: function () { throw new Error("createWriteStream not supported"); },
    watch: function () { return { close: function () { } }; },
    constants: { F_OK: 0, R_OK: 4 }
  };
  api.promises = {
    readFile: function (p, o) { return Promise.resolve().then(function () { return api.readFileSync(p, o); }); },
    writeFile: function (p, d) { return Promise.resolve().then(function () { return api.writeFileSync(p, d); }); },
    mkdir: function (p) { api.mkdirSync(p); return Promise.resolve(); },
    readdir: function (p) { return Promise.resolve(api.readdirSync(p)); },
    stat: function (p) { return Promise.resolve(api.statSync(p)); },
    rm: function () { return Promise.resolve(); }
  };
  return api;
})();

/* ---------------- 其余 node 内置模块 ---------------- */
var OS = {
  tmpdir: function () { return "C:/Users/whmzs/AppData/Local/Temp"; },
  platform: function () { return "win32"; },
  EOL: "\n",
  cpus: function () { return [{}]; },
  homedir: function () { return "C:/Users/whmzs"; },
  release: function () { return "10.0"; },
  totalmem: function () { return 4 * 1024 * 1024 * 1024; },
  freemem: function () { return 2 * 1024 * 1024 * 1024; }
};

function makeHash() {
  var acc = 0, n = 0;
  return {
    update: function (d) {
      var s = typeof d === "string" ? d : bytesToUtf8(d);
      for (var i = 0; i < s.length; i += 97) acc = (acc * 31 + s.charCodeAt(i)) | 0;
      n += s.length; return this;
    },
    digest: function (enc) {
      var hex = ("00000000" + (acc >>> 0).toString(16)).slice(-8) + ("00000000" + n.toString(16)).slice(-8);
      if (enc === "base64") return toBase64(Buffer.from(hex));
      return hex;
    }
  };
}
var CRYPTO = {
  createHash: function () { return makeHash(); },
  createHmac: function () { return makeHash(); },
  randomBytes: function (n) { return new Uint8Array(n); },
  randomUUID: function () { return "00000000-0000-4000-8000-000000000000"; }
};

var UTIL = {
  inherits: function (a, b) { a.prototype = Object.create(b.prototype); a.prototype.constructor = a; },
  format: function () { return Array.prototype.slice.call(arguments).join(" "); },
  isArray: Array.isArray,
  promisify: function (fn) {
    return function () {
      var a = Array.prototype.slice.call(arguments);
      return new Promise(function (res, rej) { fn.apply(null, a.concat([function (e, v) { e ? rej(e) : res(v); }])); });
    };
  },
  types: { isDate: function (o) { return o instanceof Date; } },
  inspect: function (o) { try { return JSON.stringify(o); } catch (e) { return String(o); } },
  TextEncoder: typeof TextEncoder === "function" ? TextEncoder : undefined
};

var CHILD = {
  execSync: function () { return ""; },
  exec: function (c, o, cb) { if (cb) cb(null, "", ""); },
  spawn: function () { return { on: function () { }, stdout: { on: function () { } }, stderr: { on: function () { } } }; },
  spawnSync: function () { return { status: 0, stdout: "", stderr: "" }; }
};

var timerQueue = [];
var TIMERS = {
  setTimeout: function (cb) { timerQueue.push(cb); return timerQueue.length; },
  setInterval: function () { return 0; },
  clearTimeout: function () { },
  clearInterval: function () { },
  setImmediate: function (cb) { timerQueue.push(cb); return 0; }
};

/* ---------------- process / console ---------------- */
var process = {
  env: { NODE_ENV: "production", PXT_COMPILE_SWITCHES: "", PXTBUILD: "" },
  argv: ["qjs", "harness.js"],
  platform: "win32",
  versions: { node: "18.0.0" },
  version: "v18.0.0",
  cwd: function () { return CWD.v; },
  chdir: function (d) { CWD.v = P.resolve(CWD.v, d); },
  exit: function (c) { throw new Error("process.exit(" + c + ")"); },
  nextTick: function (cb) { timerQueue.push(cb); },
  hrtime: function () { return [Math.floor(__now() / 1000), 0]; },
  cpuUsage: function () { return { user: 0, system: 0 }; },
  uptime: function () { return __now() / 1000; },
  memoryUsage: function () { return { rss: 0, heapTotal: 0, heapUsed: 0 }; },
  stdout: { write: function (s) { print(s.replace(/\n$/, "")); return true; }, isTTY: false },
  stderr: { write: function (s) { print(s.replace(/\n$/, "")); return true; }, isTTY: false },
  on: function () { },
  emit: function () { },
  exitCode: 0
};

var console = {
  log: function () { print(Array.prototype.map.call(arguments, function (a) { return typeof a === "string" ? a : (function () { try { return JSON.stringify(a); } catch (e) { return String(a); } })(); }).join(" ")); },
  info: function () { console.log.apply(null, arguments); },
  warn: function () { console.log.apply(null, arguments); },
  error: function () { console.log.apply(null, arguments); },
  debug: function () { },
  trace: function () { },
  time: function () { }, timeEnd: function () { }, assert: function () { }
};

/* ---------------- CommonJS 装载器 ---------------- */
var cache = {};
var ZLIB = {
  deflateRawSync: function (b) { return b; },
  inflateRawSync: function (b) { return b; },
  gzipSync: function (b) { return b; },
  gunzipSync: function (b) { return b; },
  deflateSync: function (b) { return b; },
  inflateSync: function (b) { return b; },
  constants: { Z_BEST_COMPRESSION: 9 }
};
var NOHTTP = {
  get: function (u, cb) { if (cb) cb(new Error("no network in probe")); return { on: function () { } }; },
  request: function () { return { on: function () { }, end: function () { }, write: function () { } }; }
};
var BUILTINS = { fs: FS, path: P, os: OS, crypto: CRYPTO, util: UTIL, child_process: CHILD, zlib: ZLIB, http: NOHTTP, https: NOHTTP, "promise.prototype.finally": { shim: function () { } }, events: { EventEmitter: function () { this.on = function () { }; this.emit = function () { }; } }, stream: {}, buffer: { Buffer: Buffer }, url: { parse: function (s) { return { href: s }; } }, assert: function () { }, tty: {} };

function loadModule(full) {
  full = P.resolve(full);
  if (cache[full]) return cache[full].exports;
  var src = __readFile(full);
  if (src === null) throw new Error("MODULE_NOT_FOUND " + full);
  var m = { exports: {}, paths: [], filename: full, id: full, children: [] };
  cache[full] = m;
  var dir = P.dirname(full);
  var fn = new Function("exports", "require", "module", "__filename", "__dirname", "global", "process", "Buffer", "console", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "setImmediate", "TextEncoder", src + "\n//# sourceURL=" + full);
  fn.call(m.exports, m.exports, makeRequire(dir), m, full, dir, globalThis, process, Buffer, console, TIMERS.setTimeout, TIMERS.setInterval, TIMERS.clearTimeout, TIMERS.clearInterval, TIMERS.setImmediate, typeof TextEncoder === "function" ? TextEncoder : undefined);
  return m.exports;
}

function makeRequire(dir) {
  return function require(id) {
    if (BUILTINS.hasOwnProperty(id)) return BUILTINS[id];
    if (id.charAt(0) === "." || id.charAt(0) === "/" || /^[A-Za-z]:/.test(id)) {
      var full = P.resolve(dir, id);
      var cand = [full, full + ".js", full + ".json", full + "/index.js"];
      for (var i = 0; i < cand.length; i++) {
        if (__stat(cand[i]) && !__stat(cand[i]).dir) {
          if (cand[i].slice(-5) === ".json") return JSON.parse(__readFile(cand[i]));
          return loadModule(cand[i]);
        }
      }
      print("[loader] miss id=" + id + " dir=" + dir + " cand=" + JSON.stringify(cand));
      throw new Error("MODULE_NOT_FOUND " + id + " from " + dir);
    }
    log("require(未实现): " + id + " -> 返回空对象");
    return {};
  };
}

/* ---------------- 计时与主流程 ---------------- */
log("开始加载 pxt_hack.js …");
var pxtmod = loadModule(P.join(CORE_DIR, "built/pxt_hack.js"));
log("pxt_hack.js 加载完成");
var nodeutil = loadModule(P.join(CORE_DIR, "built/nodeutil.js"));
log("nodeutil.js 加载完成");

var pxt = globalThis.pxt, pxtc = globalThis.pxtc;
if (!pxt || !pxtc) throw new Error("pxt/pxtc 没有挂到全局（got pxt=" + typeof pxt + ", pxtc=" + typeof pxtc + "）");

nodeutil.setTargetDir(ARCADE_DIR);
pxt.setAppTarget(JSON.parse(FS.readFileSync(P.join(ARCADE_DIR, "built/target.json"), "utf8")));
pxtmod.SnippetHost.prototype.getPxtRepoDir = function () { return CORE_DIR; };
pxt.debug = function (m) { if (DEBUG_FS) print("[pxt] " + m); };
log("target 就绪");

var files = JSON.parse(FS.readFileSync(CARD_JSON, "utf8"));
log("卡带文件: " + Object.keys(files).join(","));
CWD.v = WORK;
Object.keys(files).forEach(function (name) {
  FS.writeFileSync(P.join(WORK, name), files[name]);
});

var host = new pxtmod.Host();
var mainPkg = new pxt.MainPackage(host);
log("MainPackage 建好，开始 installAllAsync");
mainPkg.installAllAsync().then(function () {
  log("installAllAsync 完成");
  return mainPkg.getCompileOptionsAsync();
}).then(function (opts) {
  log("getCompileOptionsAsync 完成，sourceFiles=" + (opts.sourceFiles || []).length);
  var res = pxtc.compile(opts);
  log("pxtc.compile 完成，diagnostics=" + ((res.diagnostics || []).length));
  if (!res.outfiles || !res.outfiles["binary.js"]) { log("NO OUTPUT"); return; }
  var out = res.outfiles["binary.js"];
  FS.writeFileSync(P.join(OUT_DIR, "binary.js"), out);
  log("binary.js " + out.length + " bytes -> " + OUT_DIR);
}).catch(function (e) {
  log("FAILED: " + (e && e.message));
  print((e && e.stack || "").split("\n").slice(0, 8).join("\n"));
});
log("主流程已排入队列");
