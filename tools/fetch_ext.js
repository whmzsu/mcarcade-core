// 从 jsdelivr 镜像抓取 github 扩展源码（Node 直连 TLS 在本机被重置，改用 curl）
// 用法: node tools/fetch_ext.js <owner/repo> <tag> <destDir>
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const MIRRORS = [
  "https://fastly.jsdelivr.net/gh/{o}/{r}@{t}/{f}",
  "https://cdn.jsdelivr.net/gh/{o}/{r}@{t}/{f}",
  "https://gcore.jsdelivr.net/gh/{o}/{r}@{t}/{f}",
];

const [repoSpec, tag, dest] = process.argv.slice(2);
if (!repoSpec || !tag || !dest) {
  console.error("usage: node fetch_ext.js <owner/repo> <tag> <destDir>");
  process.exit(1);
}
const [owner, repo] = repoSpec.split("/");

function curlToString(url) {
  return execFileSync("curl", ["-s", "-m", "25", "-f", url], { encoding: "utf8", maxBuffer: 32 << 20 });
}
function curlToFile(url, file) {
  execFileSync("curl", ["-s", "-m", "25", "-f", "-o", file, url], { stdio: "pipe" });
}

function tryMirrors(rel, fn) {
  let lastErr;
  for (const m of MIRRORS) {
    const url = m.replace("{o}", owner).replace("{r}", repo).replace("{t}", tag).replace("{f}", rel);
    try { return fn(url); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("all mirrors failed for " + rel);
}

fs.mkdirSync(dest, { recursive: true });
const cfgText = tryMirrors("pxt.json", u => curlToString(u));
fs.writeFileSync(path.join(dest, "pxt.json"), cfgText);
const cfg = JSON.parse(cfgText);
console.log("package:", cfg.name, "version:", cfg.version || "?", "files:", (cfg.files || []).length);

let ok = 0;
const failed = [];
for (const rel of cfg.files || []) {
  const out = path.join(dest, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try { tryMirrors(rel, u => curlToFile(u, out)); ok++; }
  catch (e) { failed.push(rel); }
}
console.log("fetched", ok, "files ->", dest);
if (failed.length) {
  console.log("FAILED:", failed.join(", "));
  process.exit(3);
}
