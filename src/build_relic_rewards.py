#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 dict/relic-rewards.tsv：遗物 → 奖励中文名文本（供中文模糊搜索用）。

背景：库存「遗物」页的搜索由原生插件按英文物品名匹配（含奖励名），我们的本地中文过滤只拿得到
遗物名（`Axi A1 Exceptional`），拿不到奖励名，所以「死亡」这类部分中文搜不到。这里把
AlecaFrame 本机游戏数据（Relics.json + lang.json）里的奖励做成一张索引，运行时拼进搜索文本。

只在本机跑（需要已安装 AlecaFrame 并打开过）：
    python src/build_relic_rewards.py
输出（提交到仓库，CI 不需要重跑）：
    dict/relic-rewards.tsv   遗物基础名<TAB>奖励中文名（空格分隔）
"""
import io
import json
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(BASE)
OUT = os.path.join(PKG, "dict", "relic-rewards.tsv")
REFINE = [" Intact", " Exceptional", " Flawless", " Radiant"]


def find_data_dir():
    for env in ("LOCALAPPDATA", "APPDATA"):
        root = os.environ.get(env)
        if not root:
            continue
        p = os.path.join(root, "AlecaFrame", "cachedData", "json")
        if os.path.isdir(p) and os.path.exists(os.path.join(p, "Relics.json")):
            return p
    return None


def strip_refine(name):
    for suffix in REFINE:
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return name


def main():
    data = find_data_dir()
    if not data:
        print("找不到 AlecaFrame cachedData（先安装并打开一次 AlecaFrame）", file=sys.stderr)
        return 1
    relics = json.load(open(os.path.join(data, "Relics.json"), encoding="utf-8"))
    lang = json.load(open(os.path.join(data, "lang.json"), encoding="utf-8"))

    # 奖励名优先用本项目词典（与界面显示一致）；游戏数据的 zh 字段很多仍是英文，只作兜底。
    dict_map = {}
    items_path = os.path.join(PKG, "dict", "items.tsv")
    with io.open(items_path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\r\n")
            if "\t" not in line:
                continue
            en, zh = line.split("\t", 1)
            if en and zh and zh != en:
                dict_map[en] = zh

    def zh_name(unique, english):
        hit = dict_map.get(english)
        if hit:
            return hit
        entry = lang.get(unique) or {}
        zh = (entry.get("zh") or {}).get("name")
        return zh if zh and zh != english else english

    table = {}
    for relic in relics:
        name = relic.get("name") or ""
        if not name:
            continue
        base = strip_refine(name)
        rewards = []
        for reward in relic.get("rewards") or []:
            item = reward.get("item") or {}
            english = item.get("name") or ""
            if not english:
                continue
            rewards.append(zh_name(item.get("uniqueName") or "", english))
        if not rewards:
            continue
        table.setdefault(base, set()).update(rewards)

    lines = []
    for base in sorted(table):
        text = " ".join(sorted(table[base]))
        lines.append(base + "\t" + text)

    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    print("relics with rewards:", len(table), "->", OUT, os.path.getsize(OUT), "bytes")
    for sample in ("Axi A1", "Axi D1", "Neo N1"):
        print(" ", sample, "=>", table.get(sample, "(missing)") and " ".join(sorted(table[sample]))[:100])
    return 0


if __name__ == "__main__":
    sys.exit(main())
