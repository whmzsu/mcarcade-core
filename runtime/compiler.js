/*
 * compiler.js —— 核心内嵌 pxt 编译器的胶水层
 *
 * 在 QuickJS 里把「卡带工程 JSON」编译成「binary.js」。整套 pxt 编译器
 *（pxt_hack.js 自带 TypeScript 编译器）和 target.json（pxt-arcade 全部库源码）
 * 由 C 侧以 LZMA 压缩内嵌，这里只负责：
 *
 *   1. 内存虚拟文件系统（VFS）：所有读写都在 JS 对象里，不碰真实磁盘
 *   2. CommonJS 装载器 + node 内置模块替身（fs/path/os/crypto/util/child_process/zlib）
 *   3. 按官方流程跑 Host -> MainPackage.installAllAsync -> getCompileOptionsAsync -> pxtc.compile
 *
 * 路径约定（纯 POSIX，避免 Windows 盘符/反斜杠的一堆特例）：
 *   /pxt/     内嵌资产，映射到 C 侧 __asset("pxt-core/built/pxt_hack.js") 这种名字
 *   /work/    工程目录，卡带里的文件解到这里，pxt_modules 也生成在这
 *   /tmp/     临时目录
 *
 * C 侧只提供 6 个宿主函数：__asset(name) / __has(name) / __list(prefix) /
 *                          __emit(src) / __fail(msg) / __log(msg)
 */
"use strict";

var PXT_ROOT = "/pxt";
var WORK = "/work";
var TMP = "/tmp";

function clog(s) { __log("[编译器] " + s); }

/* ---------------- 内存虚拟文件系统 ---------------- */

var VFS = Object.create(null);   /* 绝对路径 -> 文本内容 */
var DIRS = Object.create(null);  /* 绝对路径 -> 1 */

function vfs_init() {
  DIRS["/"] = 1; DIRS[PXT_ROOT] = 1; DIRS[WORK] = 1; DIRS[TMP] = 1;
  /* 内嵌资产的目录树：从 __list 里现取，不硬编码 */
  var all = __list("");
  for (var i = 0; i < all.length; i++) {
    var parts = all[i].split("/");
    var acc = PXT_ROOT;
    for (var k = 0; k < parts.length - 1; k++) { acc += "/" + parts[k]; DIRS[acc] = 1; }
  }
}

function vfs_mkdirp(p) {
  var s = normPath(p);
  var parts = s.split("/");
  var acc = "";
  for (var i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    acc += "/" + parts[i];
    DIRS[acc] = 1;
  }
}

function vfs_write(p, text) {
  var s = normPath(p);
  VFS[s] = text;
  vfs_mkdirp(dirname(s));
}

function vfs_assetName(p) {
  var s = normPath(p);
  if (s.indexOf(PXT_ROOT + "/") === 0) return s.substring(PXT_ROOT.length + 1);
  return null;
}

function vfs_read(p) {
  var s = normPath(p);
  if (VFS[s] !== undefined) return VFS[s];
  var a = vfs_assetName(s);
  if (a !== null && __has(a)) {
    var t = __asset(a);
    if (t !== null && t !== undefined) return t;
  }
  return null;
}

function vfs_stat(p) {
  var s = normPath(p);
  if (VFS[s] !== undefined) return { size: VFS[s].length, dir: false };
  var a = vfs_assetName(s);
  if (a !== null && __has(a)) return { size: 1, dir: false };
  if (DIRS[s]) return { size: 0, dir: true };
  return null;
}

function vfs_readdir(p) {
  var s = normPath(p);
  var prefix = s === "/" ? "/" : s + "/";
  var seen = Object.create(null), out = [];
  function take(name) {
    if (!name || seen[name]) return;
    seen[name] = 1; out.push(name);
  }
  var k;
  for (k in VFS) if (k.indexOf(prefix) === 0) take(k.substring(prefix.length).split("/")[0]);
  for (k in DIRS) if (k.indexOf(prefix) === 0 && k.length > prefix.length) take(k.substring(prefix.length).split("/")[0]);
  if (s === PXT_ROOT || s.indexOf(PXT_ROOT + "/") === 0) {
    var rel = s === PXT_ROOT ? "" : s.substring(PXT_ROOT.length + 1) + "/";
    var names = __list(rel);
    for (var i = 0; i < names.length; i++) take(names[i].substring(rel.length).split("/")[0]);
  }
  return out;
}

