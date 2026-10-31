# embed_probe —— 内嵌官方 pxtc 编译器的可行性探针

**结论：能跑，而且比我原来估的乐观得多。** 裸 QuickJS（无 JIT）里跑完整的 pxtc 编译一张卡带
只要 **5.6 秒、峰值 210MB**，产物和 Node 编译的**逐像素一致**。

## 怎么跑

```bash
# 1) 编译探针宿主（不属于发布产物）
zig cc -O2 -w -I third_party/quickjs -o tools/dev/embed_probe/bin/qjsrun.exe \
    tools/dev/embed_probe/qjsrun.c \
    third_party/quickjs/quickjs.c third_party/quickjs/libregexp.c \
    third_party/quickjs/libunicode.c third_party/quickjs/dtoa.c -lm

# 2) 把卡带的工程文件表导出成 json
./zig-out/bin/cart_test.exe tests/data/ping.png tests/data/ping_proj.json

# 3) 跑探针（路径要绝对：跑起来后 cwd 会切到工作目录）
PB="$TEMP/pxtbuild/node_modules"
./tools/dev/embed_probe/bin/qjsrun.exe tools/dev/embed_probe/harness.js \
    "$(cygpath -m "$PB/pxt-core")" "$(cygpath -m "$PB/pxt-arcade")" \
    "$(cygpath -m "$PWD/tests/data/ping_proj.json")" \
    "C:/Users/whmzs/AppData/Local/Temp/probe_out" \
    "C:/Users/whmzs/AppData/Local/Temp/w_probe" --timeout=600
```

`harness.js` 就是内嵌场景要的胶水：CommonJS 装载器 + `fs/path/os/crypto/util/child_process/zlib`
的最小替身 + 编译流程（和 `tools/cart_build.js` 一一对应）。**427 行 JS + 272 行 C**。

## 实测数据（Windows x64，ReleaseFast 等价 -O2）

| 项 | 数值 |
|---|---|
| 加载 `pxt_hack.js`（8.4MB，含 TypeScript 编译器） | **260 ms**，堆 45 MB |
| `installAllAsync`（按 target 生成 pxt_modules） | 770 ms |
| `getCompileOptionsAsync`（130 个源文件） | 390 ms |
| `pxtc.compile` | **3.95 s** |
| **合计（ping，一张小卡带）** | **5.6 s**，峰值 **210 MB** |
| 同样负载在 Node/V8 上（对照） | 3.4 s，堆 ≥128 MB |
| `--mem=256` 限制下 | 通过（没触顶） |
| 产物可用性：ping 90 帧 | **389 非黑像素，与 Node 产物完全一致** |
| 产物可用性：sample_arcade 120 帧 | 19172 vs Node 19178（同一份产物连跑两次也会在 19172/19178 之间跳，是游戏内随机性） |

> 重要修正：我之前估「QuickJS 慢 10~20 倍、要 300~400MB」是错的。编译器这种 AST/字符串负载，
> QuickJS 只比 V8 慢 **1.6 倍**，内存也差不多。数字见上表。

## 已知差异

产物 **3.53MB vs Node 的 2.22MB**。首个注释行显示 `new=48.01% other=51.99%`（Node 是
`new=76.37% other=23.63%`），即**代码量相同（约 1.7MB）、调试元数据多 1.3MB**。
运行结果一致，暂不影响使用，但要查清（怀疑是不同的 pxtc 选项/缓存路径导致 `.info` 保留更多）。

## 距离真正内嵌还差什么

1. **虚拟文件系统**：现在 `__readFile/__stat` 走真实磁盘。内嵌时要换成"内嵌 blob 查表"，
   即把 `pxt_modules`（2.8MB）和 `target.json` 打进二进制，按路径查表返回字符串。属于机械替换。
2. **载荷**：`pxt_hack.js` 8.4MB + `target.json` 8.4MB（内嵌了全部 bundledpkgs，可裁到 3MB 左右）
   ≈ **12~16MB**；LZMA 压缩后落盘约 4MB（core 里本来就有 lzma）。
3. **内存**：峰值 210MB。桌面/主机没问题；128MB 内存的掌机（Miyoo Mini 之类）不可能，256MB 机型勉强。
4. **扩展**：走 github 的第三方扩展要联网，内嵌场景只能预置到 blob 里，或者只支持内置库。
5. **首次加载 5.6s**：可以配合 RetroArch 的 save 目录做一次编译缓存（第二次秒开）。

## 目录

- `qjsrun.c` —— 最小 QuickJS 宿主（不是 qjs，没有 quickjs-libc），提供 `__readFile/__stat/__now` 等
- `harness.js` —— 胶水 + 编译流程
- `bin/qjsrun.exe` —— 编出来的宿主（可删，重编即可）
