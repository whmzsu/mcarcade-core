/*
 * pxt_timers.js —— QuickJS 内核用的时钟前导。
 *
 * v2（音频落地时升级）：真实时间驱动。
 *   - __now 每次泵按真实流逝时间推进（Date.now 差值，单次上限 200ms 防后台爆发）
 *   - setTimeout/setInterval 按 ms 到期触发（到期几个跑几个，最多追 5 次防雪崩）
 *   - performance.now() 返回 __now，初值 1000（pxt 启动检查 "bad time now"）
 * 这与 Node 参考实现（sim_run.js 用真定时器）行为一致；v0.9 初版的
 * "每轮跑光全部定时器" 会让 20ms 的 runtime 调度泵变成 16.7ms，游戏节奏偏快。
 *
 * console.* 转发给 C 侧 __native_log（pxt 内部吞异常，只有这里能看见）。
 */
var __timers = [], __intervals = {}, __tid = 0, __now = 1000;
var __lastPump = Date.now();
function setTimeout(fn, ms) { __timers.push({ t: __now + (ms || 0), fn: fn }); return ++__tid; }
function clearTimeout(id) {}
function setInterval(fn, ms) { __intervals[++__tid] = { fn: fn, ms: (ms || 0), next: __now + (ms || 0) }; return __tid; }
function clearInterval(id) { delete __intervals[id]; }
function requestAnimationFrame(fn) { __timers.push({ t: __now + 16.6667, fn: fn }); return ++__tid; }
function cancelAnimationFrame(id) {}
function __pump(n) {
  var wall = Date.now();
  var dt = wall - __lastPump;
  if (dt < 0) dt = 0;
  if (dt > 200) dt = 200;
  __lastPump = wall;
  __now += dt;
  var ran = 0, guard = 0;
  for (;;) {
    var best = -1;
    for (var j = 0; j < __timers.length; j++)
      if (__timers[j].t <= __now && (best < 0 || __timers[j].t < __timers[best].t)) best = j;
    if (best < 0 || ++guard > 5000) break;
    var it = __timers.splice(best, 1)[0];
    try { it.fn(); ran++; }
    catch (e) { __logs.push("[timer] " + (e && e.message || e)); }
  }
  for (var k in __intervals) {
    var iv = __intervals[k], g2 = 0;
    while (iv.next <= __now && g2++ < 5) {
      try { iv.fn(); ran++; }
      catch (e) { __logs.push("[interval] " + (e && e.message || e)); }
      iv.next += (iv.ms || 16.6667);
    }
  }
  return ran;
}
var performance = { now: function () { return __now; } };
var __logs = [];
var console = {
  log: function () {
    var m = Array.prototype.join.call(arguments, " ");
    __logs.push(m);
    try { __native_log("log", m); } catch (e) {}
  },
  warn: function () {
    var m = "[warn] " + Array.prototype.join.call(arguments, " ");
    __logs.push(m);
    try { __native_log("warn", m); } catch (e) {}
  },
  error: function () {
    var m = "[err] " + Array.prototype.join.call(arguments, " ");
    __logs.push(m);
    try { __native_log("error", m); } catch (e) {}
  },
  info: function () {}, debug: function () {}, trace: function () {},
  setPriority: function () {}, inspect: function (x) { return String(x); }
};
function __takeLogs() { var l = __logs; __logs = []; return l.slice(0, 15).join(" | "); }
