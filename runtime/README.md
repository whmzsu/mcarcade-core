# runtime —— 嵌进 core 的 JS 层

这 4 个文件按固定顺序拼成 `pxt_bundle.h`（C 字节数组），core 启动时一次性 `JS_Eval`。
**顺序不能换**（`scripts/gen_bundle.py` 里写死）：

```
timers.js     真实时间驱动的 setTimeout / setInterval / rAF / performance.now + console 转发
dom_mock.js   installMockDom(globalThis) —— DOM、WebAudio、TextEncoder 最小替身
              ↓ 紧接着调用 installMockDom
pxtsim.js     pxt-core 官方 sim 基座（pxsim、CPS、事件总线）
common-sim.js pxt-common-packages 通用外设 shim
sim.js        pxt-arcade 专属：screen / board / buttons / ImageData
audio.js      拦截 pxsim.AudioContextManager 的 tone / playInstructionsAsync → 44.1kHz int16
glue.js       C 入口：arcade_boot / arcade_step / arcade_rgba / arcade_set_button / arcade_audio
```

## 约定

- **ES5 风格**：QuickJS 能跑 ES2020，但这里刻意不用模块、不用 `const/let` 之外的语法糖，
  因为整包是 `JS_EVAL_TYPE_GLOBAL` 直接 eval 的脚本。
- **只依赖前三层暴露的全局对象**（`pxsim`、`installMockDom`），相互之间不 `require`。
- 改完任意一个文件，下次 `zig build` 会自动重新生成 bundle（build.zig 里是显式的生成步骤）。

## 常见改动

| 想改什么 | 改哪 |
|---|---|
| 新增 C → JS 的入口 | `glue.js`，同时改 `src/core.c` 的 `JS_GetPropertyStr` 名字 |
| 新增前端按键 | `glue.js` 的 key 表 + `src/core.c` 的 `g_buttons` |
| 音频音色 / 音量 | `audio.js`（wave 表见文件头注释） |
| 时钟精度 / 一帧推进多少毫秒 | `timers.js` 的 `__pump()` 与 `FRAME_MS` |
| 补 DOM/WebAudio 缺失 API | `dom_mock.js`（pxt 报 "xxx is not a function" 时先看这里） |
