#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 MIOEU 的 alecaframe-zh-cn-items.js 转成 dict/mioeu-terms.tsv（英文<TAB>中文）。

MIOEU（MIT）里的 alecaframe-zh-cn-items.js 是一个 JS 对象字面量：
    window.__ALECAFRAME_ZH_CN_ITEMS__ = { "Abating Link": "耗弱链接", ... };
内容来源是社区维基双语术语表（AdminRoc/Warframe-Chinese-English-Bilingual），
包含游戏内实体（武器/战甲/部件/遗物/场景/鱼/动物印记…）以及 wiki 术语。

我们自己的分层优先（与 src/build.py 的合并顺序一致）：
    items.tsv（游戏数据生成） -> vendor -> fixes.tsv -> extra-*.tsv
本脚本只把“我们还没有的键”写进 mioeu-terms.tsv；同名键即使译名不同也不写入
（我们的值优先），差异写到 --diff-out 报告里。

基线（baseline）规则：只与「吸收 MIOEU 之前就存在的层」比较——
items.tsv、vendor、fixes.tsv、extra-1..extra-7。`extra-8.tsv` 及之后的人工层是
**在 MIOEU 术语层存在之后**按界面缺口补出来的，若把它们算进基线，本脚本的输出会
随补缺文件变化（不幂等，甚至循环依赖），因此默认排除（`--baseline-extra-max 7`）。
将来新增「吸收前」的人工层时，把这个上限调大即可。

用法：
    python src/import_mioeu.py                     # 默认读 ../upstream/mioeu/
    python src/import_mioeu.py --source "...js" --out dict/mioeu-terms.tsv
    python src/import_mioeu.py --diff-out docs/mioeu-diff.tsv
    python src/import_mioeu.py --baseline-extra-max 7   # 基线包含哪些 extra-N.tsv
