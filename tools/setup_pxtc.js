// 一次性准备 pxtc 编译环境（cart_build.js 与内嵌编译器载荷都依赖它）
//
// 用法:
//   node tools/setup_pxtc.js                 # 装到 <tmp>/pxtbuild
//   PXTBUILD=/path/to/dir node tools/setup_pxtc.js
//
// 做三件事：建目录 → 写 package.json → npm install。装过一次就不用再跑；
// 换机器 / 清过临时目录后重跑即可。
//
// 版本必须锁死（不带 ^）。这两个包是 rollup 打包出来的产物，新版偶尔会出现
// "built/ 没进 npm 包" 的情况；CI 上就撞到过一次（`^4.2.1` 解析到别的组合，
// pxt-core/built/pxt_hack.js 不存在，构建直接停摆）。下面这组是本机验证过的。
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");

const BUILD_ROOT = process.env.PXTBUILD || path.join(os.tmpdir(), "pxtbuild");

const PXT_ARCADE = "4.2.1";
const PXT_CORE = "13.2.1";

const PKG = {
  name: "pxtbuild",
  version: "1.0.0",
  private: true,
  description: "pxtc 编译环境（makecode-arcade-core 用）",
  // pxt-core 显式写进顶层依赖：只靠 pxt-arcade 传递时，npm 可能把它嵌套装到
  // pxt-arcade/node_modules 下，build.zig 拼的 <root>/node_modules/pxt-core 就落空。
  dependencies: { "pxt-arcade": PXT_ARCADE, "pxt-core": PXT_CORE },
};

// 编译器载荷要用的两个文件，缺任何一个都编不出核心
const REQUIRED = [
  ["pxt-core", "built/pxt_hack.js"],
  ["pxt-arcade", "built/target.json"],
];

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

// 装完先报实际版本——出问题时能立刻看出是不是版本漂了
for (const name of ["pxt-arcade", "pxt-core"]) {
  const p = path.join(BUILD_ROOT, "node_modules", name, "package.json");
  if (fs.existsSync(p)) {
    console.log(`  ${name} ${JSON.parse(fs.readFileSync(p, "utf8")).version}`);
  } else {
    console.log(`  ${name} 未安装`);
  }
}

const missing = [];
for (const [pkg, rel] of REQUIRED) {
  const p = path.join(BUILD_ROOT, "node_modules", pkg, rel);
  if (!fs.existsSync(p)) missing.push(p);
}

if (missing.length) {
  console.error("缺少编译器载荷需要的文件：");
  for (const p of missing) console.error("  " + p);
  // 把候选位置列出来，便于判断是不是被嵌套装到别处了
  const nested = path.join(BUILD_ROOT, "node_modules", "pxt-arcade", "node_modules");
  if (fs.existsSync(nested)) {
    console.error("pxt-arcade/node_modules 下有：" + fs.readdirSync(nested).join(", "));
  }
  process.exit(2);
}

console.log("pxtc 环境就绪 ✓");
