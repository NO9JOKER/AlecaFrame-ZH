#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Golden build manifest: snapshot/verify the data and composition surface.

Covers:
  - dictionary artifact hash/counts from build/reports/dict-build.json
  - bundle hash from the same report
  - page registry ids/files/inject/features from pages.json
  - runtime module ids from src/runtime/modules.json
  - OCR deploy names/page mapping from src/ocr/manifest.json

Usage:
    python tools/golden.py verify
    python tools/golden.py snapshot
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLDEN = ROOT / "tests" / "golden" / "build.json"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def collect() -> dict:
    report = load(ROOT / "build" / "reports" / "dict-build.json")
    pages = load(ROOT / "pages.json")
    modules = load(ROOT / "src" / "runtime" / "modules.json")
    ocr = load(ROOT / "src" / "ocr" / "manifest.json")
    return {
        "schemaVersion": 1,
        "dictionary": {
            "sha256": report["dictionary"]["sha256"],
            "bytes": report["dictionary"]["bytes"],
            "entries": report["counts"]["entries"],
        },
        "bundle": {
            "sha256": report.get("bundle", {}).get("sha256"),
            "bytes": report.get("bundle", {}).get("bytes"),
        },
        "pages": [
            {
                "id": page["id"],
                "file": page["file"],
                "inject": bool(page["inject"]),
                "features": page.get("features", []),
            }
            for page in pages["pages"]
        ],
        "modules": [module["id"] for module in modules["modules"]],
        "ocr": [
            {
                "deployName": script["deployName"],
                "pages": script["pages"],
            }
            for script in ocr["pageScripts"]
        ],
    }


def diff(expected: dict, actual: dict) -> list[str]:
    problems: list[str] = []
    if expected.get("schemaVersion") != actual.get("schemaVersion"):
        problems.append("schemaVersion")
    for key in ("dictionary", "bundle"):
        if expected.get(key) != actual.get(key):
            problems.append(key)
    for key in ("pages", "modules", "ocr"):
        if expected.get(key) != actual.get(key):
            problems.append(key)
    return problems


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Golden build manifest")
    parser.add_argument("action", choices=["verify", "snapshot"])
    parser.add_argument("--allow-missing-bundle", action="store_true", help="ignore bundle hash absence")
    args = parser.parse_args(argv)

    actual = collect()
    if args.allow_missing_bundle:
        actual["bundle"] = {"sha256": None, "bytes": None}
        if GOLDEN.is_file():
            expected = load(GOLDEN)
            expected["bundle"] = {"sha256": None, "bytes": None}
    if args.action == "snapshot":
        GOLDEN.parent.mkdir(parents=True, exist_ok=True)
        GOLDEN.write_text(json.dumps(actual, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(f"golden: wrote {GOLDEN.relative_to(ROOT)}")
        return 0

    if not GOLDEN.is_file():
        print(f"golden: missing {GOLDEN.relative_to(ROOT)}; run python tools/golden.py snapshot")
        return 2
    expected = load(GOLDEN)
    if args.allow_missing_bundle:
        expected["bundle"] = {"sha256": None, "bytes": None}
    problems = diff(expected, actual)
    if problems:
        for key in problems:
            print(f"golden: mismatch {key}")
        return 1
    print("golden: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
