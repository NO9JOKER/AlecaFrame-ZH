#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CLI for the new dictionary layout.

Commands:
  add <en> <zh>   append a new manual entry to a manifest-listed 2-column layer
  lookup <text>   show every layer and the effective value
  check [--strict] validate manifest, layers, overrides and policy
  report          per-layer counts and validation summary

The dictionary manifest is the only load order. See schemas/dict-manifest.spec.md.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dictlib  # noqa: E402


def cmd_lookup(args) -> int:
    result = dictlib.lookup(Path(args.root), args.text)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"query: {result['query']}")
        for match in result["matches"]:
            print(
                f"  layer={match['layer']} kind={match['kind']} line={match['line']} "
                f"{match['key']!r} -> {match['value']!r}"
            )
        effective = result["effective"]
        if effective is None:
            print("effective: <not found>")
        else:
            print(f"effective: {effective['key']!r} -> {effective['value']!r} (from {effective['layer']})")
        for error in result["errors"]:
            print(f"error: {error}")
    return 1 if result["errors"] else 0


def cmd_check(args) -> int:
    result = dictlib.check(Path(args.root), strict=args.strict)
    payload = {
        "layers": result.layers,
        "entries": result.entries,
        "overrides": result.overrides,
        "policy": result.policy,
        "index": result.index,
        "errors": list(result.errors),
        "warnings": list(result.warnings),
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        for warning in result.warnings:
            print(f"WARN {warning}")
        for error in result.errors:
            print(f"ERROR {error}")
        status = "OK" if result.ok(strict=args.strict) else "FAIL"
        print(f"dict: {status} (layers={result.layers}, entries={result.entries}, overrides={result.overrides})")
    return 0 if result.ok(strict=args.strict) else 1


def cmd_report(args) -> int:
    payload = dictlib.report(Path(args.root))
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print("layers:")
        for layer in payload["layers"]:
            print(
                f"  order={layer['order']:>4} kind={layer['kind']:<9} scope={layer['scope']:<16} "
                f"entries={layer['entries']:<5} {layer['path']}"
            )
        counts = payload["counts"]
        print(
            f"counts: entries={counts['entries']} overrides={counts['overrides']} "
            f"policy={counts['policy']} index={counts['index']}"
        )
        for warning in payload["warnings"]:
            print(f"WARN {warning}")
        for error in payload["errors"]:
            print(f"ERROR {error}")
    return 1 if payload["errors"] else 0


def cmd_add(args) -> int:
    root = Path(args.root)
    dict_dir = root / dictlib.DICT_DIR
    target = (dict_dir / args.file).resolve()
    try:
        relative = target.relative_to(dict_dir.resolve()).as_posix()
    except ValueError:
        print(f"dict: INPUT ERROR 目标文件不在 dict/ 下: {args.file}")
        return 2
    if "\t" in args.english or "\t" in args.chinese or "\n" in args.english or "\n" in args.chinese:
        print("dict: INPUT ERROR 英文/中文不能包含 tab 或换行")
        return 2
    tree = dictlib.load_tree(root)
    layer = next((item for item in tree.layers if item.path == relative), None)
    if layer is None:
        print(f"dict: INPUT ERROR 目标文件未登记在 manifest: {relative}")
        return 2
    if layer.kind != "manual" or layer.schema != 2:
        print(f"dict: INPUT ERROR 只能向 manual/2 列层加词条: {relative} kind={layer.kind} schema={layer.schema}")
        return 2
    for entry in tree.entries_by_order[layer.order]:
        if entry.key == args.english:
            print(f"dict: INPUT ERROR 键已存在于 {layer.path}:{entry.line}: {args.english!r}")
            return 1
    for entry in tree.policy:
        if entry.key == args.english:
            print(f"dict: INPUT ERROR 键已在 keep-english: {args.english!r}")
            return 1
    if not target.is_file():
        print(f"dict: INPUT ERROR 缺少目标文件: {relative}")
        return 2
    original = target.read_text(encoding="utf-8")
    separator = "" if not original or original.endswith("\n") else "\n"
    target.write_text(original + separator + args.english + "\t" + args.chinese + "\n", encoding="utf-8", newline="\n")
    result = dictlib.check(root, strict=True)
    if not result.ok(strict=True):
        target.write_text(original, encoding="utf-8", newline="\n")
        for error in result.errors:
            print(f"ERROR {error}")
        print("dict: FAIL 已回滚新增词条")
        return 1
    print(f"dict: added {args.english!r} -> {args.chinese!r} in {relative}")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="AlecaFrame-ZH dictionary tool")
    parser.add_argument("--root", default=str(dictlib.ROOT), help="repository root")
    sub = parser.add_subparsers(dest="command", required=True)

    p_add = sub.add_parser("add", help="append a new manual entry (2-column layer)")
    p_add.add_argument("english")
    p_add.add_argument("chinese")
    p_add.add_argument("--file", default="entries/common/ui.tsv", help="manifest path relative to dict/")
    p_add.set_defaults(func=cmd_add)

    p_lookup = sub.add_parser("lookup", help="show all layers for an exact/normalized key")
    p_lookup.add_argument("text")
    p_lookup.add_argument("--json", action="store_true")
    p_lookup.set_defaults(func=cmd_lookup)

    p_check = sub.add_parser("check", help="validate dictionary layout and rules")
    p_check.add_argument("--strict", action="store_true", help="treat warnings as errors")
    p_check.add_argument("--json", action="store_true")
    p_check.set_defaults(func=cmd_check)

    p_report = sub.add_parser("report", help="per-layer counts and validation summary")
    p_report.add_argument("--json", action="store_true")
    p_report.set_defaults(func=cmd_report)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except dictlib.DictError as exc:
        print(f"dict: INPUT ERROR {exc}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
