#!/usr/bin/env node
/*
 * build_pxt.js —— 把 third_party/pxt 里的官方 MakeCode Arcade runtime 编译成单文件 JS。
 *
 *   node tools/dev/build_pxt.js
 *
 * 产物: build/pxt-runtime.js   （可直接喂给 QuickJS）
 *
 * 三个必须的补丁（官方代码是给 pxtc 用的，不是给 tsc 用的）：
 *   1. base/console.ts 里的 /// <reference no-default-lib> 会禁掉标准库
 *   2. pxt.json 的 files 里混着 test.ts（编译器测试用例，顶层会真的执行）
 *   3. 缺 Math.idiv / int32 等 pxt 语言扩展声明 —— 不影响 emit，忽略即可
 */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "third_party/pxt");
const BUILD = path.join(ROOT, "build");
const WORK = path.join(BUILD, "pxt-src");
const OUT = path.join(BUILD, "pxt-out");
const TSC_DIR = path.join(BUILD, ".cache/typescript");

// 依赖顺序：base 最先（Buffer/Math 扩展），game 最后（依赖 screen/controller）
const LIBS = ["base", "core", "screen", "music", "game"];

function log(s) { process.stdout.write(s + "\n"); }

function findTsc() {
  if (process.env.TSC && fs.existsSync(process.env.TSC)) return process.env.TSC;
  for (const p of ["package/bin/tsc", "bin/tsc"]) {
    const local = path.join(TSC_DIR, p);
    if (fs.existsSync(local)) return local;
  }
  return null;
}

function ensureTsc() {
  let tsc = findTsc();
  if (tsc) return tsc;
  log("· 下载 typescript（一次性）...");
  fs.mkdirSync(TSC_DIR, { recursive: true });
  const tgz = path.join(TSC_DIR, "ts.tgz");
  const mirrors = [
    "https://registry.npmmirror.com/typescript/-/typescript-5.4.5.tgz",
    "https://registry.npmjs.org/typescript/-/typescript-5.4.5.tgz",
  ];
  let ok = false;
  for (const url of mirrors) {
    try {
      cp.execFileSync("curl", ["-sL", "--max-time", "120", "-o", tgz, url], { stdio: "pipe" });
      if (fs.statSync(tgz).size > 1e6) { ok = true; break; }
    } catch (e) { /* 换下一个源 */ }
  }
  if (!ok) throw new Error("typescript 下载失败，请手动把 tsc 放到 " + TSC_DIR);
  cp.execFileSync("tar", ["xzf", tgz, "-C", TSC_DIR], { stdio: "pipe" });
  tsc = findTsc();
  if (!tsc) throw new Error("解包后找不到 tsc");
  return tsc;
}

// 按 pxt.json 的 files 顺序收集源文件
// pxtc 会把 enum 当编译期常量内联，tsc 不会。所以顶层就 use 到 enum 的文件
// （controller.ts 开头就是 controller.A = new Button(ControllerButton.A)）必须让
// 定义 enum 的文件先执行，否则拼接后是 undefined。
const FIRST = ["controllerbutton.ts", "constants.ts", "controller.ts"];

function collect() {
  const list = [];
  for (const lib of LIBS) {
    const pkgPath = path.join(SRC, lib, "pxt.json");
    if (!fs.existsSync(pkgPath)) { log(`! ${lib} 缺少 pxt.json，跳过`); continue; }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const files = pkg.files || [];
    for (const f of files) {
      if (!f.endsWith(".ts") || f.endsWith(".d.ts")) continue;
      if (/(^|\/)test\.ts$/.test(f)) continue;
      const abs = path.join(SRC, lib, f);
      if (!fs.existsSync(abs)) { log(`! 缺少 ${lib}/${f}`); continue; }
      list.push({ lib, rel: f, abs });
    }
    // pxt.json 没列全的补充进去（官方偶尔漏登记）
    for (const f of fs.readdirSync(path.join(SRC, lib))) {
      if (!f.endsWith(".ts") || f.endsWith(".d.ts") || /^test\.ts$/.test(f)) continue;
      if (files.includes(f)) continue;
      list.push({ lib, rel: f, abs: path.join(SRC, lib, f) });
    }
  }
  return list;
}

