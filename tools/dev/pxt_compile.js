// 用官方 pxtc 从内存源码编译出 sim JS
// 用法: node tools/dev/pxt_compile.js <card.png> [-o out.js]
const path = require("path");
const fs = require("fs");
const os = require("os");

const BUILD_ROOT = process.env.PXTBUILD || path.join(os.tmpdir(), "pxtbuild");
const coreDir = path.join(BUILD_ROOT, "node_modules/pxt-core");
const arcadeDir = path.join(BUILD_ROOT, "node_modules/pxt-arcade");

const pxtmod = require(path.join(coreDir, "built/pxt_hack.js"));
const pxt = global.pxt;
const pxtc = global.pxtc;
const nodeutil = require(path.join(coreDir, "built/nodeutil.js"));

nodeutil.setTargetDir(arcadeDir);
pxt.setAppTarget(JSON.parse(fs.readFileSync(path.join(arcadeDir, "built/target.json"), "utf8")));

// 官方 target 把调色板挂在 device 包的 pxt.json 里，而 pxtc 的 hex`__palette` 读的是
// appTarget.runtime.palette —— npm 包没做这步合并，这里补上，否则编译成 2 色直接 panic。
const devCfg = JSON.parse(pxt.appTarget.bundledpkgs.device["pxt.json"]);
pxt.appTarget.runtime = pxt.appTarget.runtime || {};
if (!pxt.appTarget.runtime.palette) pxt.appTarget.runtime.palette = devCfg.palette;
console.log("palette:", pxt.appTarget.runtime.palette.length, "colors; screen:", JSON.stringify(devCfg.screenSize));

// SnippetHost 靠 cwd 里出现名为 "pxt" 的路径段来定位 pxt-common，这里直接钉死
pxtmod.SnippetHost.prototype.getPxtRepoDir = () => coreDir;

const MAIN_TS = `
game.splash("hello pxt")
let s = sprites.create(img\`2 2 2\`, SpriteKind.Player)
controller.moveSprite(s, 100, 100)
`;

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "pxtproj-"));
  process.chdir(work);

  const host = new pxtmod.SnippetHost(
    "probe",
    { "main.ts": MAIN_TS },
    { game: "*" },
    false
  );
  const mainPkg = new pxt.MainPackage(host);
  console.log("resolving deps...");
  await mainPkg.installAllAsync();
  console.log("deps installed");

  const opts = await mainPkg.getCompileOptionsAsync();
  console.log("compileOptions: target=", opts.target, " fileSystem files=", opts.fileSystem && Object.keys(opts.fileSystem).length);
  console.log("sourceFiles=", (opts.sourceFiles || []).length);

  const res = pxtc.compile(opts);
  console.log("diagnostics:", (res.diagnostics || []).length);
  (res.diagnostics || []).slice(0, 8).forEach(d => {
    const msg = typeof d.messageText === "string" ? d.messageText : d.messageText.messageText;
    console.log("  !", msg);
  });
  console.log("output files:", res.outfiles ? Object.keys(res.outfiles) : "none");
  if (res.outfiles) {
    for (const [k, v] of Object.entries(res.outfiles)) {
      console.log("   ", k, v.length, "bytes");
    }
  }
  if (res.outfiles && res.outfiles["binary.js"]) {
    fs.writeFileSync(path.join(process.cwd(), "binary.js"), res.outfiles["binary.js"]);
    console.log("saved binary.js");
  }
}

main().catch(e => {
  console.error("FAILED:", e && e.message);
  console.error((e && e.stack || "").split("\n").slice(1, 6).join("\n"));
  process.exit(1);
});
