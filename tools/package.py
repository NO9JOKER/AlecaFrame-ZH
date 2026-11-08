#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Assemble a self-contained package under dist/.

The package keeps the launcher and bundle at the same relative paths the .cmd
wrappers expect:

  <pkg>/启动-中文补丁.cmd ...
  <pkg>/pages.json
  <pkg>/bin/AlecaFrame-ZH.ps1
  <pkg>/bin/lib/*.ps1
  <pkg>/bin/alecaframe-zh-cn.js
  <pkg>/bin/ocr/*

This is a development/test package, not the release tag. Run tools/build.py
first so the bundle exists.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent



def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_file(src: Path, dst: Path) -> None:
    if not src.is_file():
        raise FileNotFoundError(str(src))
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def copy_tree(src: Path, dst: Path) -> None:
    if not src.is_dir():
        raise FileNotFoundError(str(src))
    for path in src.rglob("*"):
        if path.is_file():
            copy_file(path, dst / path.relative_to(src))


def ensure_ps_bom(path: Path) -> None:
    """PowerShell 5.1 reads BOM-less UTF-8 as ANSI; enforce BOM for scripts."""
    if path.suffix.lower() not in {".ps1", ".psm1"}:
        return
    data = path.read_bytes()
    if data.startswith(b"\xef\xbb\xbf"):
        return
    path.write_bytes(b"\xef\xbb\xbf" + data)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Build a test package under dist/")
    parser.add_argument("--version", default=(ROOT / "VERSION").read_text(encoding="utf-8").strip())
    parser.add_argument("--name", default=None, help="package directory name")
    parser.add_argument("--out", default="dist")
    parser.add_argument("--zip", action="store_true", help="also create <name>.zip next to the package")
    args = parser.parse_args(argv)

    bundle = ROOT / "bin" / "alecaframe-zh-cn.js"
    if not bundle.is_file():
        print("package: missing bin/alecaframe-zh-cn.js; run python tools/build.py first", file=sys.stderr)
        return 2
    pages = ROOT / "pages.json"
    if not pages.is_file():
        print("package: missing pages.json", file=sys.stderr)
        return 2
    instructions = ROOT / "使用说明.txt"
    if not instructions.is_file():
        print("package: missing 使用说明.txt", file=sys.stderr)
        return 2

    name = args.name or f"AlecaFrame-ZH-{args.version}"
    target = (ROOT / args.out / name).resolve()
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)

    for cmd in ROOT.glob("*.cmd"):
        copy_file(cmd, target / cmd.name)
    for name_file in ("VERSION", "LICENSE", "NOTICE.md", "pages.json"):
        path = ROOT / name_file
        if path.is_file():
            copy_file(path, target / name_file)

    launcher_src = ROOT / "src" / "launcher"
    copy_file(launcher_src / "AlecaFrame-ZH.ps1", target / "bin" / "AlecaFrame-ZH.ps1")
    copy_tree(launcher_src / "lib", target / "bin" / "lib")
    copy_file(bundle, target / "bin" / "alecaframe-zh-cn.js")
    copy_tree(ROOT / "bin" / "ocr", target / "bin" / "ocr")
    copy_tree(ROOT / "scripts", target / "scripts")
    for path in target.rglob("*"):
        if path.is_file():
            ensure_ps_bom(path)
    copy_file(instructions, target / "使用说明.txt")

    info = {
        "schemaVersion": 1,
        "package": "development-test",
        "version": args.version,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "bundle": {
            "path": "bin/alecaframe-zh-cn.js",
            "sha256": sha256(target / "bin" / "alecaframe-zh-cn.js"),
            "bytes": (target / "bin" / "alecaframe-zh-cn.js").stat().st_size,
        },
        "launcher": "bin/AlecaFrame-ZH.ps1",
        "pages": "pages.json",
        "note": "使用说明见 使用说明.txt",
    }
    (target / "PACKAGE-INFO.json").write_text(
        json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"package: OK {target}")
    print(f"bundle sha256: {info['bundle']['sha256']}")
    if args.zip:
        archive = target.parent / (target.name + ".zip")
        if archive.exists():
            archive.unlink()
        shutil.make_archive(str(target.parent / target.name), "zip", root_dir=target.parent, base_dir=target.name)
        print(f"zip: OK {archive}")
    print(f"start: {target / '版本信息.cmd'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