/* ---------------- path（POSIX 语义） ---------------- */

function normPath(p) {
  var s = String(p).replace(/\\/g, "/");
  if (s.charAt(0) === "/") return P.normalize(s);
  return P.normalize(CWD.v + "/" + s);
}

var P = (function () {
  function normalize(p) {
    var s = String(p).replace(/\\/g, "/");
    var abs = s.charAt(0) === "/";
    var parts = s.split("/"), out = [];
    for (var i = 0; i < parts.length; i++) {
      var x = parts[i];
      if (!x || x === ".") continue;
      if (x === "..") { if (out.length && out[out.length - 1] !== "..") out.pop(); else if (!abs) out.push(".."); }
      else out.push(x);
    }
    var body = out.join("/");
    if (!abs) return body || ".";
    return "/" + body;
  }
  function join() {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) if (arguments[i] !== "" && arguments[i] != null) parts.push(String(arguments[i]));
    return normalize(parts.join("/"));
  }
  function resolve() {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) {
      var a = String(arguments[i]).replace(/\\/g, "/");
      if (!a) continue;
      if (a.charAt(0) === "/") parts = [a]; else parts.push(a);
    }
    if (!parts.length || parts[0].charAt(0) !== "/") parts.unshift(CWD.v);
    return normalize(parts.join("/"));
  }
  function dirname(p) {
    var s = normalize(p);
    var i = s.lastIndexOf("/");
    if (i < 0) return ".";
    if (i === 0) return "/";
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
    sep: "/", delimiter: ":", normalize: normalize, join: join, resolve: resolve, dirname: dirname,
    basename: basename, extname: extname, relative: relative,
    isAbsolute: function (p) { return String(p).charAt(0) === "/"; },
    parse: function (p) {
      var d = dirname(p), b = basename(p), e = extname(p);
      return { root: "/", dir: d, base: b, ext: e, name: b.slice(0, b.length - e.length) };
    },
    format: function (o) { return join(o.dir || "", (o.name || "") + (o.ext || "")); },
    posix: null, win32: null
  };
})();
P.posix = P; P.win32 = P;

/* P 里面的 path 函数在 IIFE 内部，这里给出全局别名——loadModule / vfs 都直接用 */
var dirname = P.dirname, basename = P.basename, extname = P.extname;

var CWD = { v: WORK };

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
function fromBase64(s) {
  var out = [], i, buf = 0, bits = 0, c, v;
  s = String(s).replace(/[^A-Za-z0-9+/=]/g, "");
  for (i = 0; i < s.length; i++) {
    c = s.charAt(i);
    if (c === "=") break;
    v = B64.indexOf(c);
    if (v < 0) continue;
    buf = ((buf << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 255);
    }
  }
  return out;
}

/*
 * Node 的 Buffer 是 Uint8Array 加一套编码方法；直接返回 Uint8Array 会让
 * `buf.toString("binary")` 落到 Array.prototype.toString 上，得到 "1,2,3" 这种
 * 逗号串（pxt 的字体/资源就是靠 atob → Buffer.toString("binary") 取字节的，
 * 一旦退化成逗号串，产物体积会翻倍且资源内容全错）。
 */
