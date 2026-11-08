#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build dictionary artifacts and the injected runtime bundle.

Reads dict/manifest.tsv and src/runtime/modules.json, validates, then writes:
  build/generated/dictionary.json
  build/generated/relic-rewards.json
  build/reports/dict-build.json
  bin/alecaframe-zh-cn.js       (runtime bundle)
  bin/ocr/afzh-items.js         (OCR dictionary artifact)

The public site/launcher still consumes the same bin/ paths; bundle assembly is
driven by modules.json once features/launcher work is complete.
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


def load_modules(root: Path) -> list[dict]:
    path = root / "src" / "runtime" / "modules.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise dictlib.DictError(f"missing modules manifest: {path.relative_to(root)}")
    except json.JSONDecodeError as exc:
        raise dictlib.DictError(f"invalid modules manifest: {exc}")
    modules = data.get("modules")
    if not isinstance(modules, list) or not modules:
        raise dictlib.DictError("modules.json: modules must be a non-empty list")
    seen: set[str] = set()
    for module in modules:
        module_id = module.get("id")
        if module_id in seen:
            raise dictlib.DictError(f"modules.json: duplicate id {module_id}")
        seen.add(str(module_id))
        deps = module.get("deps") or []
        for dep in deps:
            if dep not in seen:
                raise dictlib.DictError(f"modules.json: {module_id} depends on {dep} before it is loaded")
    return modules


def load_pages(root: Path) -> list[dict]:
    path = root / "pages.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise dictlib.DictError("missing pages.json")
    except json.JSONDecodeError as exc:
        raise dictlib.DictError(f"invalid pages.json: {exc}")
    pages = data.get("pages")
    if not isinstance(pages, list) or not pages:
        raise dictlib.DictError("pages.json: pages must be a non-empty list")
    return pages


def load_ocr_manifest(root: Path) -> dict:
    path = root / "src" / "ocr" / "manifest.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise dictlib.DictError("missing src/ocr/manifest.json")
    except json.JSONDecodeError as exc:
        raise dictlib.DictError(f"invalid OCR manifest: {exc}")
    if data.get("schemaVersion") != 1:
        raise dictlib.DictError("src/ocr/manifest.json: schemaVersion must be 1")
    if not isinstance(data.get("pageScripts"), list):
        raise dictlib.DictError("src/ocr/manifest.json: pageScripts must be a list")
    return data


def validate_ocr_manifest(manifest: dict, pages: list[dict]) -> None:
    page_files = {str(page.get("file")) for page in pages}
    deploy_names: set[str] = set()
    for script in manifest["pageScripts"]:
        deploy = str(script.get("deployName"))
        if deploy in deploy_names:
            raise dictlib.DictError(f"OCR manifest: duplicate deployName {deploy}")
        deploy_names.add(deploy)
        for page in script.get("pages") or []:
            if str(page) not in page_files:
                raise dictlib.DictError(f"OCR manifest: page not in pages.json: {page}")


def sync_ocr(root: Path, manifest: dict) -> dict:
    """Copy OCR sources into bin/ocr with their frozen flat deploy names."""
    ocr_dir = root / "src" / "ocr"
    runtime_dir = root / manifest["runtimeDir"]
    runtime_dir.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    for script in manifest["pageScripts"]:
        source = ocr_dir / script["source"]
        if not source.is_file():
            raise dictlib.DictError(f"OCR page script missing: src/ocr/{script['source']}")
        deploy = runtime_dir / script["deployName"]
        deploy.write_bytes(source.read_bytes())
        copied.append(script["deployName"])
    for folder in ("server", "worker"):
        source_dir = ocr_dir / folder
        if not source_dir.is_dir():
            continue
        for source in sorted(source_dir.iterdir()):
            if source.is_file():
                (runtime_dir / source.name).write_bytes(source.read_bytes())
    (runtime_dir / "manifest.json").write_bytes((ocr_dir / "manifest.json").read_bytes())
    return {"pageScripts": len(copied), "serverPort": manifest["server"]["port"], "files": copied}