// 让 FIRST 里的文件排到所属库的最前面
function reorder(list) {
  for (const lib of LIBS) {
    const mine = list.filter(x => x.lib === lib);
    const head = mine.filter(x => FIRST.includes(path.basename(x.rel)));
    if (!head.length) continue;
    const tail = mine.filter(x => !FIRST.includes(path.basename(x.rel)));
    const sorted = [...head, ...tail];
    let i = 0;
    for (let k = 0; k < list.length; k++) {
      if (list[k].lib === lib) list[k] = sorted[i++];
    }
  }
  return list;
}

function stage(list) {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const it of list) {
    const dst = path.join(WORK, it.lib, it.rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    let code = fs.readFileSync(it.abs, "utf8");
    // 补丁 1：去掉禁标准库的指令
    if (code.includes("no-default-lib")) {
      code = code.replace(/\/\/\/\s*<reference\s+no-default-lib[^>]*>/g, "");
    }
    fs.writeFileSync(dst, code);
  }
  // 把 .d.ts 也带上（类型声明，不产生 js）
  for (const lib of LIBS) {
    for (const f of fs.readdirSync(path.join(SRC, lib))) {
      if (!f.endsWith(".d.ts")) continue;
      const dst = path.join(WORK, lib, f);
      if (fs.existsSync(dst)) continue;
      fs.writeFileSync(dst, fs.readFileSync(path.join(SRC, lib, f)));
    }
  }
}

function compile(tsc, list) {
  const args = [
    "--target", "es5",
    "--lib", "es5,dom",
    "--noImplicitAny", "false",
    "--skipLibCheck",
    "--noEmitOnError", "false",
    "--removeComments", "false",
    "--outDir", OUT,
  ];
  // 只编译 .ts，.d.ts 作为声明被自动引入
  const files = [];
  const seen = new Set();
  for (const it of list) {
    const p = path.join(WORK, it.lib, it.rel);
    if (seen.has(p)) continue;
    seen.add(p);
    files.push(p);
  }
  args.push(...files);
  // .d.ts 必须一起给 tsc：dal.d.ts 里的 declare const enum DAL 只有在类型上下文里
  // 才会被内联成字面量，否则运行时会去找一个不存在的 DAL 对象。
  const dts = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".d.ts")) dts.push(p);
    }
  })(WORK);
  args.push(...dts);
  const r = cp.spawnSync(process.execPath, [tsc, ...args], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const errs = out.split("\n").filter(l => /error TS/.test(l));
  log(`· 编译 ${files.length} 个文件，类型错误 ${errs.length} 个（不影响 emit）`);
  if (errs.length && process.env.VERBOSE) log(errs.slice(0, 10).join("\n"));
  return errs;
}

function bundle(list) {
  const parts = [];
  const missing = [];
  for (const it of list) {
    const js = path.join(OUT, it.lib, it.rel.replace(/\.ts$/, ".js"));
    if (!fs.existsSync(js)) { missing.push(`${it.lib}/${it.rel}`); continue; }
    parts.push(`/* ${it.lib}/${it.rel} */\n` + fs.readFileSync(js, "utf8"));
  }
  if (missing.length) log(`! 未产出 JS: ${missing.length} 个（多为纯 .d.ts）`);
  const code = parts.join("\n");
  const dst = path.join(BUILD, "pxt-runtime.js");
  fs.writeFileSync(dst, code);
  return { dst, files: parts.length, lines: code.split("\n").length, bytes: Buffer.byteLength(code) };
}

// 主流程
log("== 构建 pxt runtime ==");
const tsc = ensureTsc();
const list = reorder(collect());
log(`· 收集到 ${list.length} 个源文件`);
stage(list);
compile(tsc, list);
const res = bundle(list);
log(`· 产物 ${path.relative(ROOT, res.dst)}：${res.files} 个文件 / ${res.lines} 行 / ${(res.bytes / 1024).toFixed(0)} KB`);
try {
  cp.execFileSync(process.execPath, ["--check", res.dst], { stdio: "pipe" });
  log("· 语法检查通过");
} catch (e) {
  log("✗ 语法检查失败");
  process.exit(1);
}
