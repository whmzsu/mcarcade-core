# tools/dev —— 开发期探针（历史脚本，非构建链路）

这些脚本是调试过程中攒下来的，**不参与 `zig build`**，路径按当前目录结构改过，
但不保证每条都能直接跑（依赖当时的临时工程 / 特定卡带）。

| 脚本 | 用途 |
|---|---|
| `qjs_perf.js` | 在 Node 里用同一套 `runtime/*.js` + 官方 sim 跑游戏，验证 JS 层改动 |
| `sim_run.js` | 只加载 `binary.js` 跑若干帧 → PPM，最快看 sim 层效果 |
| `pxt_compile.js` | 不走 `cart_build.js`，手工调 pxtc 的最小样例 |
| `build_pxt.js` | 早期"一次跑完编译 + 出图"的脚本 |
| `pxt_probe.js` | 逐帧打印 sim 状态（帧号、精灵数、按键） |
| `batch_test.sh` | 批量跑一批卡带并汇总非黑像素数 |
| `mkpng.py` | 卡带编解码（`decode` 拆出工程，`from-share` 用分享 ID 造卡带） |
| `ppm_probe.py` | PPM 统计（非黑像素、色数、区域差分） |
| `qjsbench.c` / `qjs_eval.c` | QuickJS 命令行小工具（性能基准 / 单文件 eval） |
| `build_linux.sh` | 旧的手工 `zig cc` 构建脚本，已被 `zig build` 取代 |
| `dll_smoke.py` | ctypes 当假前端直接驱动 DLL，**在 1MB 栈线程里**跑一张卡带（复现 RetroArch 的栈条件，v0.10 起还有用） |
| `embed_probe/` | 内嵌编译器可行性探针（`qjsrun.c` 最小 QuickJS 宿主 + `harness.js` 胶水 + 实测数据） |

**日常用不到的**：`cart_build.js`、`ppm2png.js`、`setup_pxtc.js` 在上级 `tools/`，
那是正式工具链。

## 已移出

v0.8 手写运行时那一套（`legacy/v0.8/`，加上 `lib/host.js`、`menu_test.js`、`probe_game.js`、
`probe_keys.js`、`run_node.js`、`cart_audit.js`、`probe_pxt.js`、`gen_menu_assets.py`）
已在 v0.10 从主线移除：v0.9 起官方 sim 是唯一运行时，那套代码只剩"pxt 语义在 JS 里怎么实现"
的阅读价值。要跑 v0.8 请用 `out/mcarcade-core-0.8-*.zip`，源码从 git 历史取。