def assemble(root: Path, modules: list[dict], pages: list[dict], dictionary: dict, relics: dict) -> tuple[Path, Path, str]:
    chunks = [
        "/* generated by tools/build.py; do not edit */",
        "window.__AFCN_DICT__ = " + json.dumps(dictionary, ensure_ascii=False, separators=(",", ":")) + ";",
        "window.__AFCN_RELIC_REWARDS__ = " + json.dumps(relics, ensure_ascii=False, separators=(",", ":")) + ";",
        "window.__AFCN_PAGES__ = " + json.dumps(pages, ensure_ascii=False, separators=(",", ":")) + ";",
        "window.__ALECAFRAME_ZH_CN_ITEMS__ = window.__AFCN_DICT__;",
    ]
    for module in modules:
        relative = Path("src") / "runtime" / module["file"]
        path = root / relative
        if not path.is_file():
            raise dictlib.DictError(f"modules.json: missing module file {relative.as_posix()}")
        chunks.append(f"\n/* module: {module['id']} ({relative.as_posix()}) */\n")
        chunks.append(path.read_text(encoding="utf-8"))
    bundle_text = "\n".join(chunks) + "\n"
    bundle = root / "bin" / "alecaframe-zh-cn.js"
    bundle.parent.mkdir(parents=True, exist_ok=True)
    bundle.write_text(bundle_text, encoding="utf-8", newline="\n")

    ocr = root / "bin" / "ocr" / "afzh-items.js"
    ocr.parent.mkdir(parents=True, exist_ok=True)
    ocr.write_text(
        "/* generated by tools/build.py; do not edit */\n"
        "window.__ALECAFRAME_ZH_CN_ITEMS__ = "
        + json.dumps(dictionary, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
        newline="\n",
    )
    digest = hashlib.sha256(bundle_text.encode("utf-8")).hexdigest()
    return bundle, ocr, digest


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Build the AlecaFrame-ZH dictionary and runtime bundle")
    parser.add_argument("--root", default=str(dictlib.ROOT))
    parser.add_argument("--out-dir", default="build", help="output directory (repo-relative)")
    parser.add_argument("--check-only", action="store_true", help="validate only; write nothing")
    parser.add_argument("--no-bundle", action="store_true", help="write dictionary artifacts only")
    args = parser.parse_args(argv)

    root = Path(args.root)
    try:
        tree = dictlib.load_tree(root)
        result = dictlib.check(root, strict=True)
        modules = load_modules(root)
        pages = load_pages(root)
        ocr_manifest = load_ocr_manifest(root)
        validate_ocr_manifest(ocr_manifest, pages)
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

    if not args.no_bundle:
        try:
            ocr = sync_ocr(root, ocr_manifest)
            bundle, ocr_items, digest = assemble(root, modules, pages, merged, relics)
        except dictlib.DictError as exc:
            print(f"build: INPUT ERROR {exc}")
            return 2
        report["ocr"] = ocr
        report["bundle"] = {
            "path": str(bundle.relative_to(root)).replace("\\", "/"),
            "sha256": digest,
            "bytes": bundle.stat().st_size,
            "modules": [module["id"] for module in modules],
            "pages": len(pages),
        }
        report["ocrBundle"] = {"path": str(ocr_items.relative_to(root)).replace("\\", "/")}
        print(f"wrote {bundle.relative_to(root)} ({bundle.stat().st_size} bytes)")
        print(f"wrote {ocr_items.relative_to(root)}")

    write_json(report_path, report)
    print(f"build: OK {counts}")
    print(f"wrote {dictionary_path.relative_to(root)} ({report['dictionary']['bytes']} bytes)")
    print(f"wrote {relic_path.relative_to(root)} ({len(relics)} entries)")
    print(f"wrote {report_path.relative_to(root)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
