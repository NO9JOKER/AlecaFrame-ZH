#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CLI for the new dictionary layout.

Commands:
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


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="AlecaFrame-ZH dictionary tool")
    parser.add_argument("--root", default=str(dictlib.ROOT), help="repository root")
    sub = parser.add_subparsers(dest="command", required=True)

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
