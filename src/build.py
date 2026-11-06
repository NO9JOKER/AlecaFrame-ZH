#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""构建 AlecaFrame-ZH 运行时脚本：合并词典 + 翻译层，输出 bin/alecaframe-zh-cn.js。

用法：
    python src/build.py                 # 合并 dict/ + vendor 词典，并做本地校验
    python src/build.py --skip-validate # 跳过“词条是否在应用源码中出现”的校验
    python src/build.py --app-dir "C:\\...\\Extensions\\<appId>\\3.0.6"

输出：bin/alecaframe-zh-cn.js
"""
import argparse
import glob
import json
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(BASE)
DICT_DIR = os.path.join(PKG, "dict")
UPSTREAM = os.path.join(BASE, "vendor", "translations.zh-CN.json")
ENGINE = os.path.join(BASE, "engine.js")
OUT = os.path.join(PKG, "bin", "alecaframe-zh-cn.js")
UNMATCHED = os.path.join(PKG, "build-unmatched.txt")

APP_ID = "afmcagbpgggkpdkokjhjkllpegnadmkignlonpjm"


def load_tsv(path):
    d = {}
    if not os.path.exists(path):
        return d
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\r\n")
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) < 2:
                print("WARN bad tsv line in", os.path.basename(path), ":", line[:80])
                continue
            k, v = parts[0], "\t".join(parts[1:])
            if k.strip():
                d[k] = v
    return d


def default_ext_dir():
    local = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    return os.path.join(local, "Overwolf", "Extensions", APP_ID)


def latest_app_dir(ext_root):
    """在 Extensions/<appId>/ 下选择版本号最大的目录。"""
    if not os.path.isdir(ext_root):
        return None
    best = None
    for name in os.listdir(ext_root):
        p = os.path.join(ext_root, name)
        if not os.path.isdir(p) or not os.path.exists(os.path.join(p, "manifest.json")):
            continue
        key = tuple(int(x) for x in name.split(".") if x.isdigit())
        if best is None or key > best[0]:
            best = (key, p)
    return best[1] if best else None


def main():
    ap = argparse.ArgumentParser(description="Build AlecaFrame-ZH runtime dictionary")
    ap.add_argument("--app-dir", default=None, help="AlecaFrame 扩展版本目录（用于校验词条）")
    ap.add_argument("--skip-validate", action="store_true", help="跳过源码校验")
    args = ap.parse_args()

    if not os.path.exists(UPSTREAM):
        sys.exit("缺少 src/vendor/translations.zh-CN.json")
    if not os.path.exists(ENGINE):
        sys.exit("缺少 src/engine.js")

    upstream = json.load(open(UPSTREAM, encoding="utf-8"))
    items = load_tsv(os.path.join(DICT_DIR, "items.tsv"))
    fixes = load_tsv(os.path.join(DICT_DIR, "fixes.tsv"))
    extras = {}
    for p in sorted(glob.glob(os.path.join(DICT_DIR, "extra-*.tsv"))):
        extras.update(load_tsv(p))

    # 优先级：items 先铺底，再由 UI 词条覆盖同名条目
    merged = {}
    merged.update(items)
    merged.update(upstream)
    merged.update(fixes)
    merged.update(extras)

    ui_keys = set(upstream) | set(fixes) | set(extras)

    # 可选的源码校验：确认 UI 词条确实能在应用里找到（拼写/标点错误会暴露）
    app_dir = args.app_dir or latest_app_dir(default_ext_dir())
    if app_dir and not args.skip_validate and os.path.isdir(app_dir):
        blob_parts = []
        for root, _dirs, files in os.walk(app_dir):
            for f in files:
                if f.endswith((".html", ".js", ".css")):
                    try:
                        blob_parts.append(open(os.path.join(root, f), encoding="utf-8", errors="replace").read())
                    except OSError:
                        pass
        blob = "\n".join(blob_parts)
        notfound = []
        for k in merged:
            if k not in ui_keys:
                continue
            if k in blob:
                continue
            esc = k.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            if esc in blob:
                continue
            notfound.append(k)
        with open(UNMATCHED, "w", encoding="utf-8") as f:
            f.write("\n".join(sorted(notfound)))
        print(f"validate: app={app_dir}")
        print(f"validate: UI keys not found in app source: {len(notfound)} (see build-unmatched.txt)")
    else:
        print("validate: skipped (未找到本地 AlecaFrame 安装)")

    engine = open(ENGINE, encoding="utf-8").read()
    dict_js = "window.__AFCN_DICT__ = " + json.dumps(merged, ensure_ascii=False, separators=(",", ":")) + ";\n"
    content = "/* AlecaFrame-ZH: 自动生成，请勿手改（改 src/engine.js 与 dict/*.tsv） */\n" + dict_js + engine
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)

    print(f"upstream={len(upstream)} fixes={len(fixes)} extras={len(extras)} items={len(items)} merged={len(merged)}")
    print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    main()
