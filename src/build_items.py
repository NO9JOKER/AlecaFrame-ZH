#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 AlecaFrame 本地游戏数据生成物品名中英对照 dict/items.tsv。

数据来源（本机，安装官方 AlecaFrame 并打开一次后生成）：
    %LOCALAPPDATA%\\AlecaFrame\\cachedData\\json\\
      - Mods.json / Primary.json / Melee.json / Arcanes.json / Resources.json / Relics.json / Components.json ...
      - lang.json（uniqueName -> 14 种语言名称，含 zh 简体）

用法：
    python src/build_items.py
    python src/build_items.py --data-dir "D:\\path\\to\\cachedData\\json" --out dict/items.tsv

规则：
    - 武器/Mod/赋能/资源/宠物等：直接取 lang.json 的 zh 名称；
    - 战甲（Warframes）保留英文，不生成映射；
    - 遗物：中英都去掉精炼后缀，Axi A1 Exceptional -> 后纪 A1；
    - 部件：父物品中文名 + 部件中文名；父级是战甲时保留英文父名；
    - 输出 TSV（英文<TAB>中文），由 src/build.py 合并。
"""
import argparse
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(BASE)
DEFAULT_DATA = os.path.join(
    os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"),
    "AlecaFrame", "cachedData", "json",
)

PLAIN_FILES = [
    "Mods", "Arcanes", "Primary", "Secondary", "Melee", "Arch-Gun", "Arch-Melee",
    "Archwing", "Sentinels", "SentinelWeapons", "Pets", "Gear", "Resources",
    "Fish", "Quests", "Misc", "Skins", "Glyphs", "Sigils",
]
ALL_FILES = PLAIN_FILES + ["Warframes", "Components", "Relics"]

PART_ZH = {
    "Blueprint": "蓝图", "Chassis": "机体", "Neuroptics": "神经光元", "Systems": "系统",
    "Barrel": "枪管", "Receiver": "机匣", "Stock": "枪托", "Upper Receiver": "上机匣",
    "Lower Receiver": "下机匣", "Blade": "刀刃", "Handle": "握柄", "Hilt": "剑柄",
    "Guard": "护手", "Rivet": "铆钉", "Chain": "链条", "Grip": "握把", "Head": "锤头",
    "Ornament": "装饰", "Link": "连接器", "Disc": "圆盘", "String": "弓弦", "Limb": "弓臂",
    "Pouch": "袋", "Carapace": "甲壳", "Cerebrum": "大脑", "Harness": "护具", "Wings": "翼",
    "Left Gauntlet": "左拳套", "Right Gauntlet": "右拳套", "Gauntlet": "拳套",
    "Boot": "靴", "Wing": "翼", "Core": "核心", "Shell": "外壳", "Barrel Assembly": "枪管组件",
}

REFINE_EN = [" Intact", " Exceptional", " Flawless", " Radiant"]
REFINE_ZH = [" 完好", " 优良", " 无瑕", " 光辉"]

MANUAL = {
    "Forma Blueprint": "Forma 蓝图",
    "Orokin Catalyst Blueprint": "Orokin 催化剂蓝图",
    "Orokin Reactor Blueprint": "Orokin 反应堆蓝图",
    "Orokin Catalyst": "Orokin 催化剂",
    "Orokin Reactor": "Orokin 反应堆",
    "Exilus Warframe Adapter Blueprint": "特殊功能战甲适配器蓝图",
    "Exilus Weapon Adapter Blueprint": "特殊功能武器适配器蓝图",
    "Aura Forma Blueprint": "光环 Forma 蓝图",
    "Stance Forma Blueprint": "架势 Forma 蓝图",
    "Umbra Forma Blueprint": "Umbra Forma 蓝图",
    "Primary Arcane Adapter": "主武器赋能适配器",
    "Secondary Arcane Adapter": "副武器赋能适配器",
    "Melee Arcane Adapter": "近战赋能适配器",
}


class Data:
    def __init__(self, data_dir):
        self.dir = data_dir
        self.lang = json.load(open(os.path.join(data_dir, "lang.json"), encoding="utf-8"))
        self.by_uid = {}
        self.cache = {}

    def list(self, name):
        if name not in self.cache:
            p = os.path.join(self.dir, name + ".json")
            self.cache[name] = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else []
        return self.cache[name]

    def zh(self, uid):
        v = self.lang.get(uid) or {}
        return ((v.get("zh") or {}).get("name") or "").strip() or None


def main():
    ap = argparse.ArgumentParser(description="Generate item name mapping from AlecaFrame game data")
    ap.add_argument("--data-dir", default=DEFAULT_DATA, help="cachedData/json 目录")
    ap.add_argument("--out", default=os.path.join(PKG, "dict", "items.tsv"))
    args = ap.parse_args()

    if not os.path.isdir(args.data_dir):
        raise SystemExit(
            "找不到游戏数据目录：\n  " + args.data_dir +
            "\n请先安装官方 AlecaFrame，打开一次，等游戏数据下载完成后重试。"
        )

    data = Data(args.data_dir)
    for f in ALL_FILES:
        for it in data.list(f):
            if isinstance(it, dict) and it.get("uniqueName") and it.get("name"):
                data.by_uid.setdefault(it["uniqueName"], it["name"])

    pairs = {}
    conflicts = []

    def add(en, z):
        en = (en or "").strip()
        z = (z or "").strip()
        if not en or not z or en == z:
            return
        if any(ch in en or ch in z for ch in ("\t", "\n", "\r")):
            return
        if en in pairs and pairs[en] != z:
            conflicts.append((en, pairs[en], z))
            return
        pairs[en] = z

    # 1) 普通物品（战甲除外）
    for f in PLAIN_FILES:
        for it in data.list(f):
            if not isinstance(it, dict):
                continue
            en, uid = it.get("name"), it.get("uniqueName")
            if not en or not uid:
                continue
            z = data.zh(uid)
            if z:
                add(en, z)

    # 2) 遗物：去掉精炼后缀
    for it in data.list("Relics"):
        en, z = it.get("name") or "", data.zh(it.get("uniqueName"))
        if not en or not z:
            continue
        for suf in REFINE_EN:
            if en.endswith(suf):
                base_en = en[: -len(suf)]
                base_zh = z
                for zs in REFINE_ZH + [" 遗物"]:
                    if base_zh.endswith(zs):
                        base_zh = base_zh[: -len(zs)]
                add(base_en, base_zh)
                add(en, base_zh)
                break

    # 3) 部件：父名 + 部件名
    warframe_uids = {it.get("uniqueName") for it in data.list("Warframes") if isinstance(it, dict)}
    for it in data.list("Components"):
        if not isinstance(it, dict):
            continue
        uid = it.get("uniqueName")
        part_en = it.get("name")
        part_zh = data.zh(uid) or PART_ZH.get(part_en)
        parents = it.get("parentUniqueNames") or []
        if not part_zh or not part_en or not parents:
            continue
        parent = parents[0]
        parent_en = data.by_uid.get(parent)
        if not parent_en:
            continue
        parent_zh = data.zh(parent)
        if parent in warframe_uids:
            zh_full = f"{parent_en} {part_zh}"
        else:
            zh_full = f"{parent_zh or parent_en} {part_zh}"
        add(f"{parent_en} {part_en}", zh_full)
        for d in it.get("drops") or []:
            t = d.get("type")
            if not (t and t.startswith(parent_en)):
                continue
            if t.endswith(" Blueprint") and not part_en.endswith("Blueprint"):
                add(t, zh_full + "蓝图")
            else:
                add(t, zh_full)

    for k, v in MANUAL.items():
        add(k, v)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    lines = [k + "\t" + v for k, v in pairs.items()]
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    print(f"pairs={len(pairs)} conflicts={len(conflicts)} written={len(lines)} -> {args.out}")
    for c in conflicts[:10]:
        print("CONFLICT", c)


if __name__ == "__main__":
    main()
