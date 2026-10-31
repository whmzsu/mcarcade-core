# MakeCode Arcade —— libretro 核心

在 RetroArch 里玩 MakeCode Arcade 的卡带。不模拟硬件，直接在 QuickJS 里跑**官方 pxt runtime**
（`pxtsim.js` + `common-sim.js` + `sim.js`），游戏语义与 makecode.com 浏览器里跑的是同一份代码。

- 主线 **v0.10**：**把官方 pxt 编译器内嵌进了核心**——拖 `.png` 卡带进去，当场编成 `binary.js` 再跑，
  不需要 PC 预热。也仍然可以直接加载现成的 `binary.js`。
- 旧版 **v0.9**：只认 `.js`，`.png` 得先在 PC 上用 `tools/cart_build.js` 转换。
- 更旧 **v0.8**：手写兼容层（直接吃 `.png`）。其 JS 运行时保留在 `legacy/v0.8/` 供参考，
  预编译核心见 `out/mcarcade-core-0.8-*.zip`。

```
RetroArch ── arcade_libretro.{dll,so} ──┬─ src/core.c       libretro 接口 + QuickJS 宿主 + 每帧抽干 microtask
                                        ├─ src/cart.c       PNG 卡带解析（低位隐写 + LZMA）
                                        ├─ src/compiler.c   开临时 QuickJS，跑内嵌 pxt 编译器（png → binary.js）
                                        ├─ pxt_bundle.h           官方三层 sim + DOM/WebAudio mock + glue（≈1.03 MB，构建时生成）
                                        ├─ pxt_compiler_bundle.h  pxt_hack.js + target.json + 胶水（≈2 MB，构建时生成）
                                        └─ game.js / game.png     由前端作为"内容"载入
```

`png` 与 `js` 走同一条下游：编译产物和现成 `.js` 都交给同一个 `js_boot_impl()`。

---

## 1. 目录结构

```
makecode-arcade-core/
├── build.zig              ★ Zig 构建脚本（本机 / 交叉 / release / test）
├── build.zig.zon          包元信息
├── Makefile               薄壳，全部转发到 zig build
├── LICENSE / NOTICE.md    MIT + 第三方组件声明
├── src/                   C 源码
│   ├── core.c             libretro 接口：视频 160×120 XRGB8888、按键、音频、QuickJS 宿主
│   ├── cart.c/.h          PNG 卡带解析（低位隐写 + LZMA），自检与工具复用
│   ├── decompress.c/.h    LZMA-alone 解压（卡带 blob 与编译器载荷共用）
│   └── compiler.c/.h      内嵌编译器：临时 QuickJS + 6 个宿主函数 → binary.js
├── runtime/               ★ 嵌进 core 的 JS（按顺序拼成 pxt_bundle.h）
│   ├── timers.js          真实时间驱动的 setTimeout/setInterval/rAF + console 转发
│   ├── dom_mock.js        DOM / WebAudio / TextEncoder 替身（QuickJS 无这些）
│   ├── audio.js           拦截官方 AudioContextManager 出口 → 44.1kHz int16 离线渲染
│   ├── glue.js            四个 C 入口：arcade_boot / step / rgba / set_button
│   └── compiler.js        内嵌编译器的胶水（打包进 pxt_compiler_bundle.h）
│                          内存 VFS + path/fs/os/crypto/util/Buffer 替身 + CommonJS 装载器 + __compile
├── tools/
│   ├── setup_pxtc.js      一次性准备 pxtc 环境（npm 装 pxt-arcade；构建核心里也要它来生成载荷）
│   ├── cart_build.js      卡带 PNG → binary.js（PC 端官方 pxtc 编译，与内嵌编译器产物逐字节一致）
│   ├── fetch_ext.js       github: 扩展源码抓取（jsdelivr 镜像）
│   ├── ppm2png.js         PPM → PNG（看自检出图）
│   ├── lib/host.js        卡带编解码 + pxtc 调用封装（Node 侧，C 里有等价实现）
│   └── dev/               开发期的探针脚本（Node 对照、QuickJS 性能、菜单自测等，见其 README）
│       └── embed_probe/   内嵌编译器可行性探针（qjsrun.c + harness.js + 实测数据）
├── tests/
│   ├── core_test.c        假前端：直接调 retro_* 跑帧 → PPM
│   ├── cart_test.c        只测卡带解析
│   ├── btn_test.c         按键映射自检
│   └── data/              测试卡带与 pxtc 产物（ping.js / ping.png 等）
├── scripts/
│   ├── gen_bundle.py      runtime/*.js + pxt-sim → pxt_bundle.h
│   ├── gen_compiler_bundle.py  pxt_hack.js + target.json + runtime/compiler.js → pxt_compiler_bundle.h
│   └── fetch_deps.py      首次拉第三方源码到 third_party/
├── third_party/           quickjs / miniz / lzma / libretro / pxt-sim（原样入库，clone 即可编译）
├── legacy/v0.8/           旧手写运行时（js/*.js + 打包脚本；js_bundle.h 是产物，不入库）
└── dist/                  只入库 arcade_libretro.info；dll/so 走 GitHub Releases
```

