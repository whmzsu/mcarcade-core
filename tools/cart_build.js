// 从 MakeCode Arcade PNG 卡带编译出官方 sim 用的 binary.js
// 用法: node tools/cart_build.js <card.png> [-o outdir]
const path = require("path");
const fs = require("fs");
const os = require("os");

const BUILD_ROOT = process.env.PXTBUILD || path.join(os.tmpdir(), "pxtbuild");
const coreDir = path.join(BUILD_ROOT, "node_modules/pxt-core");
const arcadeDir = path.join(BUILD_ROOT, "node_modules/pxt-arcade");

const cardPath = process.argv[2];
if (!cardPath) { console.error("usage: node cart_build.js <card.png> [-o outdir]"); process.exit(1); }
const outArg = process.argv.indexOf("-o");
// 编译前会 chdir 到临时工程目录，相对路径必须在这里先钉成绝对路径
const outDir = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : null;

const pxtmod = require(path.join(coreDir, "built/pxt_hack.js"));
const pxt = global.pxt;
const pxtc = global.pxtc;
const nodeutil = require(path.join(coreDir, "built/nodeutil.js"));
const H = require("./lib/cart.js");

nodeutil.setTargetDir(arcadeDir);
pxt.setAppTarget(JSON.parse(fs.readFileSync(path.join(arcadeDir, "built/target.json"), "utf8")));
pxtmod.SnippetHost.prototype.getPxtRepoDir = () => coreDir;

// 官方 target 的调色板挂在 device 包的 pxt.json 里
const devCfg = JSON.parse(pxt.appTarget.bundledpkgs.device["pxt.json"]);
pxt.appTarget.runtime = pxt.appTarget.runtime || {};
if (!pxt.appTarget.runtime.palette) pxt.appTarget.runtime.palette = devCfg.palette;

const card = H.decodeCartridge(fs.readFileSync(cardPath));
const files = card.files || {};
console.log("card:", path.basename(cardPath), Object.keys(files).length, "files");
console.log("  " + Object.keys(files).map(k => k + "(" + (files[k] || "").length + ")").join(" "));

// github: 扩展的源码不在 PNG 里，需另取。--extdir 下按包名放好后替换为 file: 依赖
const extArg = process.argv.find(a => a.startsWith("--extdir="));
const extDir = extArg ? extArg.split("=")[1] : null;
if (extDir && files["pxt.json"]) {
  const cfg = JSON.parse(files["pxt.json"]);
  let changed = false;
  for (const [dep, spec] of Object.entries(cfg.dependencies || {})) {
    if (typeof spec === "string" && spec.startsWith("github:")) {
      // 必须绝对路径：pxt 会在临时工程目录里解析 file:，相对路径会指错地方
      const local = path.resolve(extDir, dep);
      if (fs.existsSync(path.join(local, "pxt.json"))) {
        cfg.dependencies[dep] = "file:" + local.replace(/\\/g, "/");
        changed = true;
        console.log("  ext:", dep, "->", cfg.dependencies[dep]);
      } else {
        console.log("  ext:", dep, "NOT FOUND in", local, "(保持原样，可能联网失败)");
      }
    }
  }
  if (changed) files["pxt.json"] = JSON.stringify(cfg, null, 4);
}

// 兜底：极少数卡带（早期手工打包的）没有 pxt.json，pxt 找不到包配置就无法装载
if (!files["pxt.json"]) {
  const list = Object.keys(files).filter(f => f !== "pxt.json");
  files["pxt.json"] = JSON.stringify({
    name: "cart",
    dependencies: { device: "*" },
    files: list,
  }, null, 4);
  console.log("  note: 卡带缺 pxt.json，已按现有文件生成");
}

// 兜底：极少数卡带的 pxt.json 没写任何依赖，导致 libs 不加载（Cannot find global type 'Boolean'）
if (files["pxt.json"]) {
  const cfg = JSON.parse(files["pxt.json"]);
  if (!cfg.dependencies || Object.keys(cfg.dependencies).length === 0) {
    cfg.dependencies = { device: "*" };
    files["pxt.json"] = JSON.stringify(cfg, null, 4);
    console.log("  note: 依赖为空，已补 device:*");
  }
}

// 写到临时工程目录（pxt.Host 从 cwd 读文件，pxt.json 原样保留）
const work = fs.mkdtempSync(path.join(os.tmpdir(), "cartproj-"));
for (const [name, content] of Object.entries(files)) {
  const p = path.join(work, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
}
process.chdir(work);

async function main() {
  const host = new pxtmod.Host();
  const mainPkg = new pxt.MainPackage(host);
  console.log("installing deps:", Object.keys((files["pxt.json"] && JSON.parse(files["pxt.json"]).dependencies) || {}).join(","));
  await mainPkg.installAllAsync();

  const opts = await mainPkg.getCompileOptionsAsync();
  console.log("sourceFiles:", (opts.sourceFiles || []).length);
  const res = pxtc.compile(opts);
  const ds = res.diagnostics || [];
  console.log("diagnostics:", ds.length);
  ds.slice(0, 10).forEach(d => {
    const msg = typeof d.messageText === "string" ? d.messageText : d.messageText.messageText;
    const loc = d.file ? path.basename(d.file.fileName) + ":" + (d.start || 0) : "";
    console.log("  !", loc, msg.slice(0, 120));
  });
  if (!res.outfiles || !res.outfiles["binary.js"]) {
    console.log("NO OUTPUT");
    process.exit(2);
  }
  const out = res.outfiles["binary.js"];
  const dst = outDir || work;
  fs.mkdirSync(dst, { recursive: true });
  const dstFile = path.join(dst, "binary.js");
  fs.writeFileSync(dstFile, out);
  console.log("binary.js:", out.length, "bytes ->", dstFile);
  console.log("WORKDIR=" + work);
}

main().catch(e => {
  console.error("FAILED:", e && e.message);
  console.error((e && e.stack || "").split("\n").slice(1, 6).join("\n"));
  process.exit(1);
});
