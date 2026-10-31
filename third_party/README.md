# third_party —— 第三方源码

只放**参与编译**的代码和运行时要 eval 的官方 JS。全部为原样入库（未打补丁），
升级时整目录替换即可。

| 目录 | 内容 | 用途 | 编译进 core |
|---|---|---|---|
| `quickjs/` | QuickJS（quickjs.c / dtoa.c / libregexp.c / libunicode.c） | JS 引擎，跑 pxt 运行时与游戏 | 是 |
| `miniz/` | miniz 2.x（`miniz_tinfl.c`） | PNG 卡带里的 deflate 解压 | 是 |
| `lzma/` | LZMA SDK（`LzmaDec.c`） | 部分卡带用 LZMA 压缩源码 | 是 |
| `libretro/` | `libretro.h` | libretro API 头文件 | 头文件 |
| `pxt-sim/` | `pxtsim.js` + `common-sim.js` + `sim.js` | 官方 pxt-arcade 浏览器 sim 三层，原样嵌入 | 否（打包成 `pxt_bundle.h` 后由 QuickJS eval） |
| `pxt-src/` | pxt-arcade / pxt-common-packages 的 TS 源码 | **仅参考**：查 API 语义、音色表、sim 行为 | 否（**未入库**，`git clone` 后没有这个目录） |

## 来源

- QuickJS：<https://bellard.org/quickjs/>（quickjs-2025-09-13 一代，含 libregexp/libunicode）
- miniz：<https://github.com/richgel999/miniz>
- LZMA SDK：<https://www.7-zip.org/sdk.html>（公有领域）
- libretro.h：<https://github.com/libretro/libretro-common>
- pxt-sim 三层：`pxt-core` 的 `sim/` 与 `pxt-arcade` 的 `sim/` 构建产物（jsdelivr CDN 上
  `pxt-arcade` 发布包里的 `pxtsim.js`、`common-sim.js`、`sim.js`）

## 许可提示

QuickJS（MIT）、miniz（MIT）、LZMA SDK（公有领域）、libretro.h（libretro 许可）、
pxt-*（MIT）。分发二进制时请一并保留各自许可声明，见仓库根目录 `NOTICE.md`。

`pxt-src/` 是 TS 参考源码，**不参与构建、未入库**（`.gitignore` 已排除）。需要时自行从
pxt-arcade / pxt-common-packages 仓库取，或跑 `node tools/dev/build_pxt.js` 生成。