`pxt_bundle.h` / `pxt_compiler_bundle.h` 都是**构建产物**，不进仓库：`scripts/gen_bundle.py`、
`scripts/gen_compiler_bundle.py` 在编译前生成到构建缓存，由 `build.zig` 加进 include 路径。

仓库体积与边界（`.gitignore` 已按此配置）：

| 内容 | 入库 | 说明 |
|---|---|---|
| `src/` `runtime/` `scripts/` `tools/` `tests/` | ✅ | 全部源码与自检数据，约 5 MB |
| `third_party/`（quickjs/miniz/lzma/libretro/pxt-sim） | ✅ | 原样 vendored，约 4 MB，`git clone` 后不需要联网拉依赖 |
| `dist/arcade_libretro.info` | ✅ | 1 KB 文本，供 RetroArch 识别 |
| `dist/*.dll` `dist/*.so`、`out/*.zip` | ❌ | 二进制发布物，走 GitHub Releases |
| `build/` `.zig-cache/` `zig-out/` | ❌ | 构建缓存，可重新生成 |
| `third_party/pxt-src/` | ❌ | pxt 的 TS 参考源码（2.9 MB），仅查阅用，不参与构建 |

---

## 2. 构建

依赖：**Zig 0.14+**（自带 clang，不需要系统 C 编译器）、**Python 3**、**Node + pxtc 环境**。
不需要系统 zlib/lzma（全部 vendored）。

`third_party/` 里的 QuickJS / miniz / lzma / libretro.h / pxt-sim 都是**原样入库**的，
`git clone` 后直接能编，不用先联网拉依赖（`scripts/fetch_deps.py` 只在升级版本时用）。
唯一的联网步骤是下面这行装 pxtc。

```bash
# 内嵌编译器的载荷要从 pxtc 里取，编核心前先装一次（只影响构建，运行期不需要 Node）
node tools/setup_pxtc.js          # → %TEMP%\pxtbuild；或用 -Dpxtbuild=<目录> 指别处

# 自检：PNG 卡带解析 + ping.js 跑 90 帧（约定 389 个非黑像素）
zig build test

# 只编自检程序 → zig-out/bin/{cart_test,core_test,btn_test}
zig build tools
```

```bash
# 本机平台（Windows → .dll / Linux → .so / macOS → .dylib）
zig build                      # 产物：zig-out/lib/arcade_libretro.<ext> + zig-out/info/

# 交叉编译任意目标
zig build -Dtarget=aarch64-linux-gnu              # 树莓派 / ARM 盒子
zig build -Dtarget=x86_64-windows-gnu             # 在 Linux 上出 Windows DLL

# 一次出全部发布目标
zig build release                                 # Windows x64 / Linux x64 / Linux aarch64
zig build release -Dndk=<NDK 根目录>               # 再加 Android aarch64
zig build android -Dndk=<NDK 根目录>               # 只出 Android

# 其他开关
zig build -Doptimize=Debug          # 默认 ReleaseFast
zig build -Dstrip=false             # 默认剥离符号（6.4MB → 2.2MB）
zig build -Dpython=python3.12       # 默认 Windows=python，其他=python3
zig build -Dpxtbuild=D:/pxtbuild    # pxtc 环境目录（默认 $PXTBUILD / %TEMP%/pxtbuild）
zig build -Dincart_compiler=false   # 不内嵌编译器：核心 6.4MB → 2.2MB，只认现成 .js
```

