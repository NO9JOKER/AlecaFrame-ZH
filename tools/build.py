#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dictionary build for the new architecture.

W1 scope: read dict/manifest.tsv, load/merge/validate, write deterministic
dictionary artifacts and a build report. Runtime bundle assembly is added in
the runtime workstream (modules.json); this script intentionally does not write
bin/alecaframe-zh-cn.js yet.

Usage:
    python tools/build.py
    python tools/build.py --check-only
    python tools/build.py --out-dir build
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dictlib  # noqa: E402


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, indent=2, sort_keys=False) + "\n"
    path.write_text(text, encoding="utf-8", newline="\n")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Build the AlecaFrame-ZH dictionary")
    parser.add_argument("--root", default=str(dictlib.ROOT))
    parser.add_argument("--out-dir", default="build", help="output directory (repo-relative)")
    parser.add_argument("--check-only", action="store_true", help="validate only; write nothing")
    args = parser.parse_args(argv)

    root = Path(args.root)
    try:
        tree = dictlib.load_tree(root)
        result = dictlib.check(root)
    except dictlib.DictError as exc:
        print(f"build: INPUT ERROR {exc}")
        return 2

    counts = {
        "layers": result.layers,
        "entries": result.entries,
        "overrides": result.overrides,
        "policy": result.policy,
        "index": result.index,
    }
    for warning in result.warnings:
        print(f"WARN {warning}")
    for error in result.errors:
        print(f"ERROR {error}")
    if result.errors:
        print("build: FAIL (dictionary validation)")
        return 1
    if args.check_only:
        print(f"build: OK (check-only) {counts}")
        return 0

    out_dir = (root / args.out_dir).resolve()
    merged = {entry.key: entry.value for entry in tree.merged.values()}
    relics = {entry.key: entry.value for entry in tree.index}
    dictionary_path = out_dir / "generated" / "dictionary.json"
    relic_path = out_dir / "generated" / "relic-rewards.json"
    report_path = out_dir / "reports" / "dict-build.json"

    write_json(dictionary_path, merged)
    write_json(relic_path, relics)

    merged_text = dictionary_path.read_text(encoding="utf-8")
    report = {
        "schemaVersion": 1,
        "counts": counts,
        "dictionary": {
            "path": str(dictionary_path.relative_to(root)).replace("\\", "/"),
            "sha256": hashlib.sha256(merged_text.encode("utf-8")).hexdigest(),
            "bytes": len(merged_text.encode("utf-8")),
        },
        "relicRewards": {
            "path": str(relic_path.relative_to(root)).replace("\\", "/"),
            "entries": len(relics),
        },
        "layers": [
            {
                "order": layer.order,
                "path": layer.path,
                "kind": layer.kind,
                "scope": layer.scope,
                "entries": len(tree.entries_by_order[layer.order]),
            }
            for layer in tree.layers
        ],
        "warnings": list(result.warnings),
        "errors": list(result.errors),
    }
    write_json(report_path, report)
    print(f"build: OK {counts}")
    print(f"wrote {dictionary_path.relative_to(root)} ({report['dictionary']['bytes']} bytes)")
    print(f"wrote {relic_path.relative_to(root)} ({len(relics)} entries)")
    print(f"wrote {report_path.relative_to(root)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
