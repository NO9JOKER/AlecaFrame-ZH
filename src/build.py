#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""构建 AlecaFrame-ZH 运行时脚本：合并词典 + 翻译层 + 可选增强模块。

用法：
    python src/build.py                 # 合并 dict/ + vendor 词典，并做本地校验
    python src/build.py --skip-validate # 跳过“词条是否在应用源码中出现”的校验
    python src/build.py --app-dir "C:\\...\\Extensions\\<appId>\\3.0.6"

词典分层（后者覆盖前者）：
    dict/items.tsv       游戏数据生成的物品/部件名（官方简中词形，权威）
    dict/mioeu-terms.tsv 吸收自 MIOEU 的术语/物品表（只补缺口）
    src/vendor/translations.zh-CN.json  上游 UI 词库
    dict/fixes.tsv       上游机翻修正
    dict/extra-*.tsv     人工补充/覆盖（最后生效）

产物：
    bin/alecaframe-zh-cn.js   注入页面的运行时（词典 + 翻译层 + 中文搜索）
    bin/ocr/afzh-items.js     OCR 服务端用的英文->中文映射（同 source，供 vm 加载）
"""
import argparse
import glob
import re
import json
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(BASE)
DICT_DIR = os.path.join(PKG, "dict")
UPSTREAM = os.path.join(BASE, "vendor", "translations.zh-CN.json")
ENGINE = os.path.join(BASE, "engine.js")
SEARCH = os.path.join(BASE, "search.js")
OUT = os.path.join(PKG, "bin", "alecaframe-zh-cn.js")
OCR_ITEMS = os.path.join(PKG, "bin", "ocr", "afzh-items.js")
UNMATCHED = os.path.join(PKG, "build-unmatched.txt")

APP_ID = "afmcagbpgggkpdkokjhjkllpegnadmkignlonpjm"



def extra_sort_key(path):
    """extra-*.tsv 按数字顺序叠加（extra-9 之后才是 extra-10/11），保证新层能覆盖旧层。"""
    name = os.path.basename(path)
    hit = re.match(r"extra-(\d+)\.tsv$", name)
    if hit:
        return (0, int(hit.group(1)), name)
    return (1, 0, name)


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
    mioeu = load_tsv(os.path.join(DICT_DIR, "mioeu-terms.tsv"))
    fixes = load_tsv(os.path.join(DICT_DIR, "fixes.tsv"))
    extras = {}
    for p in sorted(glob.glob(os.path.join(DICT_DIR, "extra-*.tsv")), key=extra_sort_key):
        extras.update(load_tsv(p))

    # 优先级：游戏数据物品名 -> MIOEU 术语补缺 -> 上游 UI -> 机翻修正 -> 人工覆盖
    merged = {}
    merged.update(items)
    merged.update(mioeu)
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
                # 跳过本项目自己注入的脚本，避免“词典里有的都算已存在”的假阴性
                if f == "alecaframe-zh-cn.js" or f.startswith("afzh-"):
                    continue
                if f.endswith((".html", ".js", ".css")):
                    try:
                        blob_parts.append(open(os.path.join(root, f), encoding="utf-8", errors="replace").read())
                    except OSError:
                        pass
        blob = "\n".join(blob_parts)
        # 源码里的引号/撇号是转义形式（\' \"），先还原再做包含判断，减少假阴性
        blob_unescaped = blob.replace("\\'", "'").replace('\\"', '"')
        notfound = []
        for k in merged:
            if k not in ui_keys:
                continue
            if k in blob or k in blob_unescaped:
                continue
            esc = k.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            if esc in blob or esc in blob_unescaped:
                continue
            notfound.append(k)
        with open(UNMATCHED, "w", encoding="utf-8") as f:
            f.write("\n".join(sorted(notfound)))
        print(f"validate: app={app_dir}")
        print(f"validate: UI keys not found in app source: {len(notfound)}（旧版本残留/转义差异，见 build-unmatched.txt）")
    else:
        print("validate: skipped (未找到本地 AlecaFrame 安装)")

    engine = open(ENGINE, encoding="utf-8").read()
    search = open(SEARCH, encoding="utf-8").read() if os.path.exists(SEARCH) else ""

    # 遗物奖励索引：库存「遗物」列表只带遗物名，中文模糊搜索（如「死亡」→ 含「死亡魔方」奖励的遗物）
    # 需要奖励中文名一起参与匹配。数据由 src/build_relic_rewards.py 生成后入库（CI 无需 cachedData）。
    relic_rewards = {}
    relic_path = os.path.join(DICT_DIR, "relic-rewards.tsv")
    if os.path.exists(relic_path):
        for line in open(relic_path, encoding="utf-8"):
            line = line.rstrip("\r\n")
            if "\t" not in line:
                continue
            key, value = line.split("\t", 1)
            if key and value:
                relic_rewards[key] = value

    dict_js = (
        "/* AlecaFrame-ZH: 自动生成，请勿手改（改 src/engine.js、src/search.js 与 dict/*.tsv） */\n"
        "window.__AFCN_DICT__ = "
        + json.dumps(merged, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
        + "window.__AFCN_RELIC_REWARDS__ = "
        + json.dumps(relic_rewards, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
        # 兼容 MIOEU 的遗物/裂罅 OCR 脚本：它们读取 __ALECAFRAME_ZH_CN_ITEMS__
        "window.__ALECAFRAME_ZH_CN_ITEMS__ = window.__AFCN_DICT__;\n"
    )
    content = dict_js + engine + ("\n" + search if search else "")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)

    # OCR 服务端用 vm 加载这个文件来建英文->中文映射（见 bin/ocr/relic-ocr-server.js）
    os.makedirs(os.path.dirname(OCR_ITEMS), exist_ok=True)
    with open(OCR_ITEMS, "w", encoding="utf-8", newline="\n") as f:
        f.write(
            "/* 自动生成：供 OCR 服务 vm 加载，勿手改 */\n"
            "window.__ALECAFRAME_ZH_CN_ITEMS__ = "
            + json.dumps(merged, ensure_ascii=False, separators=(",", ":"))
            + ";\n"
        )

    print(
        f"layers: items={len(items)} mioeu={len(mioeu)} upstream={len(upstream)} "
        f"fixes={len(fixes)} extras={len(extras)}"
    )
    print(f"merged={len(merged)} search={'yes' if search else 'no'} engine={len(engine)}B")
    print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes)")
    print(f"wrote {OCR_ITEMS} ({os.path.getsize(OCR_ITEMS)} bytes)")


if __name__ == "__main__":
    main()
