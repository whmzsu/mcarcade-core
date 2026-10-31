// 一次性准备 pxtc 编译环境（cart_build.js 依赖它）
//
// 用法:
//   node tools/setup_pxtc.js                 # 装到 <tmp>/pxtbuild
//   PXTBUILD=/path/to/dir node tools/setup_pxtc.js
//
// 做三件事：建目录 → 写 package.json（只依赖 pxt-arcade，pxt-core 是它的依赖）
// → npm install。装过一次就不用再跑；换机器 / 清过临时目录后重跑即可。
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");

const BUILD_ROOT = process.env.PXTBUILD || path.join(os.tmpdir(), "pxtbuild");
const PKG = {
  name: "pxtbuild",
  version: "1.0.0",
  private: true,
  description: "pxtc 编译环境（makecode-arcade-core 用）",
  dependencies: { "pxt-arcade": "^4.2.1" },
};

fs.mkdirSync(BUILD_ROOT, { recursive: true });
const pkgPath = path.join(BUILD_ROOT, "package.json");
fs.writeFileSync(pkgPath, JSON.stringify(PKG, null, 2) + "\n");
console.log("pxtbuild 目录:", BUILD_ROOT);
console.log("写入:", pkgPath);

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const r = spawnSync(npm, ["install", "--no-audit", "--no-fund"], {
  cwd: BUILD_ROOT,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (r.status !== 0) {
  console.error("npm install 失败，退出码", r.status);
  process.exit(1);
}

const coreDir = path.join(BUILD_ROOT, "node_modules/pxt-core");
const arcadeDir = path.join(BUILD_ROOT, "node_modules/pxt-arcade");
const ok = fs.existsSync(path.join(coreDir, "built/pxt_hack.js")) &&
  fs.existsSync(path.join(arcadeDir, "built/target.json"));
console.log(ok ? "pxtc 环境就绪 ✓" : "警告: pxt-core / pxt-arcade 构建产物缺失，cart_build.js 可能报错");
process.exit(ok ? 0 : 2);
