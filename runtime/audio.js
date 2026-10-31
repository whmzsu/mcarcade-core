/*
 * pxt_audio.js —— 官方音频出口的离线渲染器（WebAudio → 44.1kHz int16）
 *
 * 原理：不模拟 WebAudio 图，直接拦截 pxsim.AudioContextManager 的两个出口：
 *   1. tone(freq, gain) / setCurrentToneGain / stop   —— music.playTone 走这里
 *      （AudioToneSource：单个持续音色，gain 用 15ms setTargetAtTime 包络）
 *   2. playInstructionsAsync(instructions) / queuePlayInstructions —— 旋律和
 *      soundExpression 走这里。指令格式（pxtsim.js PlayInstructionsSource，
 *      每条 12 字节小端）：
 *        [i+0]  wave       0=休止 1=triangle 2=sawtooth 3=sine
 *                          4=rect噪声 5=白噪声 11..15=方波(占空比 (wave-10)*10%)
 *                          16..18=循环噪声
 *        [i+2]  startFreq  u16
 *        [i+4]  duration   u16 (ms)
 *        [i+6]  startVol   u16   实际幅度 = v/1024/4，方波再 ×0.5
 *        [i+8]  endVol     u16
 *        [i+10] endFreq    u16   段内线性斜坡
 *
 * 时间轴用 pxt_timers 的虚拟时钟 __now（ms）。C 侧每帧调 arcade_audio()
 * 取走自上帧以来的采样（44100/60 ≈ 735 个）。
 *
 * 近似（与真实 worklet 的差异）：
 *   - 噪声类(4/5/16-18)一律渲染为白噪声（原版 rect/cycle 噪声带 playbackRate 调制）
 *   - 段间换 wave 时的 15ms setTargetAtTime 交叉淡化没做（原版段首音量通常是包络给的）
 */