`-Dincart_compiler=false` 出的是"瘦核心"：`.png` 卡带会明确提示"本构建没有内嵌编译器"，
并给出 PC 端的转换命令，不会静默失败。**不加这个开关时，构建机必须有 pxtc 环境**——
载荷是在构建期从 `pxt-core/pxt-arcade` 里打包的，运行时不需要 Node。

产物命名是 libretro 的硬要求，`build.zig` 已经用 `dest_sub_path` 固定成
`arcade_libretro.<ext>`（不带 `lib` 前缀）；交叉编译到 aarch64/安卓时文件名带后缀，方便同时放多份。

**Android 为什么要 `-Dndk`**：Zig 不带 bionic libc，Android 目标必须借 NDK 的
`sysroot`（头文件 + `crtbegin_so.o` + `libc.so/libdl.so/libm.so` stub）。`build.zig` 会自动
定位 `<NDK>/toolchains/llvm/prebuilt/<host>/sysroot`，并按 `-Dandroid-api`（默认 21）选库目录。

`Makefile` 只是薄壳，转发到 zig（保留老习惯）：

```bash
make                     # = zig build
make release             # = zig build release
make test                # = zig build test
make cart PNG=卡带.png    # = node tools/cart_build.js ... -o out/卡带/
make clean               # 删 zig-out / .zig-cache / build
```

> 首次构建若缺第三方源码：`python scripts/fetch_deps.py`。
> **Zig 版本**：`build.zig` 用 0.14+ 的模块化 API（`b.createModule` / `b.addLibrary`），
> 在 0.17.0 上验证通过。
> 若你的 Zig 报 `lib/std/... FileNotFound`，说明这套 Zig 安装被裁过（只留了 `lib/std/std.zig`），
> 重下完整发行包覆盖即可 —— `zig cc` 不需要 std 所以能照常跑，`zig build` 会立刻暴露。

---

## 3. 用起来

**直接把 `.png` 卡带丢给 RetroArch**（从 makecode.com 下载的那个文件，别改后缀）：

```bash
retroarch -L <cores>/arcade_libretro.so 游戏.png
```

加载时会当场编译：`PNG 卡带 → 取出工程 → 装 pxt_modules → pxtc.compile → binary.js → 启动`。
首次约 **4~5 秒**；核心不写盘，所以每次 load 都会重编。编译期间屏幕是黑的，属正常，
日志里会看到进度：

```
[arcade] PNG 卡带 13901 字节，正在取出工程
[arcade] 工程源码 7338 字节（文件表）
[arcade] 开始编译（首次约 5~6 秒，请稍候）…
[arcade] [编译器] 卡带文件 4 个: README.md, assets.json, main.ts, pxt.json
[arcade] 编译完成：binary.js 2220597 字节，用时 4.5 秒
[arcade] game booted
```

**也可以直接加载现成的 `.js`**（PC 上编好的，或朋友给的），启动只要 0.3 秒：

```bash
node tools/setup_pxtc.js                       # 只需一次：npm 装 pxt-arcade/pxt-core
node tools/cart_build.js 游戏.png -o out/游戏名/
retroarch -L <cores>/arcade_libretro.so out/游戏名/binary.js
```

带 `github:` 扩展的卡带（扩展源码不在 PNG 里）**只能**走 PC 这条路——内嵌编译器不联网：

```bash
node tools/fetch_ext.js shakao/pxt-gamejam-timer v0.0.22 build/exts/pxt-gamejam-timer
node tools/cart_build.js 游戏.png -o out/游戏名/ --extdir=build/exts
```

两条路的产物是**同一份东西**：内嵌编译器和 `cart_build.js` 出的 `binary.js` 逐字节一致
（`md5` 相同，拿 `ARCADE_DUMP_JS` 落盘对比过）。

### 装进 RetroArch