"""
import argparse
import glob
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(BASE)
DICT = os.path.join(PKG, "dict")
DEFAULT_SOURCE = os.path.join(os.path.dirname(PKG), "upstream", "mioeu", "alecaframe-zh-cn-items.js")
DEFAULT_OUT = os.path.join(DICT, "mioeu-terms.tsv")

CJK = re.compile(r"[\u3400-\u9fff\uf900-\ufaff]")
HAS_LETTER = re.compile(r"[A-Za-z]")
WS = re.compile(r"[ \t\u00a0]+")


def load_tsv(path):
    d = {}
    if not os.path.exists(path):
        return d
    with open(path, encoding="utf-8-sig") as f:
        for line in f:
            line = line.rstrip("\r\n")
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) < 2:
                continue
            k, v = parts[0], "\t".join(parts[1:])
            if k.strip():
                d[k] = v
    return d


def _extra_index(name):
    m = re.match(r"extra-(\d+)\.tsv$", name)
    return int(m.group(1)) if m else 10 ** 9


def load_ours(baseline_extra_max=7):
    """按 build.py 的优先级合并基线层，返回 (merged, layer_of)。

    只合并 items.tsv / vendor / fixes.tsv / extra-1..extra-N（N=baseline_extra_max）；
    更靠后的 extra 层是在 MIOEU 吸收之后派生的界面补缺，不参与基线比较。
    """
    merged, layer = {}, {}
    order = []
    items = load_tsv(os.path.join(DICT, "items.tsv"))
    order.append(("items.tsv", items))
    vendor_path = os.path.join(BASE, "vendor", "translations.zh-CN.json")
    vendor = {}
    if os.path.exists(vendor_path):
        vendor = json.load(open(vendor_path, encoding="utf-8"))
    order.append(("vendor/translations.zh-CN.json", vendor))
    order.append(("fixes.tsv", load_tsv(os.path.join(DICT, "fixes.tsv"))))
    for name in sorted(glob.glob(os.path.join(DICT, "extra-*.tsv"))):
        base = os.path.basename(name)
        if _extra_index(base) <= baseline_extra_max:
            order.append((base, load_tsv(name)))
    for name, d in order:
        for k, v in d.items():
            merged[k] = v
            layer[k] = name
    return merged, layer


def parse_mioeu(path):
    text = open(path, encoding="utf-8").read()
    i, j = text.find("{"), text.rfind("}")
    if i < 0 or j <= i:
        sys.exit("源文件里找不到 {} 对象：%s" % path)
    obj = json.loads(text[i:j + 1])
    return obj


def main():
    ap = argparse.ArgumentParser(description="Import MIOEU terminology into dict/mioeu-terms.tsv")
    ap.add_argument("--source", default=DEFAULT_SOURCE, help="MIOEU alecaframe-zh-cn-items.js")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--diff-out", default=None, help="把冲突条目写到这个 TSV（英文/我们的/我们的层/MIOEU）")
    ap.add_argument("--list-conflicts", type=int, default=15, help="stdout 展示多少条冲突样例")
    ap.add_argument("--baseline-extra-max", type=int, default=7,
                    help="基线包含 extra-1..extra-N（默认 7；更靠后的 extra 层是 MIOEU 之后派生的，不参与比较）")
    args = ap.parse_args()

    if not os.path.exists(args.source):
        sys.exit("找不到 %s（MIOEU 仓库应放在 ../upstream/mioeu/）" % args.source)

    mioeu = parse_mioeu(args.source)
    ours, layer = load_ours(args.baseline_extra_max)

    same = conflicts = invalid = case_dup = 0
    kept = {}
    diff_rows = []
    for k, v in mioeu.items():
        if not isinstance(k, str) or not isinstance(v, str):
            invalid += 1
            continue
        k = k.strip()
        v = v.strip()
        if not k or not v or not HAS_LETTER.search(k):
            invalid += 1
            continue
        if "\t" in k or "\t" in v or "\n" in k or "\n" in v or "\r" in k or "\r" in v:
            invalid += 1
            continue
        # 无意义条目：中文 == 英文（忽略大小写与空白），或译文根本不含中文
        if WS.sub("", k).lower() == WS.sub("", v).lower() or not CJK.search(v):
            invalid += 1
            continue
        if k in ours:
            if ours[k] == v:
                same += 1
            else:
                conflicts += 1
                diff_rows.append((k, ours[k], layer.get(k, "?"), v))
            continue
        kept[k] = v

    # 大小写冲突单独再筛一遍（避免 "Axi A1 Relic" vs "axi a1 relic" 之类重复）
    lower_seen = {}
    for k in ours:
        lower_seen.setdefault(k.lower(), k)
    for k in list(kept):
        lk = k.lower()
        if lk in lower_seen and lower_seen[lk] != k:
            case_dup += 1
            del kept[k]

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        for k in sorted(kept):
            f.write(k + "\t" + kept[k] + "\n")

    if args.diff_out:
        os.makedirs(os.path.dirname(args.diff_out), exist_ok=True)
        with open(args.diff_out, "w", encoding="utf-8", newline="\n") as f:
            for k, ov, lay, mv in sorted(diff_rows):
                f.write("%s\t%s\t%s\t%s\n" % (k, ov, lay, mv))

    print("source      : %s" % args.source)
    print("baseline    : items.tsv + vendor + fixes.tsv + extra-1..%d.tsv" % args.baseline_extra_max)
    print("mioeu total : %d" % len(mioeu))
    print("invalid     : %d  (空值/英文=中文/无中文/含制表符)" % invalid)
    print("already same: %d  (我们已有且译文完全一致)" % same)
    print("conflicts   : %d  (我们已有但译名不同 -> 保留我们的值)" % conflicts)
    print("case dup    : %d  (键仅大小写不同 -> 丢弃)" % case_dup)
    print("ours total  : %d" % len(ours))
    print("wrote       : %s  (%d 条)" % (args.out, len(kept)))
    if args.diff_out:
        print("diff report : %s  (%d 行)" % (args.diff_out, len(diff_rows)))
    for row in sorted(diff_rows)[:args.list_conflicts]:
        print("  conflict: %s | ours=%s (%s) | mioeu=%s" % (row[0], row[1], row[2], row[3]))


if __name__ == "__main__":
    main()
