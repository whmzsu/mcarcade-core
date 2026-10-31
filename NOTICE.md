# NOTICE —— 第三方组件

本仓库自身代码为 MIT。分发二进制（`.dll` / `.so` / `.dylib`，内含下列代码的编译产物）时，
请保留本文件与本段声明。

| 组件 | 位置 | 许可 | 版权 |
|---|---|---|---|
| QuickJS | `third_party/quickjs/` | MIT | Fabrice Bellard, Charlie Gordon |
| miniz | `third_party/miniz/` | MIT | Rich Geldreich 等 |
| LZMA SDK | `third_party/lzma/` | Public Domain | Igor Pavlov |
| libretro.h | `third_party/libretro/libretro.h` | MIT（libretro 许可） | libretro 团队 |
| pxt-arcade sim（`pxtsim.js` / `common-sim.js` / `sim.js`） | `third_party/pxt-sim/` | MIT | Microsoft Corporation |
| pxt-arcade / pxt-common-packages 源码（仅查阅，未随仓库分发） | `third_party/pxt-src/` | MIT | Microsoft Corporation |

## MakeCode Arcade

"MakeCode"、"Arcade" 是 Microsoft Corporation 的商标。本项目是**非官方**的第三方
libretro 前端适配，与 Microsoft 无隶属或背书关系。

卡带（`.png`）与 `binary.js` 里的游戏代码、美术、音乐，版权归各自作者所有；
本仓库不附带任何游戏内容，`tests/data/` 里的卡带仅用于自检。