| 平台 | core 放 | `.info` 放 |
|---|---|---|
| Windows | `RetroArch\cores\arcade_libretro.dll` | `RetroArch\info\arcade_libretro.info` |
| Linux | `~/.config/retroarch/cores/arcade_libretro.so` | `~/.config/retroarch/info/` |
| macOS | `~/Library/Application Support/RetroArch/cores/arcade_libretro.dylib` | 同名 `info/` |
| Android | `Android/data/com.retroarch.aarch64/cores/arcade_libretro.so` | 同级 `info/` |

**报 "no cores available" 的三大原因**：`.info` 放进了 `cores/` 而不是 `info/`；`.info` 与 core
文件名前缀不一致；给 Windows 用了 `.so`（或反之）。改完重启 RetroArch。

安卓 sideload 版包名是 `com.retroarch`，路径里替换即可。aarch64 版按 bionic libc 编译，
依赖仅 `libc.so / libdl.so / libm.so`。

---

## 4. 按键

真机只有十字键 + A + B，1:1 直通：

| 手柄 | RetroPad | 键盘默认 | 游戏里 |
|---|---|---|---|
| 十字键 | 十字键 | ↑↓←→ | `controller.left/right/up/down` |
| **A**（右） | A | `X` | `controller.A`（跳跃/确认） |
| **B**（左） | B | `Z` | `controller.B` |
| **MENU** | Start | `Enter` | `controller.menu`（游戏没接管时弹出 pxt 系统菜单） |
| **RESET** | Select | — | 重启当前游戏（按下沿检测，按住不会反复重启） |

核心向 RetroArch 声明了**输入描述符**，`快速菜单 → 控制 → 端口 1 控制` 里显示的是
`A -> MakeCode A (Jump/OK)` 这种真实用途，可直接改键并保存为"核心重映射"。

Xbox 型手柄（按位置映射，标签与实际相反）用核心选项一键交换：
`快速菜单 → 核心选项 → Swap A/B Buttons = enabled`（实时生效，不改你已有的绑定）。

`X / Y / L / R` 无功能——MakeCode Arcade 本身没有这几个键。

---

## 5. 实现要点（改代码前先看这几条）

**为什么跑源码而不是模拟硬件**：`.png` 卡带不是可执行文件，它把整个工程源码压缩后藏在缩略图
像素最低位（`pxtlib/util.ts` 的 `encodeBlobAsync`，magic `0x59347a7d`）。要跑起来只有两条路：
模拟 MCU 外设（要写完整 Thumb-2 解释器），或解出源码 + 用官方 runtime 跑（本核心走这条）。

**五个必须做对的坑**（都已在代码里修掉，改坏了会以"黑屏无报错"的形式出现）：

1. **每帧抽干 microtask**：官方协程续体全是 promise，`JS_ExecutePendingJob` 要循环到空，
   漏了只出第一帧。
2. **虚拟时钟要真实时间驱动**：`setTimeout/setInterval/rAF` 落到 `__pump()` 里按 ms 到期，
   一帧推 16.67ms；`performance.now()` 初值不能为 0（pxt 启动有 `bad time now` 检查）。
3. **`TextEncoder` 必须补**：QuickJS 没有，pxt 的 `toUTF8Array` 会崩，而 pxt 的错误处理会吞掉
   异常 → 表现就是全黑无日志。
4. **像素格式**：`screenState.screen` 是 canvas ImageData 的 Uint32 视图（小端 `0xAABBGGRR`），
   C 侧交换 R/B 得到 XRGB8888。
5. **音频段的相对时间要平移到绝对轴**：`playInstructionsAsync` 的每条指令时间是段内相对值，
   直接拿去和绝对时钟比会全静音。

**输入/音频通道**：按键走 `pxsim.board().setButton(pxsim.Key.X, down)`
（Left=1 Up=2 Right=3 Down=4 A=5 B=6 Menu=7，玩家 2 起 +7）；
音频拦截 `tone()` 与 `playInstructionsAsync()` 两个出口自己混音，每帧约 735 采样交回 C 侧。

**性能**（原生构建，600 帧含 0.3s 启动）：ping 5.0 ms/帧、jumpy 8.0 ms/帧、cube-land 10 ms/帧，
16.67ms 预算内还剩一倍余量。QuickJS 无 JIT 没有成为瓶颈。

