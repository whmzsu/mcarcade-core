#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
publish.py —— 用 GitHub REST API 建仓库 + 注册部署密钥 + 打 tag + 发 Release。

为什么不用 gh / git push over HTTPS：这台机器上 github.com 的 HTTPS 被代理
502 拦掉（api.github.com 和 uploads.github.com 是通的），只有 SSH（走
ssh.github.com:443）能推。所以流程是：
    API 建仓库 / 注册 deploy key  →  git push（SSH）  →  API 发 Release 并上传 zip

    GH_TOKEN=<pat> python scripts/publish.py --repo mcarcade-core --tag v0.10.0 \
        --zip out/mcarcade-core-0.10.0-*.zip --notes out/release-notes-0.10.0.md

PAT 需要 repo 权限（classic）。走 SSH 推送不受 workflow scope 限制。
token 只从环境变量读，不落盘、不打印。
"""
import argparse
import glob
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

API = "https://api.github.com"
UPLOADS = "https://uploads.github.com"


def call(method, url, token, payload=None, raw=None, content_type=None):
    data = None
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "mcarcade-core-publish",
    }
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    elif raw is not None:
        data = raw
        headers["Content-Type"] = content_type or "application/octet-stream"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            body = r.read()
            return r.status, json.loads(body) if body[:1] in (b"{", b"[") else body
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, body.decode("utf-8", "replace")


def git(*args, cwd=None):
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"git {' '.join(args)} 失败：\n{r.stderr.strip()}")
    return r.stdout.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="mcarcade-core")
    ap.add_argument("--tag", default="v0.10.0")
    ap.add_argument("--zip", required=True, help="发布包路径（可用通配符）")
    ap.add_argument("--notes", required=True, help="Release 说明 markdown 路径")
    ap.add_argument("--branch", default="main")
    args = ap.parse_args()

    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        sys.exit("请先设置 GH_TOKEN 环境变量（repo 权限的 PAT）")

    root = git("rev-parse", "--show-toplevel")
    zips = sorted(glob.glob(os.path.join(root, args.zip)) or glob.glob(args.zip))
    if not zips:
        sys.exit(f"找不到发布包：{args.zip}")
    zpath = zips[-1]
    zname = os.path.basename(zpath)

    # ---- 1. 我是谁 ----
    st, me = call("GET", f"{API}/user", token)
    if st != 200:
        sys.exit(f"token 无效（{st}）：{me}")
    owner = me["login"]
    print(f"[1/6] 登录为 {owner}")

    # ---- 2. 建仓库（已存在就复用）----
    st, repo = call("POST", f"{API}/user/repos", token, payload={
        "name": args.repo,
        "description": "MakeCode Arcade 的 libretro 核心：内嵌官方 pxt 编译器，.png 卡带拖进 RetroArch 直接跑",
        "private": False,
        "has_issues": True,
        "has_wiki": False,
        "has_projects": False,
    })
    if st == 201:
        print(f"[2/6] 建好仓库 {repo['full_name']}")
    elif st == 422:
        st2, repo = call("GET", f"{API}/repos/{owner}/{args.repo}", token)
        if st2 != 200:
            sys.exit(f"仓库已存在但读不到：{st2} {repo}")
        print(f"[2/6] 仓库已存在，复用 {repo['full_name']}")
    else:
        sys.exit(f"建仓库失败 {st}：{repo}")

    # ---- 3. 注册部署密钥（已存在就跳过）----
    pub = os.path.expanduser("~/.ssh/mcarcade_deploy.pub")
    if os.path.isfile(pub):
        key = open(pub, encoding="utf-8").read().strip()
        st, keys = call("GET", f"{API}/repos/{owner}/{args.repo}/keys", token)
        have = isinstance(keys, list) and any(k.get("key", "").split()[:2] == key.split()[:2] for k in keys)
        if have:
            print("[3/6] 部署密钥已在，跳过")
        else:
            st, r = call("POST", f"{API}/repos/{owner}/{args.repo}/keys", token, payload={
                "title": "mcarcade-core 发布机（ssh.github.com:443）",
                "key": key,
                "read_only": False,
            })
            print(f"[3/6] 部署密钥{'注册成功' if st == 201 else f'注册失败 {st}：{r}'}")
    else:
        print("[3/6] 没有 ~/.ssh/mcarcade_deploy.pub，跳过（推送会失败）")

    # ---- 4. push（SSH）----
    remote = f"git@github.com:{owner}/{args.repo}.git"
    remotes = git("remote", cwd=root)
    if "origin" in remotes:
        git("remote", "set-url", "origin", remote, cwd=root)
    else:
        git("remote", "add", "origin", remote, cwd=root)
    print(f"[4/6] 推送到 {remote}")
    print(git("push", "-u", "origin", args.branch, cwd=root))

    # ---- 5. tag ----
    if args.tag in git("tag", cwd=root).split():
        print(f"[5/6] tag {args.tag} 已存在")
    else:
        git("tag", "-a", args.tag, "-m", f"mcarcade-core {args.tag}", cwd=root)
    print(git("push", "origin", args.tag, cwd=root))

    # ---- 6. Release + 上传 ----
    body = open(args.notes, encoding="utf-8").read()
    st, rel = call("POST", f"{API}/repos/{owner}/{args.repo}/releases", token, payload={
        "tag_name": args.tag,
        "name": args.tag,
        "body": body,
        "draft": False,
        "prerelease": False,
    })
    if st == 422:
        st, rel = call("GET", f"{API}/repos/{owner}/{args.repo}/releases/tags/{args.tag}", token)
    if st not in (200, 201):
        sys.exit(f"发 Release 失败 {st}：{rel}")
    print(f"[6/6] Release {rel['html_url']}")

    existing = {a["name"] for a in rel.get("assets", [])}
    if zname in existing:
        print(f"       {zname} 已挂过，跳过上传")
    else:
        with open(zpath, "rb") as f:
            blob = f.read()
        st, asset = call(
            "POST",
            f"{UPLOADS}/repos/{owner}/{args.repo}/releases/{rel['id']}/assets?name={zname}",
            token, raw=blob, content_type="application/zip",
        )
        if st == 201:
            print(f"       已上传 {zname}（{asset['size']:,} 字节）")
        else:
            sys.exit(f"上传失败 {st}：{asset}")

    print(f"\n完成：https://github.com/{owner}/{args.repo}/releases/tag/{args.tag}")


if __name__ == "__main__":
    main()