(function () {
  "use strict";
  if (typeof pxsim === "undefined" || !pxsim.AudioContextManager) return;
  var ACM = pxsim.AudioContextManager;
  var SR = 44100;              // 与 core.c AUDIO_HZ 保持一致
  var TC_MS = 15;              // setTargetAtTime(…, 0.015s)

  // ---------- 状态 ----------
  var acur = 1000;             // 已渲染到的虚拟时间 (ms)，与 __now 初值一致
  var voices = [];             // 进行中的音源
  var pendings = [];           // 待 resolve 的 playInstructionsAsync promise
  var rngState = 0x9e3779b9;

  function now() { return typeof __now === "number" ? __now : 0; }

  // ---------- 渲染 ----------
  // 性能关键路径（设备上 audio 占过 5.4ms/帧，主要浪费在：
  //  1) 每个采样都 segAt 线性扫描旋律段数组 → 改为游标推进，每段只走一次
  //  2) 每采样 Math.exp（包络）/ Math.sin（正弦）→ 增量包络 + 查表
  //  3) 每帧 new Int16Array → 复用缓冲
  var MSPS = 1000 / SR;                       // 每采样毫秒数
  var gk = Math.exp(-MSPS / TC_MS);           // tone 包络每采样衰减因子
  var SIN_N = 4096, SIN_MASK = SIN_N - 1;
  var SIN = new Float32Array(SIN_N);
  for (var si = 0; si < SIN_N; si++) SIN[si] = Math.sin(2 * Math.PI * si / SIN_N);
  var mixBuf = new Float32Array(SR / 10 | 0); // 混音缓冲（复用）
  var outBuf = null;                          // 输出缓冲（复用）
  var EMPTY = new Int16Array(0);

  function noise() {
    // xorshift32 → [-1, 1)
    rngState ^= rngState << 13; rngState >>>= 0;
    rngState ^= rngState >> 17;
    rngState ^= rngState << 5; rngState >>>= 0;
    return (rngState / 0x7fffffff) - 1;
  }

  function toneGainAt(v, tMs) {
    var dt = tMs - v.gt;
    if (dt <= 0) return v.g;
    return v.target + (v.g - v.target) * Math.exp(-dt / TC_MS);
  }

  // tone 音色：单音，包络按每采样 gk 递推（与 exp 解析式等价的离散近似）
  function renderTone(v, n) {
    var t = acur;
    var g = toneGainAt(v, t);            // 原始包络（未乘 0.35）
    var tgt = v.target;
    var ph = v.phase;
    var inc = v.freq / SR;
    var end = v.end === null ? Infinity : v.end;
    for (var i = 0; i < n; i++) {
      if (t >= v.start && t < end) {
        var p = ph - Math.floor(ph);
        var w = p < 0.5 ? 1 - 4 * p : 4 * p - 3;          // triangle（[-1,1]，等价 2|2p-1|-1）
        mixBuf[i] += w * g * 0.35;
      }
      g = tgt + (g - tgt) * gk;
      ph += inc;
      t += MSPS;
    }
    v.g = g; v.gt = acur + n * MSPS; v.phase = ph;
  }

  // 指令音源：游标只前进不回扫；段间空隙整块跳过
  function renderInstr(v, n) {
    var segs = v.segs;
    var end = v.end === null ? Infinity : v.end;
    var si = v.curSeg | 0;
    if (si >= segs.length || acur < segs[si].t0) si = 0;   // 时钟回退/新声源
    var t = acur;
    var ph = v.phase;
    var i = 0;
    while (i < n) {
      if (t >= end) { i = n; break; }
      if (t < v.start) {                     // 还没开始：跳到开始
        var skip0 = Math.ceil((v.start - t) / MSPS);
        if (skip0 > n - i) break;
        i += skip0; t += skip0 * MSPS;
        continue;
      }
      var seg = null;
      while (si < segs.length) {
        var s = segs[si];
        if (t < s.t1) { if (t >= s.t0) seg = s; break; }
        si++;
      }
      if (!seg) {                            // 段间休止：跳到下一段起点或本帧末尾
        var next = si < segs.length ? segs[si].t0 : Infinity;
        var lim = next < end ? next : end;
        var skip = Math.ceil((lim - t) / MSPS);
        if (skip <= 0) skip = 1;
        if (skip > n - i) { i = n; break; }
        i += skip; t += skip * MSPS;
        continue;
      }
      // 段内：频率/音量线性斜坡，波形查表/内联
      var span = seg.t1 - seg.t0;
      var fdf = (seg.f1 - seg.f0) / (span / MSPS);   // 每采样频率增量
      var vdf = (seg.v1 - seg.v0) / (span / MSPS);
      var f = seg.f0 + (t - seg.t0) * (seg.f1 - seg.f0) / span;
      var vol = seg.v0 + (t - seg.t0) * (seg.v1 - seg.v0) / span;
      var wave = seg.wave, duty = seg.duty;
      var segEnd = seg.t1 < end ? seg.t1 : end;
      while (i < n && t < segEnd) {
        var p = ph - Math.floor(ph);
        var w;
        if (wave === 1) w = p < 0.5 ? 1 - 4 * p : 4 * p - 3;         // triangle
        else if (wave === 2) w = 2 * p - 1;                          // sawtooth
        else if (wave === 3) w = SIN[(p * SIN_N) & SIN_MASK];        // sine 查表
        else if (wave >= 11 && wave <= 15) w = p < duty ? 1 : -1;    // 方波
        else w = noise();                                            // 噪声类
        mixBuf[i] += w * vol;
        ph += f / SR;
        f += fdf;
        vol += vdf;
        i++; t += MSPS;
      }
      if (ph > 1e6) ph -= Math.floor(ph);
    }
    v.curSeg = si;
    v.phase = ph;
  }

  // C 侧每帧调用：渲染 (当前虚拟时间 - acur) 的采样
  globalThis.arcade_audio = function () {
    var target = now();
    var n = Math.floor((target - acur) * SR / 1000);
    var cap = SR / 10 | 0;                     // 单帧最多 100ms，防卡顿后爆发
    if (n > cap) n = cap;
    if (n <= 0) return EMPTY;
    for (var i = 0; i < n; i++) mixBuf[i] = 0;
    for (var vi = voices.length - 1; vi >= 0; vi--) {
      var v = voices[vi];
      if (v.end !== null && target >= v.end) {
        if (v.kind === "instr") voices.splice(vi, 1);
        continue;
      }
      if (v.kind === "tone") renderTone(v, n);
      else renderInstr(v, n);
    }
    if (!outBuf || outBuf.length < n) outBuf = new Int16Array(cap);
    for (var j = 0; j < n; j++) {
      var s = mixBuf[j];
      if (s > 1) s = 1; else if (s < -1) s = -1;
      outBuf[j] = (s * 32767) | 0;
    }
    acur += n * MSPS;
    return outBuf.subarray(0, n);
  };

  function u16(buf, off) { return buf[off] | (buf[off + 1] << 8); }

  // ---------- 音源 ----------
  // tone 音色（单例）：三角波，gain 走 15ms setTarget 包络
  var toneV = null;

  function ensureTone() {
    if (!toneV) {
      toneV = { kind: "tone", wave: 1, freq: 0, g: 0, target: 0, gt: now(), phase: 0, start: 0, end: null };
      voices.push(toneV);
    }
    return toneV;
  }

  // 指令音源：segs 相对时间平移到绝对时间轴
  function makeInstrVoice(segs, startMs, totalMs) {
    for (var i = 0; i < segs.length; i++) {
      segs[i].t0 += startMs;
      segs[i].t1 += startMs;
    }
    var v = { kind: "instr", segs: segs, start: startMs, end: startMs + totalMs, phase: 0 };
    voices.push(v);
    return v;
  }

  function scaleVol(n, isSquare) { return (n / 1024 / 4) * (isSquare ? 0.5 : 1); }

  // 启动/重置时对齐时钟、清空音源
  globalThis.__audioReset = function () {
    acur = now();
    voices = [];
    toneV = null;
    resolveAll();
  };

  function resolveAll() {
    var p = pendings; pendings = [];
    for (var i = 0; i < p.length; i++) { try { p[i](); } catch (e) {} }
  }

  // ---------- 拦截官方出口 ----------
  ACM.tone = function (frequency, gain) {
    if (!(frequency >= 0)) return;
    var v = ensureTone();
    var t = now();
    v.g = toneGainAt(v, t);          // 冻结当前包络值作为新的起点
    v.gt = t;
    v.target = (typeof gain === "number" ? gain : 1);
    v.freq = frequency;
    if (v.end !== undefined) v.end = null;
    v.start = 0;
  };

  ACM.setCurrentToneGain = function (gain) {
    if (!toneV) return;
    var t = now();
    toneV.g = toneGainAt(toneV, t);
    toneV.gt = t;
    toneV.target = gain;
  };

  ACM.stop = function () {
    ACM.setCurrentToneGain(0);
  };

  ACM.stopAll = function () {
    ACM.setCurrentToneGain(0);
    var t = now();
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].kind === "instr" && voices[i].end > t) voices[i].end = t;
    }
    resolveAll();
  };

  ACM.playInstructionsAsync = function (instructions, isCancelled, onPull) {
    var segs = [];
    var totalMs = 0;
    try {
      for (var i = 0; i + 11 < instructions.length; i += 12) {
        var wave = instructions[i];
        var durMs = u16(instructions, i + 4);
        if (wave === 0) { totalMs += durMs; continue; }
        var isSq = wave >= 11 && wave <= 15;
        segs.push({
          t0: totalMs, t1: totalMs + durMs, wave: wave,
          f0: u16(instructions, i + 2), f1: u16(instructions, i + 10),
          v0: scaleVol(u16(instructions, i + 6), isSq),
          v1: scaleVol(u16(instructions, i + 8), isSq),
          duty: isSq ? (wave - 10) / 10 : 0.5,
        });
        totalMs += durMs;
      }
    } catch (e) { }
    var startMs = now();
    if (segs.length && totalMs > 0) makeInstrVoice(segs, startMs, totalMs);
    // 官方实现会等 totalDuration 才 resolve（music.play 等它播完才继续游戏）
    return new Promise(function (resolve) {
      var p = { resolve: resolve, end: startMs + totalMs };
      pendings.push(p);
      setTimeout(function () {
        var idx = pendings.indexOf(p);
        if (idx !== -1) pendings.splice(idx, 1);
        resolve();
      }, totalMs);
    });
  };

  // queuePlayInstructions 内部引用的是 pxtsim.js 里的局部函数，属性覆盖拦不到，
  // 这里按官方语义重写（U.delay 也是 setTimeout，本就在虚拟时钟里跑）
  ACM.queuePlayInstructions = function (when, b) {
    setTimeout(function () {
      ACM.playInstructionsAsync(b && b.data);
    }, when || 0);
  };

  // 采样播放类出口（带 .wav 资源的扩展用）：v1 先吞掉并打日志
  var warned = {};
  function warnOnce(k) {
    if (warned[k]) return;
    warned[k] = 1;
    try { __native_log("warn", "[audio] unsupported path: " + k + " (silenced)"); } catch (e) {}
  }
  ["playBufferAsync", "playPCMBufferStreamAsync", "startSamplePlayback"].forEach(function (k) {
    if (typeof ACM[k] === "function") {
      var orig = ACM[k];
      ACM[k] = function () { warnOnce(k); return orig.apply(this, arguments); };
    }
  });
})();