### 5.1 内嵌编译器（v0.10）

**为什么能在核心里跑 pxtc**：pxtc 就是个 Node 程序，它的重活（TypeScript 编译器）是纯 JS。
把它需要的 Node API 用 JS 替身补齐，就能在 QuickJS 里跑起来：

```
src/compiler.c                       runtime/compiler.js（打包成 pxt_compiler_bundle.h）
  JS_NewRuntime  ─────────────────┐
  JS_SetMaxStackSize(4MB)         │   内存 VFS：/pxt（内嵌库） /work（工程） /tmp
  注入 __asset/__has/__list ──────┼─→ path/fs/os/crypto/util/child_process/zlib/http/Buffer 替身
  __emit/__fail/__log             │   CommonJS 装载器（require 缓存 + 循环依赖）
  eval 胶水 → __compile(工程 JSON) │   pxt.Host → MainPackage.installAllAsync()
  抽干 microtask（+ 排队的定时器） │            → getCompileOptionsAsync() → pxtc.compile()
  取 binary.js → 立刻销毁 runtime  ┘
```

- **一次编译一个临时 runtime**，编完 `JS_FreeContext/JS_FreeRuntime`：峰值 ~210MB 不会残留，
  编译失败也照样释放（`goto fail` 路径统一收尾）。
- **载荷 1.97 MB**（原始 16.95 MB，LZMA 字典 4MB）：`pxt_hack.js`(8.8MB，自带 TS 编译器)
  + `target.json`(8.7MB，含全部 bundledpkgs) + `nodeutil.js` 及其 `require("./x")` 递归链。
  用 LZMA 而不是 deflate，是因为 LZMA 对这堆文本压得更好（16.95MB → 1.97MB）。
- **载荷以十六进制文本存进 C 头**（不是 `\xNN`）。转义能让 .rdata 里只占 1.97MB，但
  `zig build-lib` 遇到 2MB 级转义字面量会段错误（`zig cc -c` 却编得过，是 zig 0.17 的坑）。
  代价是核心 6.4MB 而不是 4.2MB，换来构建稳定。
- **编译完抽干 microtask**：整条 pxt 流程是 promise 链，`JS_ExecutePendingJob` 要循环到返回 0
  才能去 `JS_FreeRuntime`；队列空但还没结果时，调 `__drainTimers()` 跑一轮排队的定时器再继续。
- **失败一律"报错 + 返回 null"，不在帧里 throw**：从 C 直接调进来的 JS 帧同步抛异常会把
  QuickJS 状态搞乱（实测段错误）。`failNow()` 只调 `__fail` 记下原因。
- **前置换依赖**：卡带没有 `pxt.json`、或依赖里有 `github:/http:/file:`，直接报错走人，
  不让 pxt 卡在联网下载里；`dependencies` 为空时补 `device:*`（同 `cart_build.js`）。

**踩过的坑（改 `runtime/compiler.js` 前务必知道）**：

1. **`Buffer` 必须是 Uint8Array 子类且实现 `toString(encoding)`**。返回裸 `Uint8Array` 时，
   `atob()`（= `Buffer.from(s,"base64").toString("binary")`）会退化成 `Array.prototype.toString`，
   得到 `"73,65,65,..."` 这种逗号串——字体数据因此变 1.3MB 垃圾，产物从 2.2MB 涨到 3.5MB，
   而且**游戏看起来还能跑**（字体错乱），非常难发现。
2. `dirname/basename/extname` 要在全局暴露：`path` 替身的函数在 IIFE 里，`pxt_hack` 直接用了裸名字。
3. `Object.prototype.hasOwnProperty` 被 `pxt_hack` 改过，直接调用会崩 → 用自己的 `hasOwn`。
4. `JS_SetMaxStackSize` 不能给太小（512KB 编 `server.js` 就段错误），也不能给太大：
   QuickJS 只在**超过**上限时才抛 stack overflow，宿主线程的真实栈它管不了。RetroArch 在
   Windows 上给主线程只有 1MB，而 `core_test.exe` 有 16MB —— 早期设 4MB 一直没出事，
   换到真机就可能踩穿。现在上限是 `COMPILER_STACK_KB`（默认 **768**）：实测四张卡带在
   512KB 下全部编过，768KB 留 50% 余量，稳落在 1MB 宿主栈之内。
   `zig build test` 里那条 png 用例带 `--stack=1024`，就是专门盯这个。
