/*
 * pxt_shim.js —— 官方 MakeCode Arcade runtime 的底层实现。
 *
 * 原版这些由两套代码提供：
 *   - 硬件目标：# shim=xxx::yyy 由 C++ 实现（codal）
 *   - 浏览器/模拟器：pxsim 的 JS 实现
 * 这里用 JS 重写一份，且只做 libretro 需要的那部分。
 *
 * 加载顺序：本文件必须在 pxt-runtime.js 之前执行（runtime 顶层就会调 image.create）。
 */
(function (g) {
  "use strict";

  var SCREEN_W = 160;
  var SCREEN_H = 120;

  // ============================================================
  // Buffer —— pxt 里是 interface + namespace，实现在 buffer.cpp
  // ============================================================
  function PxtBuffer(n) {
    var len = (n && n.buffer) ? n.length : (n | 0);
    var u = new Uint8Array(len);
    if (n && n.buffer) u.set(n);
    // 用 Uint8Array 做原型基底，保证 buf[i] 可用
    Object.setPrototypeOf(u, PxtBuffer.prototype);
    return u;
  }
  PxtBuffer.prototype = Object.create(Uint8Array.prototype);
  PxtBuffer.prototype.constructor = PxtBuffer;

  PxtBuffer.prototype.concat = function (other) {
    var r = new PxtBuffer(this.length + other.length);
    r.set(this, 0); r.set(other, this.length);
    return r;
  };
  PxtBuffer.prototype.indexOf = function (other) {
    if (!other || !other.length) return 0;
    outer: for (var i = 0; i + other.length <= this.length; i++) {
      for (var j = 0; j < other.length; j++)
        if (this[i + j] !== other[j]) continue outer;
      return i;
    }
    return -1;
  };
  PxtBuffer.prototype.equals = function (o) {
    if (!o || o.length !== this.length) return false;
    for (var i = 0; i < this.length; i++) if (this[i] !== o[i]) return false;
    return true;
  };
  PxtBuffer.prototype.slice = function (a, b) {
    var s = Uint8Array.prototype.slice.call(this, a, b);
    return PxtBuffer.fromArray(Array.prototype.slice.call(s));
  };
  PxtBuffer.prototype.toHex = function () {
    var s = "";
    for (var i = 0; i < this.length; i++) {
      var v = this[i] & 0xff;
      s += (v < 16 ? "0" : "") + v.toString(16);
    }
    return s;
  };
  PxtBuffer.prototype.toString = function () {
    return utf8Decode(this);
  };
  PxtBuffer.fromHex = function (s) {
    s = String(s).toLowerCase();
    var r = new PxtBuffer(s.length >> 1);
    for (var i = 0; i < r.length; i++) r[i] = parseInt(s.substr(i * 2, 2), 16);
    return r;
  };
  PxtBuffer.fromArray = function (a) {
    var r = new PxtBuffer(a.length);
    for (var i = 0; i < a.length; i++) r[i] = a[i] & 0xff;
    return r;
  };
  PxtBuffer.fromUTF8 = function (s) { return PxtBuffer.fromArray(utf8Encode(s)); };

  // 数值读写（大小端由 format 决定，pxt 支持 b/B/h/H/i/I 等）
  PxtBuffer.prototype.getNumber = function (fmt, off) {
    off = off || 0;
    var n, signed = fmt === fmt.toLowerCase();
    var size = /[bB]/.test(fmt) ? 1 : /[hH]/.test(fmt) ? 2 : 4;
    n = 0;
    for (var i = 0; i < size; i++) n |= (this[off + i] || 0) << (8 * i);
    if (signed) { var bits = size * 8; if (n >= 1 << (bits - 1)) n -= 1 << bits; }
    return n;
  };
  PxtBuffer.prototype.setNumber = function (fmt, off, v) {
    var size = /[bB]/.test(fmt) ? 1 : /[hH]/.test(fmt) ? 2 : 4;
    v = v | 0;
    for (var i = 0; i < size; i++) this[off + i] = (v >> (8 * i)) & 0xff;
  };
  PxtBuffer.prototype.unpack = function (format, offset) {
    var res = [], off = offset || 0;
    for (var i = 0; i < format.length; i++) {
      var f = format.charAt(i);
      if (f === ".") continue;
      res.push(this.getNumber(f, off));
      off += /[bB]/.test(f) ? 1 : /[hH]/.test(f) ? 2 : 4;
    }
    return res;
  };
  PxtBuffer.prototype.packAt = function (offset, format, nums) {
    var off = offset, k = 0;
    for (var i = 0; i < format.length; i++) {
      var f = format.charAt(i);
      if (f === ".") continue;
      this.setNumber(f, off, nums[k++]);
      off += /[bB]/.test(f) ? 1 : /[hH]/.test(f) ? 2 : 4;
    }
  };
  PxtBuffer.prototype.toArray = function (fmt) {
    var r = [];
    for (var i = 0; i < this.length; i++) r.push(this[i]);
    return r;
  };
  PxtBuffer.prototype.chunked = function (max) {
    var r = [];
    for (var i = 0; i < this.length; i += max) r.push(this.slice(i, i + max));
    return r;
  };
  PxtBuffer.prototype.toBase64 = function () { return b64encode(this); };
  PxtBuffer.prototype.hash = function () {
    var h = 2166136261;
    for (var i = 0; i < this.length; i++) { h ^= this[i]; h = (h * 16777619) >>> 0; }
    return h | 0;
  };
  PxtBuffer.prototype.getBytes = function () { return Array.prototype.slice.call(this); };

  // ============================================================
  // UTF-8 / base64
  // ============================================================
  function utf8Encode(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function utf8Decode(buf) {
    var s = "";
    for (var i = 0; i < buf.length;) {
      var c = buf[i++];
      if (c < 0x80) s += String.fromCharCode(c);
      else if (c < 0xe0) s += String.fromCharCode(((c & 31) << 6) | (buf[i++] & 63));
      else s += String.fromCharCode(((c & 15) << 12) | ((buf[i++] & 63) << 6) | (buf[i++] & 63));
    }
    return s;
  }
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function b64encode(buf) {
    var s = "";
    for (var i = 0; i < buf.length; i += 3) {
      var a = buf[i], b = buf[i + 1], c = buf[i + 2];
      s += B64[a >> 2] + B64[((a & 3) << 4) | ((b || 0) >> 4)]
        + (i + 1 < buf.length ? B64[((b & 15) << 2) | ((c || 0) >> 6)] : "=")
        + (i + 2 < buf.length ? B64[c & 63] : "=");
    }
    return s;
  }

  g.Buffer = PxtBuffer;
  g.hex = function (strings) {
    // pxt 的 hex 标签：hex`00ff10` 或 hex`__palette`
    var s = (strings && strings.raw ? strings.raw[0] : strings[0]) || "";
    s = s.replace(/\s+/g, "");
    if (s === "__palette") return arcadePalette();
    return PxtBuffer.fromHex(s);
  };

  function arcadePalette() {
    // MakeCode Arcade 默认 16 色（RGB，每色 3 字节）
    var p = [
      0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x7f, 0x7f, 0x7f, 0x3f, 0x3f, 0x3f,
      0xff, 0x00, 0x00, 0xff, 0x7f, 0x00, 0xff, 0xff, 0x00, 0x00, 0xff, 0x00,
      0x00, 0x7f, 0xff, 0x00, 0x00, 0xff, 0x7f, 0x00, 0xff, 0xff, 0x00, 0xff,
      0x7f, 0x3f, 0x00, 0xff, 0x7f, 0x7f, 0xff, 0xbf, 0x7f, 0xff, 0xff, 0xbf
    ];
    return PxtBuffer.fromArray(p);
  }

  // ============================================================
  // Image —— 4bpp 索引色位图（内部按 1 byte/pixel 存，便于实现）
  // ============================================================
  function PxtImage(w, h, bpp) {
    this._w = w | 0;
    this._h = h | 0;
    this._bpp = bpp || 4;
    this._d = new Uint8Array(this._w * this._h);
    this._rev = 1;
  }
  Object.defineProperty(PxtImage.prototype, "width", { get: function () { return this._w; } });
  Object.defineProperty(PxtImage.prototype, "height", { get: function () { return this._h; } });
  Object.defineProperty(PxtImage.prototype, "isMono", { get: function () { return this._bpp === 1; } });

  PxtImage.prototype._idx = function (x, y) { return y * this._w + x; };
  PxtImage.prototype.setPixel = function (x, y, c) {
    if (x < 0 || y < 0 || x >= this._w || y >= this._h) return;
    this._d[y * this._w + x] = c & 0xff; this._rev++;
  };
  PxtImage.prototype.getPixel = function (x, y) {
    if (x < 0 || y < 0 || x >= this._w || y >= this._h) return 0;
    return this._d[y * this._w + x];
  };
  PxtImage.prototype.fill = function (c) { this._d.fill(c & 0xff); this._rev++; };
  PxtImage.prototype.clone = function () {
    var r = new PxtImage(this._w, this._h, this._bpp);
    r._d.set(this._d); return r;
  };
  PxtImage.prototype.copyFrom = function (o) { this._d.set(o._d); this._rev++; };
  PxtImage.prototype.flipX = function () {
    for (var y = 0; y < this._h; y++)
      for (var x = 0; x < (this._w >> 1); x++) {
        var a = this._idx(x, y), b = this._idx(this._w - 1 - x, y);
        var t = this._d[a]; this._d[a] = this._d[b]; this._d[b] = t;
      }
    this._rev++;
  };
  PxtImage.prototype.flipY = function () {
    for (var y = 0; y < (this._h >> 1); y++)
      for (var x = 0; x < this._w; x++) {
        var a = this._idx(x, y), b = this._idx(x, this._h - 1 - y);
        var t = this._d[a]; this._d[a] = this._d[b]; this._d[b] = t;
      }
    this._rev++;
  };
  PxtImage.prototype.scroll = function (dx, dy) {
    var src = this._d.slice(), w = this._w, h = this._h;
    for (var y = 0; y < h; y++)
      for (var x = 0; x < w; x++) {
        var sx = ((x - dx) % w + w) % w, sy = ((y - dy) % h + h) % h;
        this._d[y * w + x] = src[sy * w + sx];
      }
    this._rev++;
  };
  PxtImage.prototype.replace = function (from, to) {
    for (var i = 0; i < this._d.length; i++) if (this._d[i] === from) this._d[i] = to;
    this._rev++;
  };
  PxtImage.prototype.equals = function (o) {
    if (!o || o._w !== this._w || o._h !== this._h) return false;
    for (var i = 0; i < this._d.length; i++) if (this._d[i] !== o._d[i]) return false;
    return true;
  };
  PxtImage.prototype.isStatic = function () { return false; };
  PxtImage.prototype.revision = function () { return this._rev; };
  PxtImage.prototype.drawTransparentImage = function (from, x, y) {
    for (var sy = 0; sy < from._h; sy++)
      for (var sx = 0; sx < from._w; sx++) {
        var c = from._d[sy * from._w + sx];
        if (c !== 0) this.setPixel(x + sx, y + sy, c);
      }
  };
  PxtImage.prototype.transposed = function () {
    var r = new PxtImage(this._h, this._w, this._bpp);
    for (var y = 0; y < this._h; y++)
      for (var x = 0; x < this._w; x++) r._d[x * this._h + y] = this._d[y * this._w + x];
    return r;
  };
  // 放大/缩小（pxt 用最近邻）
  PxtImage.prototype._scale = function (nw, nh) {
    var r = new PxtImage(nw, nh, this._bpp);
    for (var y = 0; y < nh; y++)
      for (var x = 0; x < nw; x++)
        r._d[y * nw + x] = this._d[((y * this._h / nh) | 0) * this._w + ((x * this._w / nw) | 0)];
    return r;
  };
  PxtImage.prototype.scaled = function (n) { return this._scale(this._w * n, this._h * n); };
  PxtImage.prototype.doubled = function () { return this._scale(this._w * 2, this._h * 2); };
  PxtImage.prototype.halved = function () { return this._scale(this._w >> 1, this._h >> 1); };

  // pxt 的图片 Buffer：0x87, bpp, w(LE16), h(LE16), 像素
  function imageFromBuffer(buf) {
    if (!buf || buf.length < 6) return new PxtImage(0, 0);
    var bpp = buf[1], w = buf[2] | (buf[3] << 8), h = buf[4] | (buf[5] << 8);
    var img = new PxtImage(w, h, bpp);
    var off = 6;
    if (bpp === 4) {
      for (var i = 0; i < w * h; i++) {
        var b = buf[off + (i >> 1)] || 0;
        img._d[i] = (i & 1) ? (b & 0x0f) : (b >> 4);
      }
    } else if (bpp === 1) {
      for (var j = 0; j < w * h; j++) {
        var bb = buf[off + (j >> 3)] || 0;
        img._d[j] = (bb >> (7 - (j & 7))) & 1;
      }
    } else {
      for (var k = 0; k < w * h; k++) img._d[k] = buf[off + k] || 0;
    }
    return img;
  }

  var imageNS = {
    create: function (w, h) { return new PxtImage(w, h, 4); },
    ofBuffer: imageFromBuffer,
    ofRows: function (rows) { return imageFromBuffer(rows && rows.length ? rows : []); },
    doubledIcon: function (b) { return imageFromBuffer(b).doubled(); },
    getFont: function () { return 5; },
    _PxtImage: PxtImage,
  };
  g.image = imageNS;

  // ============================================================
  // control —— 只补硬件相关的那几个，其余由 runtime 自己实现
  // ============================================================
  var startTime = Date.now();
  var eventHandlers = [];
  var controlNS = {
    millis: function () { return (Date.now() - startTime) | 0; },
    micros: function () { return ((Date.now() - startTime) * 1000) | 0; },
    delay: function (ms) { },
    waitMicros: function () { },
    // 事件表：C 侧注入按键时调 control.raiseEvent(src, value) 即可触发
    internalOnEvent: function (src, value, handler, flags) {
      eventHandlers.push({ src: src, value: value, handler: handler, flags: flags || 0 });
    },
    raiseEvent: function (src, value) {
      for (var i = 0; i < eventHandlers.length; i++) {
        var h = eventHandlers[i];
        if (h.src === src && h.value === value) {
          try { h.handler(); } catch (e) { }
        }
      }
    },
    waitForEvent: function () { },
    allocateNotifyEvent: function () { return 0; },
    reset: function () { },
    dmesg: function () { },
    dmesgValue: function () { },
    __log: function () { },
    __phys: function () { },
    gc: function () { },
    heapDump: function () { },
    heapSnapshot: function () { },
    setDebugFlags: function () { },
    profilingEnabled: function () { return false; },
    enablePerfCounter: function () { },
    dmesgPerfCounters: function () { },
    createBuffer: function (n) { return new PxtBuffer(n); },
    createBufferFromUTF8: function (s) { return PxtBuffer.fromUTF8(s); },
    deviceSerialNumber: function () { return 0; },
    deviceLongSerialNumber: function () { return new PxtBuffer(0); },
    getConfigValue: function (key, defl) { return defl; },
    _setPlayerKeys: function () { },
    _setSystemKeys: function () { },
    _setUserKeys: function () { },
    _setImage: function () { },
    _setPinEvents: function () { },
    _setTimerEvents: function () { },
    _waitForEvent: function () { return 0; },
    _pollForEvent: function () { return -1; },
    _enableFiber: function () { },
    // 协程：官方靠 fiber/CPS，这里退化为"立即执行一次"，不阻塞
    runInParallel: function (fn) { /* 由主循环驱动，见 host 侧 */ },
    runInBackground: function (fn) { },
    pushEvent: function () { },
    popEvent: function () { },
  };
  g.control = controlNS;
  g.__pxt_events = eventHandlers;

  // pxt 的源码假设编译器会做全局提升：controller.ts 的顶层就调用
  // game.addScenePopHandler()，而 game.ts 在后面才执行。先放一个占位对象接住，
  // runtime 的 namespace 合并会覆盖这些方法（被覆盖前的注册只影响场景切换回调）。
  var scenePushHandlers = [];
  var scenePopHandlers = [];
  g.game = {
    addScenePushHandler: function (fn) { scenePushHandlers.push(fn); },
    addScenePopHandler: function (fn) { scenePopHandlers.push(fn); },
    currentScene: function () { return undefined; },
    eventContext: function () { return undefined; },
  };

  // pxt 的 settings/其它命名空间留给 runtime 补
  g.__pxt_shim = { SCREEN_W: SCREEN_W, SCREEN_H: SCREEN_H, PxtImage: PxtImage, PxtBuffer: PxtBuffer };
})(typeof globalThis !== "undefined" ? globalThis : this);