class Buffer extends Uint8Array {
  toString(enc, start, end) {
    var u = this;
    if (start !== undefined || end !== undefined)
      u = this.subarray(start || 0, end === undefined ? this.length : end);
    enc = String(enc || "utf8").toLowerCase();
    var s = "", i;
    if (enc === "hex") {
      for (i = 0; i < u.length; i++) s += ("0" + u[i].toString(16)).slice(-2);
      return s;
    }
    if (enc === "base64") return toBase64(u);
    if (enc === "binary" || enc === "latin1" || enc === "ascii") {
      for (i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
      return s;
    }
    return bytesToUtf8(u);
  }
  copy(target, tStart, sStart, sEnd) {
    var n = this.subarray(sStart || 0, sEnd === undefined ? this.length : sEnd);
    target.set(n, tStart || 0);
    return n.length;
  }
  equals(other) {
    if (!other || other.length !== this.length) return false;
    for (var i = 0; i < this.length; i++) if (this[i] !== other[i]) return false;
    return true;
  }
  write(str, off, len, enc) {
    var b = Buffer.from(String(str), enc);
    if (len !== undefined && len < b.length) b = b.subarray(0, len);
    off = off || 0;
    b = b.subarray(0, Math.max(0, this.length - off));
    this.set(b, off);
    return b.length;
  }
}

Buffer.from = function (x, enc) {
  if (typeof x === "string") {
    if (enc === "base64") return new Buffer(fromBase64(x));
    if (enc === "hex") {
      var u = new Buffer(x.length >> 1);
      for (var i = 0; i < u.length; i++) u[i] = parseInt(x.substr(i * 2, 2), 16) || 0;
      return u;
    }
    if (enc === "binary" || enc === "latin1") {
      var v = new Buffer(x.length);
      for (var j = 0; j < x.length; j++) v[j] = x.charCodeAt(j) & 255;
      return v;
    }
    return new Buffer(utf8ToBytes(x));
  }
  if (x instanceof Uint8Array) return new Buffer(x);
  if (x instanceof ArrayBuffer) return new Buffer(new Uint8Array(x));
  return new Buffer(x);   /* 数组等 arrayLike */
};
Buffer.alloc = function (n, fill) { var u = new Buffer(n); if (fill) u.fill(fill); return u; };
Buffer.isBuffer = function (o) { return o instanceof Uint8Array; };
Buffer.concat = function (list, n) {
  var total = 0, i;
  for (i = 0; i < list.length; i++) total += list[i].length;
  var u = new Buffer(n === undefined ? total : n), off = 0;
  for (i = 0; i < list.length && off < u.length; i++) { u.set(list[i].subarray(0, u.length - off), off); off += list[i].length; }
  return u;
};
Buffer.byteLength = function (s) { return typeof s === "string" ? utf8ToBytes(s).length : s.length; };

/* ---------------- fs 替身（全部走 VFS） ---------------- */

var FS = (function () {
  function statObj(p) {
    var s = vfs_stat(p);
    if (!s) return null;
    return {
      size: s.size, mtimeMs: 0, mode: s.dir ? 0o40000 : 0o100000,
      isDirectory: function () { return !!s.dir; },
      isFile: function () { return !s.dir; },
      isSymbolicLink: function () { return false; }
    };
  }
  var api = {
    existsSync: function (p) { return !!vfs_stat(p); },
    readFileSync: function (p, opt) {
      var s = vfs_read(p);
      if (s === null) { var e = new Error("ENOENT: " + p); e.code = "ENOENT"; throw e; }
      var enc = typeof opt === "string" ? opt : (opt && opt.encoding);
      if (!enc || enc === "utf8" || enc === "utf-8" || enc === "ascii") return s;
      return Buffer.from(s);
    },
    writeFileSync: function (p, data) {
      vfs_write(p, typeof data === "string" ? data : bytesToUtf8(data));
    },
    appendFileSync: function (p, data) {
      var old = vfs_read(p) || "";
      vfs_write(p, old + (typeof data === "string" ? data : bytesToUtf8(data)));
    },
    mkdirSync: function (p) { vfs_mkdirp(p); },
    readdirSync: function (p, opt) {
      var names = vfs_readdir(p);
      if (opt && opt.withFileTypes) return names.map(function (n) {
        var st = statObj(joinPath(p, n));
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
    realpathSync: function (p) { return normPath(p); },
    unlinkSync: function (p) { delete VFS[normPath(p)]; },
    rmSync: function (p) { delete VFS[normPath(p)]; },
    rmdirSync: function (p) { delete DIRS[normPath(p)]; },
    renameSync: function (a, b) { var d = vfs_read(a); if (d !== null) { vfs_write(b, d); delete VFS[normPath(a)]; } },
    copyFileSync: function (a, b) { var d = vfs_read(a); if (d !== null) vfs_write(b, d); },
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
    writeFile: function (p, d) { return Promise.resolve().then(function () { api.writeFileSync(p, d); }); },
    mkdir: function (p) { api.mkdirSync(p); return Promise.resolve(); },
    readdir: function (p) { return Promise.resolve(api.readdirSync(p)); },
    stat: function (p) { return Promise.resolve(api.statSync(p)); },
    rm: function (p) { try { api.rmSync(p); } catch (e) { } return Promise.resolve(); }
  };
  return api;
})();

function joinPath(a, b) { return P.join(a, b); }

/* ---------------- 其余 node 内置模块 ---------------- */

var OS = {
  tmpdir: function () { return TMP; },
  platform: function () { return "linux"; },
  EOL: "\n",
  cpus: function () { return [{}]; },
  homedir: function () { return "/root"; },
  release: function () { return "0.0.0"; },
  totalmem: function () { return 512 * 1024 * 1024; },
  freemem: function () { return 256 * 1024 * 1024; }
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
  randomBytes: function (n) { var u = new Uint8Array(n); for (var i = 0; i < n; i++) u[i] = (Math.random() * 256) | 0; return u; },
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
  inspect: function (o) { try { return JSON.stringify(o); } catch (e) { return String(o); } }
};

var CHILD = {
  execSync: function () { return ""; },
  exec: function (c, o, cb) { if (cb) cb(null, "", ""); },
  spawn: function () { return { on: function () { }, stdout: { on: function () { } }, stderr: { on: function () { } } }; },
  spawnSync: function () { return { status: 0, stdout: "", stderr: "" }; }
};

/* pxt 里少数几处会 setTimeout 等异步；编译期没有事件循环，排进队列由 C 侧抽干 */
var timerQueue = [];
var TIMERS = {
  setTimeout: function (cb) { timerQueue.push(cb); return timerQueue.length; },
  setInterval: function () { return 0; },
  clearTimeout: function () { },
  clearInterval: function () { },
  setImmediate: function (cb) { timerQueue.push(cb); return 0; }
};

/* C 侧在微任务抽干后调用：执行排队的定时器，返回是否做过事 */
globalThis.__drainTimers = function () {
  if (!timerQueue.length) return false;
  var q = timerQueue.splice(0, timerQueue.length);
  for (var i = 0; i < q.length; i++) {
    try { q[i](); } catch (e) { __log("[编译器] 定时器异常: " + (e && e.message)); }
  }
  return true;
};

var process = {
  env: { NODE_ENV: "production", PXT_COMPILE_SWITCHES: "", PXTBUILD: "" },
  argv: ["node", "pxt"],
  platform: "linux",
  versions: { node: "18.0.0" },
  version: "v18.0.0",
  cwd: function () { return CWD.v; },
  chdir: function (d) { CWD.v = normPath(d); },
  exit: function (c) { throw new Error("process.exit(" + c + ")"); },
  nextTick: function (cb) { timerQueue.push(cb); },
  hrtime: function () { return [Math.floor(Date.now() / 1000), 0]; },
  cpuUsage: function () { return { user: 0, system: 0 }; },
  uptime: function () { return Date.now() / 1000; },
  memoryUsage: function () { return { rss: 0, heapTotal: 0, heapUsed: 0 }; },
  stdout: { write: function (s) { __log(String(s).replace(/\n$/, "")); return true; }, isTTY: false },
  stderr: { write: function (s) { __log(String(s).replace(/\n$/, "")); return true; }, isTTY: false },
  on: function () { },
  emit: function () { },
  exitCode: 0
};

var console = {
  log: function () {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      if (typeof a === "string") parts.push(a);
      else { try { parts.push(JSON.stringify(a)); } catch (e) { parts.push(String(a)); } }
    }
    __log(parts.join(" "));
  },
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
  get: function (u, cb) { if (cb) cb(new Error("内嵌编译器不联网")); return { on: function () { } }; },
  request: function () { return { on: function () { }, end: function () { }, write: function () { } }; }
};
var BUILTINS = {
  fs: FS, path: P, os: OS, crypto: CRYPTO, util: UTIL, child_process: CHILD, zlib: ZLIB,
  http: NOHTTP, https: NOHTTP,
  "promise.prototype.finally": { shim: function () { } },
  events: { EventEmitter: function () { this.on = function () { }; this.emit = function () { }; } },
  stream: {}, buffer: { Buffer: Buffer }, url: { parse: function (s) { return { href: s }; } },
  assert: function () { }, tty: {}
};

function loadModule(full) {
  full = normPath(full);
  if (cache[full]) return cache[full].exports;
  var src = vfs_read(full);
  if (src === null) throw new Error("MODULE_NOT_FOUND " + full);
  var m = { exports: {}, paths: [], filename: full, id: full, children: [] };
  cache[full] = m;
  var dir = dirname(full);
  var body = src + "\n//# sourceURL=" + full;
  var fn = new Function("exports", "require", "module", "__filename", "__dirname", "global", "process",
    "Buffer", "console", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "setImmediate",
    body);
  fn.call(m.exports, m.exports, makeRequire(dir), m, full, dir, globalThis, process,
    Buffer, console, TIMERS.setTimeout, TIMERS.setInterval, TIMERS.clearTimeout, TIMERS.clearInterval,
    TIMERS.setImmediate);
  return m.exports;
}

function makeRequire(dir) {
  return function require(id) {
    if (hasOwn(BUILTINS, id)) return BUILTINS[id];
    if (id.charAt(0) === "." || id.charAt(0) === "/") {
      var full = normPath(resolveFrom(dir, id));
      var cand = [full, full + ".js", full + ".json", full + "/index.js"];
      for (var i = 0; i < cand.length; i++) {
        var st = vfs_stat(cand[i]);
        if (st && !st.dir) {
          if (cand[i].slice(-5) === ".json") return JSON.parse(vfs_read(cand[i]));
          return loadModule(cand[i]);
        }
      }
      throw new Error("MODULE_NOT_FOUND " + id + " from " + dir);
    }
    /* 其余 node 包（pxt 用不到）给空对象，别让整个流程断在这里 */
    return {};
  };
}

function resolveFrom(dir, id) {
  if (id.charAt(0) === "/") return normPath(id);
  return P.normalize(dir + "/" + id);
}

/* ---------------- 主流程 ---------------- */

var PEXT_CORE = PXT_ROOT + "/pxt-core";
var PEXT_ARCADE = PXT_ROOT + "/pxt-arcade";
var pxt = null, pxtc = null, pxtmod = null;

function prepare() {
  vfs_init();
  pxtmod = loadModule(PEXT_CORE + "/built/pxt_hack.js");
  var nodeutil = loadModule(PEXT_CORE + "/built/nodeutil.js");
  pxt = globalThis.pxt;
  pxtc = globalThis.pxtc;
  if (!pxt || !pxtc) throw new Error("pxt/pxtc 没有挂到全局");
  clog("编译器已加载");

  nodeutil.setTargetDir(PEXT_ARCADE);
  /* SnippetHost 需要知道“仓库根”；内嵌场景没有仓库，指到 /pxt 即可 */
  if (pxtmod.SnippetHost && pxtmod.SnippetHost.prototype) {
    pxtmod.SnippetHost.prototype.getPxtRepoDir = function () { return PXT_ROOT; };
  }
  var targetJson = vfs_read(PEXT_ARCADE + "/built/target.json");
  if (!targetJson) throw new Error("缺少 target.json");
  pxt.setAppTarget(JSON.parse(targetJson));
  pxt.debug = function () { };
  clog("target 就绪");
}

function errText(e) { return (e && (e.message || e)) || "未知错误"; }

/* 别用 Object.prototype.hasOwnProperty：pxt_hack 加载后原型已被改过，直接调用会崩 */
function hasOwn(o, k) { return Object.keys(o).indexOf(k) >= 0; }

/* 前置校验失败：报给宿主（__fail 只做记录，不抛）后返回 null。
   不要在这里 throw —— 从 C 直接进来的 JS 帧里同步抛异常会把状态搞乱。 */
function failNow(msg) { __fail(msg); return null; }

function compileCard(cardJson) {
  var files = JSON.parse(cardJson);
  /* pxt 的 installAllAsync 假设 pxt.json 一定存在，缺了会直接崩，这里先挡掉 */
  if (!hasOwn(files, "pxt.json"))
    return failNow("卡带里没有 pxt.json，不是完整的 MakeCode 工程，无法编译");

  /* 第三方扩展要从 github 下载，内嵌编译器不联网——提前报错，别让 pxt 卡在下载里 */
  var pj = {};
  try { pj = JSON.parse(files["pxt.json"]); } catch (e) { pj = {}; }
  var deps = pj.dependencies || {};

  /* 兜底：极少数卡带的 pxt.json 一个依赖都没写，pxt 就不装 libs，
     TS 找不到 pxtlib.d.ts → "Cannot find global type 'Array'"。补上 device（同 cart_build.js）。 */
  if (Object.keys(deps).length === 0) {
    pj.dependencies = { "device": "*" };
    files["pxt.json"] = JSON.stringify(pj, null, 4);
    deps = pj.dependencies;
    clog("依赖为空，已补 device:*");
  }

  var needNet = [];
  for (var dep in deps) {
    if (!hasOwn(deps, dep)) continue;
    var dv = String(deps[dep]);
    if (dv.indexOf("github:") === 0 || dv.indexOf("gist:") === 0 ||
        dv.indexOf("http:") === 0 || dv.indexOf("https:") === 0 || dv.indexOf("file:") === 0)
      needNet.push(dep + " (" + dv + ")");
  }
  if (needNet.length)
    return failNow("这张卡带依赖需要联网安装的扩展：" + needNet.join(", ") +
      "。请在 PC 上转换：node tools/cart_build.js 游戏.png -o out/ ，再加载 out/游戏/binary.js");
  var names = [];
  for (var k in files) if (hasOwn(files, k)) names.push(k);
  clog("卡带文件 " + names.length + " 个: " + names.join(", "));
  for (var i = 0; i < names.length; i++) vfs_write(P.join(WORK, names[i]), files[names[i]]);

  CWD.v = WORK;
  /* Host 来自 pxt_hack 的导出（nodeutil 里没有），和 PC 端 pxtc 走的是同一个类 */
  var host = new pxtmod.Host();
  var mainPkg = new pxt.MainPackage(host);
  clog("开始安装依赖（生成 pxt_modules）");
  return mainPkg.installAllAsync().then(function () {
    clog("依赖就绪，准备编译选项");
    return mainPkg.getCompileOptionsAsync();
  }).then(function (opts) {
    clog("源文件 " + (opts.sourceFiles || []).length + " 个，开始编译");
    var res = pxtc.compile(opts);
    var diags = (res.diagnostics || []);
    if (diags.length) {
      var msg = diags.slice(0, 5).map(function (d) {
        return (d.messageText || d.message || String(d)) + (d.fileName ? " @" + d.fileName : "");
      }).join(" | ");
      clog(diags.length + " 条诊断: " + msg);
    }
    if (!res.outfiles || !res.outfiles["binary.js"])
      throw new Error("编译器没有生成 binary.js" + (msg ? "：" + msg.slice(0, 200) : ""));
    return res.outfiles["binary.js"];
  });
}

globalThis.__compile = function (cardJson) {
  try {
    prepare();
  } catch (e) {
    __fail("编译器初始化失败: " + errText(e));
    return 0;
  }
  clog("编译器已就绪");
  try {
    var pr = compileCard(cardJson);
    if (!pr) return 0;                  /* 校验没过，failNow 已经报过错 */
    pr.then(function (out) {
      if (!out) return;                 /* 已经通过 __fail 报过错了 */
      clog("完成，产物 " + out.length + " 字节");
      __emit(out);
    }, function (e) {
      __fail("编译失败: " + errText(e));
      if (e && e.stack) __log("[编译器] " + String(e.stack).split("\n").slice(0, 6).join(" | "));
    });
  } catch (e) {
    __fail("编译失败: " + errText(e));
  }
  return 0;
};

__log("[编译器] 胶水加载完成");
