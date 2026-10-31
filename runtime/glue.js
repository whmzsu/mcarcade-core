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
      state.booted = true;
      return "";
    } catch (e) {
      state.failed = errText(e);
      try { __native_log("error", "boot: " + state.failed); } catch (e2) {}
      return state.failed;
    }
  };

  globalThis.arcade_step = function (dt) {
    try {
      return __pump(1);
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
