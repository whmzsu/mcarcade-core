// 探针：验证 pxt CLI 库能否在 Node 里以 arcade target 启动，并编译出一份 JS
// 用法: node tools/dev/pxt_probe.js
const path = require("path");
const fs = require("fs");

const BUILD_ROOT = process.env.PXTBUILD || path.join(require("os").tmpdir(), "pxtbuild");
const coreDir = path.join(BUILD_ROOT, "node_modules/pxt-core");
const arcadeDir = path.join(BUILD_ROOT, "node_modules/pxt-arcade");

if (!fs.existsSync(path.join(coreDir, "built/pxt.js"))) {
  console.error("找不到 pxt-core，先 npm i pxt-arcade。BUILD_ROOT=" + BUILD_ROOT);
  process.exit(1);
}

const pxtmod = require(path.join(coreDir, "built/pxt.js"));
const pxt = global.pxt;
const pxtc = global.pxtc;
const nodeutil = require(path.join(coreDir, "built/nodeutil.js"));

console.log("pxt module loaded, pxt =", typeof pxt, "pxtc =", typeof pxtc);

// 设置 target 目录并展开 target
nodeutil.setTargetDir(arcadeDir);
const targetJsonPath = path.join(arcadeDir, "built/target.json");
const trg = JSON.parse(fs.readFileSync(targetJsonPath, "utf8"));
console.log("target id =", trg.id, " bundledpkgs =", Object.keys(trg.bundledpkgs || {}).join(","));

pxt.setAppTarget(trg);
console.log("appTarget.id =", pxt.appTarget.id);
console.log("appTarget.bundledpkgs keys =", Object.keys(pxt.appTarget.bundledpkgs || {}).slice(0, 12).join(","));
console.log("pxt.Host =", typeof pxt.Host, " pxt.MainPackage =", typeof pxt.MainPackage);
