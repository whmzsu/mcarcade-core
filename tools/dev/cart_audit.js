/*
 * cart_audit.js —— 卡带静态预检：不解码运行，只看源码就判断哪些功能会出问题。
 *   node tools/cart_audit.js <cart.png> [<cart2.png> ...]
 *
 * 目的：把"这个游戏能不能跑"从"要跑一遍才知道"变成"读一眼就知道"。
 * 覆盖的是【已知的语义差异】，不是全部差异——没列出的不等于没问题。
 */
const fs = require("fs");
const H = require("../lib/host.js");

const RULES = [
  // level: FULL = 语义等价；NEAR = 近似，边界会不同；GONE = 没实现
  { re: /\b(settings|statusbars|user|renderer|mp)\s*\./g, level: "GONE",
    msg: "整个命名空间未实现，调用是空操作" },
  { re: /\bcontroller\.player2\b|\binfo\.player2\b/g, level: "GONE",
    msg: "玩家 2：libretro 只轮询端口 0，2P 键位不通" },
  { re: /\bgame\.(gameOver|ask|reset|setDialogTextColor|waitAnyButton)\b/g, level: "GONE",
    msg: "game 里这几个方法未实现/空操作" },
  { re: /\bscene\.(backgroundColor|placeOnRandomTile|tileAtLocationEquals|isHittingTile|setWallAt)\b/g, level: "GONE",
    msg: "scene 里这几个方法未实现" },
  { re: /\.changeScale\s*\(|\.follow\s*\(/g, level: "GONE",
    msg: "Sprite.changeScale / Sprite.follow 未实现" },
  { re: /\bpause\s*\(/g, level: "NEAR",
    msg: "pause()：无协程，不会真的“等一会儿再继续”" },
  { re: /\brunInParallel\s*\(|\brunInBackground\s*\(/g, level: "NEAR",
    msg: "并发块：块内 pause 被跳过，延迟动作会立刻执行" },
  { re: /\bmusic\.(playTone|ringTone|playSound)\s*\(/g, level: "NEAR",
    msg: "音频单声道：新音打断旧音，音乐+音效不能叠加" },
  { re: /\bgame\.onPaint\b|\bscreen\.setPixel\b/g, level: "NEAR",
    msg: "逐帧自绘路径：每帧全屏重画，QuickJS 无 JIT 可能掉帧" },
  { re: /\bgithub:/g, level: "GONE",
    msg: "第三方扩展：源码不在 PNG 里，相关逻辑为空" },
];

function scanText(text) {
  const hits = [];
  for (const r of RULES) {
    const m = text.match(r.re);
    if (m) hits.push({ level: r.level, msg: r.msg, n: m.length, sample: m[0] });
  }
  return hits;
}

function auditCart(path) {
  let cart;
  try {
    cart = H.decodeCartridge(fs.readFileSync(path));
  } catch (e) {
    return { path, error: String(e.message || e) };
  }
  const files = cart.files || {};
  const names = Object.keys(files);
  const mainTs = files["main.ts"] || "";
  const mainBlocks = files["main.blocks"] || "";
  const pxt = files["pxt.json"] || "";

  const ext = [];
  if (/github:[^"',\s]+/.test(mainTs)) ext.push(...mainTs.match(/github:[^"',\s]+/g));
  if (/github:[^"',\s]+/.test(pxt)) ext.push(...pxt.match(/github:[^"',\s]+/g));

  const hits = scanText(mainTs + "\n" + pxt);
  return {
    path,
    size: fs.statSync(path).size,
    files: names,
    hasMainTs: mainTs.length > 0,
    tsLen: mainTs.length,
    blocksOnly: !mainTs && !!mainBlocks,
    ext: [...new Set(ext)],
    hits: hits.sort((a, b) => (a.level === b.level ? b.n - a.n : a.level < b.level ? -1 : 1)),
  };
}

function mark(lv) {
  return lv === "GONE" ? "缺失" : "近似";
}

const paths = process.argv.slice(2);
if (!paths.length) {
  console.log("用法: node tools/cart_audit.js <cart.png> [...]");
  process.exit(1);
}

for (const p of paths) {
  const r = auditCart(p);
  console.log("=".repeat(60));
  console.log("卡带:", r.path.split(/[\\/]/).pop(), r.size ? `(${(r.size / 1024).toFixed(1)} KB)` : "");
  if (r.error) { console.log("  解码失败:", r.error); continue; }
  console.log("  文件:", r.files.join(", "));
  if (r.blocksOnly) {
    console.log("  [缺失] 只有 main.blocks，没有 main.ts —— 没有可执行代码来源");
    continue;
  }
  console.log("  main.ts:", r.tsLen, "字符");
  console.log("  扩展:", r.ext.length ? r.ext.join(", ") : "无");
  if (!r.hits.length) {
    console.log("\n  没有命中任何已知差异点 —— 主力路径大概率可用");
    continue;
  }
  console.log("\n  预判风险:");
  for (const h of r.hits) {
    console.log(`   [${mark(h.level)}] ${h.msg}  (${h.n} 处, 如 ${h.sample})`);
  }
}
console.log("=".repeat(60));
