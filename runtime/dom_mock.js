// 最小 DOM / WebAudio 替身。纯 ES5 风格，既能在 Node 的 vm 里用，也能在 QuickJS 里 eval。
// 用法: var env = installMockDom(globalThis, { width: 160, height: 120 });
//       env.getScreenPixels() -> Uint8ClampedArray(RGBA)
var installMockDom = function (g, opts) {
  opts = opts || {};
  var W = opts.width || 160, H = opts.height || 120;
  var frames = 0;
  var lastImage = null;

  function mkImageData(w, h) {
    var d = new Uint8ClampedArray(w * h * 4);
    return { data: d, width: w, height: h };
  }

  function mkStyle() {
    var s = {};
    s.setProperty = function (k, v) { s[k] = v; };
    s.getPropertyValue = function (k) { return s[k] || ""; };
    s.removeProperty = function (k) { var v = s[k]; delete s[k]; return v || ""; };
    return s;
  }

  function mkClassList() {
    return {
      add: function () {}, remove: function () {}, toggle: function () {},
      contains: function () { return false; }
    };
  }

  var EMPTY_LIST = { length: 0, item: function () { return null; }, forEach: function () {} };

  function mkEl(tag) {
    var el = {
      tagName: String(tag || "div").toUpperCase(),
      style: mkStyle(), dataset: {}, classList: mkClassList(),
      children: [], childNodes: [], innerHTML: "", textContent: "", value: "",
      width: 0, height: 0
    };
    el.addEventListener = function () {};
    el.removeEventListener = function () {};
    el.dispatchEvent = function () {};
    el.appendChild = function (c) { el.children.push(c); return c; };
    el.removeChild = function () {};
    el.insertBefore = function () {};
    el.setAttribute = function () {};
    el.getAttribute = function () { return null; };
    el.removeAttribute = function () {};
    el.getBoundingClientRect = function () {
      return { width: el.width || 0, height: el.height || 0, left: 0, top: 0, right: el.width || 0, bottom: el.height || 0 };
    };
    el.getElementsByClassName = function () { return EMPTY_LIST; };
    el.getElementsByTagName = function () { return EMPTY_LIST; };
    el.querySelector = function () { return null; };
    el.querySelectorAll = function () { return []; };
    el.focus = function () {}; el.blur = function () {}; el.click = function () {};
    el.getContext = function () { return null; };
    return el;
  }

  function mkCanvas(w, h) {
    var el = mkEl("canvas");
    el.width = w || 0;
    el.height = h || 0;
    var ctx2d = {
      canvas: el,
      imageSmoothingEnabled: true,
      fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, globalAlpha: 1,
      font: "10px monospace", textAlign: "left", textBaseline: "top",
      save: function () {}, restore: function () {},
      translate: function () {}, scale: function () {}, rotate: function () {},
      setTransform: function () {}, resetTransform: function () {},
      beginPath: function () {}, closePath: function () {},
      moveTo: function () {}, lineTo: function () {}, arc: function () {}, rect: function () {},
      fill: function () {}, stroke: function () {}, clip: function () {},
      fillRect: function () {}, strokeRect: function () {}, clearRect: function () {},
      fillText: function () {}, strokeText: function () {},
      measureText: function (t) { return { width: String(t).length * 6 }; },
      drawImage: function () {},
      createImageData: function (w2, h2) { return mkImageData(w2, h2); },
      getImageData: function (x, y, w2, h2) { return mkImageData(w2, h2); },
      putImageData: function (img) { lastImage = img; frames++; },
      createLinearGradient: function () { return { addColorStop: function () {} }; }
    };
    el.getContext = function () { return ctx2d; };
    el._ctx = ctx2d;
    return el;
  }

  function mkAudioParam(v) {
    var p = { value: v || 0 };
    p.setValueAtTime = function () { return p; };
    p.linearRampToValueAtTime = function () { return p; };
    p.exponentialRampToValueAtTime = function () { return p; };
    p.setTargetAtTime = function () { return p; };
    p.cancelScheduledValues = function () { return p; };
    p.setValueCurveAtTime = function () { return p; };
    return p;
  }
  function mkAudioNode() {
    return {
      connect: function () { return this; }, disconnect: function () { return this; },
      gain: mkAudioParam(1), frequency: mkAudioParam(440), Q: mkAudioParam(1),
      detune: mkAudioParam(0), playbackRate: mkAudioParam(1), type: "square",
      onended: null, buffer: null, loop: false,
      start: function () {}, stop: function () {}
    };
  }
  function mkAudioContext() {
    return {
      sampleRate: 44100, currentTime: 0, state: "running", destination: mkAudioNode(),
      createGain: mkAudioNode, createOscillator: mkAudioNode, createBiquadFilter: mkAudioNode,
      createDynamicsCompressor: mkAudioNode, createBufferSource: mkAudioNode,
      createChannelMerger: mkAudioNode, createChannelSplitter: mkAudioNode,
      createAnalyser: function () {
        var n = mkAudioNode(); n.fftSize = 2048; n.frequencyBinCount = 1024;
        n.getByteTimeDomainData = function (a) { for (var i = 0; i < a.length; i++) a[i] = 128; };
        n.getByteFrequencyData = function (a) { for (var i = 0; i < a.length; i++) a[i] = 0; };
        n.getFloatTimeDomainData = function (a) { for (var i = 0; i < a.length; i++) a[i] = 0; };
        return n;
      },
      createStereoPanner: mkAudioNode, createWaveShaper: mkAudioNode,
      createDelay: mkAudioNode, createConvolver: mkAudioNode, createPanner: mkAudioNode,
      createPeriodicWave: function () { return {}; },
      createScriptProcessor: mkAudioNode,
      createBuffer: function (ch, len, rate) {
        return {
          numberOfChannels: ch, length: len, sampleRate: rate, duration: len / rate,
          getChannelData: function () { return new Float32Array(len); },
          copyToChannel: function () {}
        };
      },
      decodeAudioData: function () { return { then: function () { return this; } }; },
      resume: function () {}, suspend: function () {}, close: function () {}
    };
  }

  var screenEl = mkCanvas(W, H);

  var doc = {
    head: { appendChild: function () {} },
    body: { appendChild: function () {}, removeChild: function () {}, style: mkStyle() },
    documentElement: { style: mkStyle(), dataset: {} },
    readyState: "complete",
    location: { href: "http://localhost/", search: "", query: "" },
    createElement: function (t) { return t === "canvas" ? mkCanvas(0, 0) : mkEl(t); },
    createElementNS: function (ns, t) { return doc.createElement(t); },
    createTextNode: function (t) { return { text: t }; },
    getElementById: function (id) { return id === "game-screen" ? screenEl : mkEl("div"); },
    getElementsByClassName: function () { return EMPTY_LIST; },
    getElementsByTagName: function () { return EMPTY_LIST; },
    querySelector: function () { return mkEl("div"); },
    querySelectorAll: function () { return []; },
    createDocumentFragment: function () { return mkEl("fragment"); },
    addEventListener: function () {}, removeEventListener: function () {}
  };

  var listeners = {};
  var win = {
    document: doc,
    location: doc.location,
    navigator: { userAgent: "quickjs", maxTouchPoints: 0, onLine: true, platform: "quickjs" },
    innerWidth: 960, innerHeight: 720, devicePixelRatio: 1,
    addEventListener: function (t, f) { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener: function () {},
    matchMedia: function () { return { matches: false, addListener: function () {}, addEventListener: function () {} }; },
    getComputedStyle: function () { return { getPropertyValue: function () { return ""; } }; },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    alert: function () {},
    btoa: function (s) { return b64encode(String(s)); },
    atob: function (s) { return b64decode(String(s)); },
    AudioContext: mkAudioContext, webkitAudioContext: mkAudioContext, OfflineAudioContext: mkAudioContext
  };

  // ---- 安装到目标全局 ----
  var keys = ["document", "navigator", "innerWidth", "innerHeight", "devicePixelRatio",
    "matchMedia", "getComputedStyle", "localStorage", "alert", "btoa", "atob",
    "AudioContext", "webkitAudioContext", "OfflineAudioContext"];
  for (var i = 0; i < keys.length; i++) g[keys[i]] = win[keys[i]];
  g.window = g;
  g.self = g;
  // window === globalThis，事件注册方法也得挂在全局上
  g.addEventListener = win.addEventListener;
  g.removeEventListener = win.removeEventListener;
  g.matchMedia = win.matchMedia;
  g.getComputedStyle = win.getComputedStyle;
  g.localStorage = win.localStorage;
  g.AudioBuffer = function () {};
  g.OscillatorNode = function () {};
  g.AudioBufferSourceNode = function () {};
  g.GainNode = function () {};
  g.AnalyserNode = function () {};
  g.AudioNode = function () {};
  g.AudioParam = function () {};
  g.Image = function () { return mkCanvas(0, 0); };
  g.ImageData = function (w, h) { return mkImageData(w, h); };

  // QuickJS 没有 TextEncoder/TextDecoder，pxt 的 toUTF8Array 必须靠它
  if (typeof g.TextEncoder === "undefined") {
    g.TextEncoder = function () {};
    g.TextEncoder.prototype.encode = function (str) {
      var out = [], i, c, c2, cp;
      str = String(str);
      for (i = 0; i < str.length; i++) {
        c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) { out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F)); }
        else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
          c2 = str.charCodeAt(++i);
          cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
          out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F),
            0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
        } else {
          out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
        }
      }
      return new Uint8Array(out);
    };
  }
  if (typeof g.TextDecoder === "undefined") {
    g.TextDecoder = function () {};
    g.TextDecoder.prototype.decode = function (buf) {
      if (!buf) return "";
      var b = buf.data || buf, s = "", i = 0, c, c2, c3, c4;
      while (i < b.length) {
        c = b[i++];
        if (c < 0x80) s += String.fromCharCode(c);
        else if ((c & 0xE0) === 0xC0) { c2 = b[i++]; s += String.fromCharCode(((c & 0x1F) << 6) | (c2 & 0x3F)); }
        else if ((c & 0xF0) === 0xE0) {
          c2 = b[i++]; c3 = b[i++];
          s += String.fromCharCode(((c & 0x0F) << 12) | ((c2 & 0x3F) << 6) | (c3 & 0x3F));
        } else {
          c2 = b[i++]; c3 = b[i++]; c4 = b[i++];
          var cp = ((c & 0x07) << 18) | ((c2 & 0x3F) << 12) | ((c3 & 0x3F) << 6) | (c4 & 0x3F);
          cp -= 0x10000;
          s += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
        }
      }
      return s;
    };
  }

  return {
    document: doc, window: win, screenEl: screenEl,
    frameCount: function () { return frames; },
    lastImage: function () { return lastImage; },
    makeCanvas: mkCanvas,
    makeImageData: mkImageData
  };
};