5. `pxt.Host` 在 `pxtmod` 上，`nodeutil` 里没有。

**验证方式**：同一张卡带分别用内嵌编译器和 `node tools/cart_build.js` 编译，`cmp` 两份
`binary.js` —— ping / btnprobe 均**逐字节一致**；画面非黑像素与历史参考值相同。

---

## 6. 已知限制

| 项 | 状态 |
|---|---|
| 直接加载 `.png` | ✅ v0.10 起支持（核心内嵌编译器，首次约 5 秒） |
| 编译期内存 | ⚠️ 峰值约 210MB，**128MB 设备不可用**，256MB 起比较稳 |
| 依赖 `github:` / `http:` 扩展的卡带 | ❌ 内嵌编译器不联网，需 PC 上 `cart_build.js` 转换 |
| 编译结果缓存 | ❌ 不写盘，每次 load 重新编译 |
| 音频 | ✅ `playTone` / 旋律 / `soundExpression` 出声；噪声类音色近似白噪声 |
| `.wav` 采样类扩展音效（`playBufferAsync`） | ❌ 暂静音，触发时打 warn |
| 存档状态 | ❌ 不支持（JS 闭包无法可靠序列化） |
| 玩家 2 输入 | ⚠️ 只轮询端口 0，双人需在 `poll_input` 加端口 1 映射 `Key+7` |
| 重置 | ⚠️ 整机重建（`.js` 约 0.3s 重新 eval；`.png` 会把整个编译再跑一遍） |
| 32 位 armv7 / mips | ⚠️ 未编；`zig build -Dtarget=arm-linux-gnueabihf` 可自行尝试 |

---

## 7. 调试

```bash
# 不开 RetroArch，直接跑帧出图（改 runtime 时最快）
zig build tools
./zig-out/bin/core_test tests/data/ping.js out.ppm 90
./zig-out/bin/core_test tests/data/ping.png out.ppm 90     # png：走内嵌编译器那条路
node tools/ppm2png.js out.ppm out.png            # 转 PNG 看

# 按键脚本：--press=UP / --seq=START@6,A@12 / --every=30 多帧抓拍
./zig-out/bin/core_test tests/data/ping.js out.ppm 120 --press=UP --every=30
./zig-out/bin/btn_test tests/data/ping.js LEFT 20         # 只看事件派发

# 模拟 RetroArch 的 1MB 线程栈（专测内嵌编译器的递归深度）
./zig-out/bin/core_test tests/data/ping.png out.ppm 1 --stack=1024

# 直接用 ctypes 驱动 DLL 跑一张卡带（同样是 1MB 栈线程，最接近真机）
python tools/dev/dll_smoke.py zig-out/lib/arcade_libretro.dll tests/data/ping.png 90

# 把内嵌编译器的产物落盘，和 PC 端对比（体积/内容是否一致）
ARCADE_DUMP_JS=/tmp/qjs.js ./zig-out/bin/core_test tests/data/ping.png out.ppm 1
node tools/cart_build.js tests/data/ping.png -o out/ping_check/
cmp /tmp/qjs.js out/ping_check/binary.js                  # 应该完全一致

# 拆卡带看源码
python tools/dev/mkpng.py decode 游戏.png -o project.json
```

改 runtime 只动 `runtime/*.js`，`zig build` 会自动重新生成 bundle（`runtime/compiler.js` 变化
会重生成编译器载荷，需要 pxtc 环境）。

---

## 8. 许可

本仓库代码 MIT。第三方：QuickJS (MIT)、miniz (MIT)、LZMA SDK (public domain)、
libretro.h (MIT)、pxt-* (MIT)。MakeCode Arcade 是 Microsoft 的项目，游戏版权归各自作者。
详见 `NOTICE.md` 与 `third_party/README.md`。
