/*
 * pxt_glue.js —— 官方 pxt runtime（pxsim）与 libretro core 的粘合层。
 *
 * 与 v0.8 glue.js 的约定完全一致，core.c 不用改调用方式：
 *   arcade_boot(source)      启动：source 是 pxtc 编译出的 binary.js 全文
 *   arcade_step(dt)          推进一帧（虚拟定时器一轮），返回本帧执行的回调数
 *   arcade_rgba()            返回 Uint8ClampedArray(RGBA 160x120)，来自 screenState.screen
 *   arcade_set_button(n, d)  注入按键（left/up/right/down/A/B/menu）
 *
 * 前置依赖（bundle 里先于本文件 eval）：
 *   - timers 前导（setTimeout/setInterval/rAF 虚拟时钟 + console 捕获）
 *   - dom_mock.js（installMockDom）
 *   - pxtsim.js -> common-sim.js -> sim.js（官方三层 sim）
 */
(function () {
  "use strict";

  var state = {
    rt: null,          // pxsim.Runtime 实例
    booted: false,
    failed: "",        // 非空 = 启动失败原因
  };

  // pxsim.Key（与 pxt-arcade sim.js 里的枚举一致）：
  // Left=1 Up=2 Right=3 Down=4 A=5 B=6 Menu=7；玩家2起每个 +7
  var KEYMAP = { left: 1, up: 2, right: 3, down: 4, A: 5, B: 6, menu: 7 };

  function board() {
    try {
      var r = pxsim.runtime;
      return r ? r.board : null;
    } catch (e) {
      return null;
    }
  }

  function errText(e) {
    var m = String((e && e.message) || e);
    if (e && e.stack) {
      var lines = String(e.stack).split("\n").slice(0, 4);
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i].trim();
        if (l && l.indexOf("at ") !== 0) m += " | " + l;
      }
    }
    return m;
  }

  globalThis.arcade_boot = function (code) {
    state.booted = false;
    state.failed = "";
    if (typeof code !== "string" || code.length < 8) {
      state.failed = "empty binary.js";
      return state.failed;
    }
    try {
      var msg = {
        type: "run",
        id: "arcade-core",
        code: code,
        boardDefinition: { name: "arcade", visual: { width: 160, height: 120 } },
        partDefinitions: {},
        parts: [],
        builtinParts: [],
        mute: false,
        light: false,
      };
      var rt = new pxsim.Runtime(msg);
      state.rt = rt;
      // 音频时钟对齐 + 清空上一局的音源
      if (typeof __audioReset === "function") __audioReset();
      rt.run(function () { /* 顶层代码结束 */ });
      headlessBoard(rt);
      state.booted = true;
      return "";
    } catch (e) {
      state.failed = errText(e);
      try { __native_log("error", "boot: " + state.failed); } catch (e2) {}
      return state.failed;
    }
  };

  /* 无头环境下的纯浪费：gameplayer.draw 每帧 new ImageData(160x120)（76KB 垃圾）
     再把整个屏缓冲拷进 mock canvas，只为渲染一个没人看的 DOM。
     画面我们直接从 screenState.screen 取（arcade_fb32），这一步纯属白烧。 */
  function headlessBoard(rt) {
    if (typeof __arcade_legacy !== "undefined" && __arcade_legacy) return;
    var b = rt && rt.board;
    if (!b) return;
    var gp = b.gameplayer;
    if (gp) gp.draw = function () {};
    fastImageOps();
    profInstall();
  }

  /* ---- 函数级热点统计（ARCADE_JS_PROFILE=1 时启用，设备排查用） ---- */
  var prof = null, profFrames = 0;

  function profInstall() {
    if (prof) return;
    if (typeof __arcade_jsprof === "undefined" || !__arcade_jsprof) return;
    prof = { items: [] };
    var groups = [pxsim.ImageMethods, pxsim.pxtrt];
    for (var gi = 0; gi < groups.length; gi++) {
      var im = groups[gi];
      if (!im) continue;
      var keys = Object.keys(im);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i], f = im[k];
        if (typeof f !== "function") continue;
        var item = { name: (gi ? "pxtrt." : "") + k, n: 0, us: 0 };
        prof.items.push(item);
        im[k] = (function (f, item) {
          return function () {
            var t = __native_now();
            try { return f.apply(this, arguments); }
            finally { item.n++; item.us += __native_now() - t; }
          };
        })(f, item);
      }
    }
  }

  function profDump() {
    function top(cmp, n) {
      var items = prof.items.slice(0).sort(cmp), out = [];
      for (var i = 0; i < items.length && out.length < n; i++) {
        var it = items[i];
        if (!it.n) continue;
        out.push(it.name + " " + (it.us / profFrames / 1000).toFixed(2) + "ms x" +
                 (it.n / profFrames).toFixed(0));
      }
      return out.join(" | ");
    }
    try {
      __native_log("prof", "时间: " + top(function (a, b) { return b.us - a.us; }, 8));
      __native_log("prof", "次数: " + top(function (a, b) { return b.n - a.n; }, 8));
    } catch (e) {}
  }

  /* 逐像素 API 是 sim 里调用最频繁的入口：arcade 运行时画对话框/粒子/文字遮罩
     时每帧几千次（实测 cube-land 每帧 ~2600 次 setPixel + ~2600 次 getPixel）。
     原实现每像素要穿 4 层函数（makeWritable / inRange / pix / color），解释执行
     下每层都是几十纳秒，设备上就是每帧十几毫秒。这里内联成 1 层。 */
  function fastImageOps() {
    if (typeof __arcade_noFastOps !== "undefined" && __arcade_noFastOps) return;
    var im = pxsim.ImageMethods;
    var proto = pxsim.RefImage && pxsim.RefImage.prototype;
    if (!im || !proto) return;
    var defColor = proto.color;
    var defWritable = proto.makeWritable;

    im.setPixel = function (img, x, y, c) {
      x |= 0; y |= 0;
      var w = img._width;
      if (x < 0 || y < 0 || x >= w || y >= img._height) return;
      if (img.makeWritable === defWritable) {
        img.revision++;
        img.isStatic = false;
      } else {
        img.makeWritable();
      }
      img.data[x + y * w] = (img.color === defColor) ? (c & 0xff) : img.color(c);
    };

    im.getPixel = function (img, x, y) {
      x |= 0; y |= 0;
      var w = img._width;
      if (x < 0 || y < 0 || x >= w || y >= img._height) return 0;
      return img.data[x + y * w];
    };
  }

  globalThis.arcade_step = function (dt) {
    try {
      var r = __pump(1);
      if (prof) {
        profFrames++;
        if (profFrames === 300) profDump();
      }
      return r;
    } catch (e) {
      try { __native_log("error", "step: " + errText(e)); } catch (e2) {}
      return -1;
    }
  };

  var rgbaBuf = null;

  globalThis.arcade_rgba = function () {
    var b = board();
    var st = b && b.screenState;
    var s = st && st.screen;
    if (!s || !s.length) {
      // 还没初始化：返回已分配的黑屏（首次则现做一个）
      if (!rgbaBuf) rgbaBuf = new Uint8ClampedArray(160 * 120 * 4);
      return rgbaBuf;
    }
    if (!rgbaBuf || rgbaBuf.length !== s.length * 4) {
      rgbaBuf = new Uint8ClampedArray(s.length * 4);
    }
    // screenState.screen 是 canvas ImageData 的 uint32 视图（小端）：
    // 0xAABBGGRR —— 低字节是 R。转成 RGBA 字节序。
    var d = rgbaBuf;
    for (var i = 0, j = 0; i < s.length; i++, j += 4) {
      var v = s[i];
      d[j] = v & 255;
      d[j + 1] = (v >> 8) & 255;
      d[j + 2] = (v >> 16) & 255;
      d[j + 3] = 255;
    }
    return rgbaBuf;
  };

  /* 快路径：直接把 pxt 的 uint32 屏缓冲（0xAABBGGRR）交给 C 侧。
     C 一趟转成 XRGB8888，比在 JS 里逐像素写 Uint8ClampedArray 快一个数量级
     （设备上这一项每帧能省 10ms 以上）。返回非 typed array 时 C 会退回 arcade_rgba。 */
  globalThis.arcade_fb32 = function () {
    var b = board();
    var st = b && b.screenState;
    var s = st && st.screen;
    if (!s || !s.length || !s.buffer) return null;
    if (s.length < 160 * 120) return null;
    return s;
  };

  /* 更快的取帧（曾经试过：直接读 lastImage 的 8bpp 索引图 + 调色板，让 C 展开）。
     实测屏幕开销已经很低（19200 次简单循环在解释器里也就 0.1ms 量级），而 lastImage
     是「活动缓冲」，和 screenState.screen（刷屏那一刻的快照）不是同一时刻的画面，
     读它会和真实显示差一列像素（cube-land 的对话框精灵就撞上了）。收益不值风险，
     所以取帧统一走 screenState.screen（arcade_fb32）。 */

  globalThis.arcade_set_button = function (name, down) {
    try {
      var k = KEYMAP[String(name)];
      if (!k) return 0;
      var b = board();
      if (!b || typeof b.setButton !== "function") return 0;
      // 文本输入模式下先退出来，防止按键被输入框吃掉
      if (pxsim.Keyboard && typeof pxsim.Keyboard.cancelSystemKeyboard === "function") {
        pxsim.Keyboard.cancelSystemKeyboard();
      }
      b.setButton(k, !!down);
      return 1;
    } catch (e) {
      try { __native_log("error", "button " + name + ": " + errText(e)); } catch (e2) {}
      return 0;
    }
  };

  // 诊断：把 console.error / runtime 异常的最近几条吐出来（coretest 用）
  globalThis.arcade_diag = function () {
    return typeof __takeLogs === "function" ? __takeLogs() : "";
  };

  globalThis.__pxtGlueState = state;
})();