// ---- base64 / UTF-8（QuickJS 没有内置）----
var B64C = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function b64encode(s) {
  var out = "", i;
  for (i = 0; i + 2 < s.length; i += 3) {
    var n = (s.charCodeAt(i) << 16) | (s.charCodeAt(i + 1) << 8) | s.charCodeAt(i + 2);
    out += B64C[(n >> 18) & 63] + B64C[(n >> 12) & 63] + B64C[(n >> 6) & 63] + B64C[n & 63];
  }
  var rem = s.length - i;
  if (rem === 1) {
    var n1 = s.charCodeAt(i) << 16;
    out += B64C[(n1 >> 18) & 63] + B64C[(n1 >> 12) & 63] + "==";
  } else if (rem === 2) {
    var n2 = (s.charCodeAt(i) << 16) | (s.charCodeAt(i + 1) << 8);
    out += B64C[(n2 >> 18) & 63] + B64C[(n2 >> 12) & 63] + B64C[(n2 >> 6) & 63] + "=";
  }
  return out;
}
function b64decode(s) {
  var out = "", i;
  s = s.replace(/[^A-Za-z0-9+/=]/g, "");
  for (i = 0; i < s.length; i += 4) {
    var n = (B64C.indexOf(s[i]) << 18) | (B64C.indexOf(s[i + 1]) << 12) |
      ((s[i + 2] === "=" ? 0 : B64C.indexOf(s[i + 2])) << 6) |
      (s[i + 3] === "=" ? 0 : B64C.indexOf(s[i + 3]));
    out += String.fromCharCode((n >> 16) & 255);
    if (s[i + 2] !== "=") out += String.fromCharCode((n >> 8) & 255);
    if (s[i + 3] !== "=") out += String.fromCharCode(n & 255);
  }
  return out;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { installMockDom: installMockDom, b64encode: b64encode, b64decode: b64decode };
}
