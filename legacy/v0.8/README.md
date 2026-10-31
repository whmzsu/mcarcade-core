# legacy/v0.8 —— 手写运行时（仅 JS 层，供参考）

v0.8 不走官方 runtime，而是**照着 pxt 语义自己写了一份 MakeCode Arcade API**：

| 文件 | 作用 |
|---|---|
| `js/tsstrip.js` | TypeScript → JavaScript 的轻量削皮（enum / namespace / 类型标注 / 泛型 / 非空断言 / 断言签名） |
| `js/arcade.js` | 手写 API 实现：精灵 / 图像 / 场景 / 控制器 / 动画 / 粒子 / 瓦片地图 / 系统暂停菜单 |
| `js/menu_assets.js` | 暂停菜单的字形与图标（从 `systemmenuicons.ts` / `font8.txt` 导出的位图） |
| `js/pxt_shim.js` | 在 Node 里模拟 pxt 的编译期符号，给 `probe_pxt.js` 用 |
| `js_bundle.h` | 上面几个文件打包成的 C 数组（快照，`gen_bundle.py` 可重新生成） |
| `gen_bundle.py` | `js/*.js` → `js_bundle.h` |

```bash
python legacy/v0.8/gen_bundle.py          # 重新生成 js_bundle.h
```

## 注意

- **v0.8 的 C 侧（`core.c` + `cart.c` 的 PNG 直读路径）已经被 v0.9 替换**，仓库里不再保留那份
  core 源码。要跑 v0.8 请直接用预编译包：`out/mcarcade-core-0.8-*.zip`。
- 这里保留的是**运行时语义的实现**，价值在于读：想知道"pxt 的 `pause()` / 瓦片碰撞 / 系统菜单
  在 JS 里怎么被复现"，看 `arcade.js` 比看官方 sim 快。
- **不要再把 `arcade.js` 接回主线**：0.5～0.8 的经验是"每多测一张卡带就多一个近似点"，0.9 起
  官方 sim 是唯一实现（见根 `README.md` 第 5 节）。
- `src/cart.c` 里的 PNG 解析仍然保留并在用（`zig build test` 会跑），只是 v0.9 的 core 不再调用它
  加载游戏。
