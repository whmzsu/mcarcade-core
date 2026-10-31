/*
 * glue.js —— 给 C 核心调用的全局入口。
 *
 * C 侧只需：
 *   js = JS_Eval(tsstrip + arcade + glue)
 *   arcade_boot(main_ts_source)          -> "" 或错误字符串
 *   arcade_set_button(name, down)        -> name: "left"|"right"|"up"|"down"|"A"|"B"|"menu"
 *   arcade_step(dt_ms)                   -> 推进一帧
 *   arcade_rgba()                        -> Uint8Array(160*120*4)，拷贝出去即可
 *
 * 若宿主注册了 __native_log / __native_tone，会自动接上。
 */
(function (gl) {
  "use strict";

  var rt = null;
  var pendingError = "";

  function nativeLog(level, msg) {
    if (typeof __native_log === "function") __native_log(String(level), String(msg));
  }

  gl.arcade_boot = function (source) {
    try {
      rt = new Arcade.Runtime({
        log: function (lvl, m) { nativeLog(lvl, m); },
        warn: function (m) { nativeLog("warn", m); },
        tone: function (freq, ms, vol) {
          if (typeof __native_tone === "function") __native_tone(freq | 0, ms | 0, vol | 0);
        },
        audioStop: function () {
          if (typeof __native_stop_audio === "function") __native_stop_audio();
        },
        now: function () { return clock; },
        present: function () { }
      });
      // source 可能是整个工程的文件表 JSON，也可能是裸 main.ts
      rt.boot(String(source));
      clock = 0;
      pendingError = "";
      return "";
    } catch (e) {
      pendingError = (e && e.message) ? e.message : String(e);
      nativeLog("error", pendingError);
      return pendingError;
    }
  };

  var clock = 0;
  var rgbaBuf = new Uint8Array(160 * 120 * 4);

  gl.arcade_step = function (dtMs) {
    if (!rt) return;
    try {
      clock += dtMs;
      rt.tick(dtMs);
      rt.render();
    } catch (e) {
      rt = null;
      pendingError = (e && e.message) ? e.message : String(e);
      nativeLog("error", "frame: " + pendingError);
    }
  };

  gl.arcade_rgba = function () {
    if (!rt) return rgbaBuf;
    return rt.toRGBA(rgbaBuf);
  };

  gl.arcade_set_button = function (name, down) {
    if (!rt) return;
    try { rt.setButton(String(name), !!down); }
    catch (e) { nativeLog("warn", "button: " + e.message); }
  };

  gl.arcade_error = function () { return pendingError; };
  gl.arcade_ready = function () { return rt ? 1 : 0; };
})(this);
