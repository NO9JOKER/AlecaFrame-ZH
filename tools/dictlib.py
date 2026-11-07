#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dictionary manifest/loader/check core for AlecaFrame-ZH.

Design goals:
  - manifest.tsv is the only load order (no glob)
  - exact one-authority-per-key semantics
  - overrides.tsv is the only layer allowed to change an existing value
  - keep-english.tsv is a policy layer, not a dictionary layer
  - generated layers are script artifacts and must not be hand-edited

The module is standard-library only so it can run in CI and on a bare machine.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DICT_DIR = "dict"
MANIFEST = "dict/manifest.tsv"

KINDS = {"generated", "upstream", "manual", "override", "policy", "index"}
SCHEMA_COLUMNS = {2: 2, 3: 3, 5: 5}
INVISIBLE = re.compile(r"[\u200B-\u200D\u2060\uFEFF\u00A0]")
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
ASCII_LETTER = re.compile(r"[A-Za-z]")
CJK = re.compile(r"[\u3400-\u9fff]")


class DictError(Exception):
    """Fatal input/config error (exit code 2 at CLI level)."""


@dataclass(frozen=True)
class Layer:
    order: int
    path: str
    kind: str
    scope: str
    schema: int
    note: str
    manifest_line: int


@dataclass(frozen=True)
class Entry:
    key: str
    value: str
    layer: Layer
    line: int
    row: tuple[str, ...]


@dataclass(frozen=True)
class CheckResult:
    layers: int
    entries: int
    overrides: int
    policy: int
    index: int
    errors: tuple[str, ...] = field(default_factory=tuple)
    warnings: tuple[str, ...] = field(default_factory=tuple)

    def ok(self, strict: bool = False) -> bool:
        return not self.errors and not (strict and self.warnings)


def norm_key(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _read_text(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise DictError(f"missing file: {path}")
    except UnicodeDecodeError as exc:
        raise DictError(f"{path}: not UTF-8: {exc}")
    if text.startswith("\ufeff"):
        raise DictError(f"{path}: UTF-8 BOM is not allowed")
    return text


def _validate_field(path: Path, line: int, field_name: str, value: str):
    if not isinstance(value, str):
        raise DictError(f"{path}:{line}: {field_name} is not a string")
    if value != value.strip():
        raise DictError(f"{path}:{line}: {field_name} has leading/trailing whitespace")
    if CONTROL.search(value) or INVISIBLE.search(value):
        raise DictError(f"{path}:{line}: {field_name} contains control/invisible characters")
    if "\t" in value or "\n" in value or "\r" in value:
        raise DictError(f"{path}:{line}: {field_name} contains tab/newline")


def read_manifest(root: Path = ROOT) -> list[Layer]:
    path = root / MANIFEST
    text = _read_text(path)
    layers: list[Layer] = []
    seen_orders: dict[int, int] = {}
    seen_paths: set[str] = set()
    for line_number, raw in enumerate(text.splitlines(), 1):
        if not raw.strip() or raw.startswith("#"):
            continue
        parts = raw.split("\t")
        if len(parts) < 5:
            raise DictError(f"{path}:{line_number}: expected at least 5 columns")
        if len(parts) > 6:
            raise DictError(f"{path}:{line_number}: too many columns")
        order_text, rel_path, kind, scope, schema_text = parts[:5]
        note = parts[5] if len(parts) == 6 else ""
        try:
            order = int(order_text)
            schema = int(schema_text)
        except ValueError:
            raise DictError(f"{path}:{line_number}: order/schema must be integers")
        if order < 0:
            raise DictError(f"{path}:{line_number}: order must be >= 0")
        if order in seen_orders:
            raise DictError(f"{path}:{line_number}: duplicate order {order} (first at line {seen_orders[order]})")
        seen_orders[order] = line_number
        if kind not in KINDS:
            raise DictError(f"{path}:{line_number}: unknown kind {kind!r}")
        if schema not in SCHEMA_COLUMNS:
            raise DictError(f"{path}:{line_number}: schema must be 2, 3 or 5")
        if not rel_path or Path(rel_path).is_absolute() or ".." in Path(rel_path).parts:
            raise DictError(f"{path}:{line_number}: path must be relative and stay inside repo")
        if rel_path in seen_paths:
            raise DictError(f"{path}:{line_number}: duplicate path {rel_path}")
        seen_paths.add(rel_path)
        if not (scope == "-" or scope in {"global", "shared"} or (scope.startswith("screen:") and len(scope) > 7)):
            raise DictError(f"{path}:{line_number}: invalid scope {scope!r}")
        if kind == "policy" and schema != 3:
            raise DictError(f"{path}:{line_number}: policy layer must use schema=3")
        if kind in {"override"} and schema != 5:
            raise DictError(f"{path}:{line_number}: override layer must use schema=5")
        _validate_field(path, line_number, "note", note)
        layers.append(Layer(order, rel_path, kind, scope, schema, note, line_number))
    if not layers:
        raise DictError(f"{path}: manifest is empty")
    layers.sort(key=lambda item: item.order)
    return layers


def load_layer(root: Path, layer: Layer) -> list[Entry]:
    # manifest paths are relative to dict/, not the repository root
    path = root / DICT_DIR / layer.path
    text = _read_text(path)
    rows: list[tuple[int, tuple[str, ...]]] = []
    if path.suffix.lower() == ".json":
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise DictError(f"{path}: invalid json: {exc}")
        if not isinstance(data, dict):
            raise DictError(f"{path}: json layer must be an object")
        for key, value in data.items():
            if not isinstance(value, str):
                raise DictError(f"{path}: json values must be strings")
            rows.append((0, (str(key), value)))
    else:
        for line_number, raw in enumerate(text.splitlines(), 1):
            if not raw.strip() or raw.startswith("#"):
                continue
            parts = tuple(raw.split("\t"))
            if len(parts) != layer.schema:
                raise DictError(f"{path}:{line_number}: expected {layer.schema} columns, got {len(parts)}")
            rows.append((line_number, parts))

    entries: list[Entry] = []
    seen: set[str] = set()
    for line_number, row in rows:
        key, value = row[0], row[1]
        _validate_field(path, line_number, "key", key)
        _validate_field(path, line_number, "value", value)
        for index in range(2, len(row)):
            _validate_field(path, line_number, f"column[{index}]", row[index])
        if not key:
            raise DictError(f"{path}:{line_number}: empty key")
        if not ASCII_LETTER.search(key):
            raise DictError(f"{path}:{line_number}: key must contain an ASCII letter")
        if not value:
            raise DictError(f"{path}:{line_number}: empty value")
        if key in seen:
            raise DictError(f"{path}:{line_number}: duplicate key in same file: {key!r}")
        seen.add(key)
        entries.append(Entry(key, value, layer, line_number, row))
    return entries


@dataclass
class Tree:
    layers: list[Layer]
    entries_by_order: dict[int, list[Entry]]
    merged: dict[str, Entry]
    norm_map: dict[str, Entry]
    policy: list[Entry]
    index: list[Entry]
    errors: list[str]


def load_tree(root: Path = ROOT) -> Tree:
    layers = read_manifest(root)
    entries_by_order: dict[int, list[Entry]] = {}
    errors: list[str] = []
    for layer in layers:
        entries_by_order[layer.order] = load_layer(root, layer)

    merged: dict[str, Entry] = {}
    norm_map: dict[str, Entry] = {}
    policy: list[Entry] = []
    index: list[Entry] = []

    for layer in layers:
        entries = entries_by_order[layer.order]
        if layer.kind == "policy":
            policy.extend(entries)
            continue
        if layer.kind == "index":
            index.extend(entries)
            continue
        for entry in entries:
            normalized = norm_key(entry.key)
            if normalized in norm_map and norm_map[normalized].key != entry.key:
                errors.append(
                    f"normalized key collision: {entry.key!r} <-> {norm_map[normalized].key!r} "
                    f"({layer.path}:{entry.line})"
                )
            previous = merged.get(entry.key)
            if previous is not None:
                if previous.value == entry.value:
                    errors.append(
                        f"same-value redefinition: {entry.key!r} ({previous.layer.path}:{previous.line}, "
                        f"{layer.path}:{entry.line})"
                    )
                elif layer.kind != "override":
                    errors.append(
                        f"shadow without override: {entry.key!r} ({previous.layer.path}:{previous.line}, "
                        f"{layer.path}:{entry.line})"
                    )
            elif layer.kind == "override":
                errors.append(
                    f"override key is not defined in a lower layer: {entry.key!r} ({layer.path}:{entry.line})"
                )
            merged[entry.key] = entry
            norm_map[normalized] = entry

    return Tree(layers, entries_by_order, merged, norm_map, policy, index, errors)


def check(root: Path = ROOT, strict: bool = False) -> CheckResult:
    tree = load_tree(root)
    errors = list(tree.errors)
    warnings: list[str] = []
    override_count = 0
    for layer in tree.layers:
        for entry in tree.entries_by_order[layer.order]:
            if layer.kind == "override":
                override_count += 1
                if len(entry.row) != 5:
                    errors.append(f"{layer.path}:{entry.line}: override must have 5 columns")
                    continue
                scope, reason, source = entry.row[2], entry.row[3], entry.row[4]
                if not scope.strip():
                    errors.append(f"{layer.path}:{entry.line}: override missing scope")
                if len(reason.strip()) < 8:
                    errors.append(f"{layer.path}:{entry.line}: override reason must be >= 8 chars")
                if not source.strip():
                    errors.append(f"{layer.path}:{entry.line}: override missing source")
            if layer.kind == "policy":
                if len(entry.row) != 3:
                    errors.append(f"{layer.path}:{entry.line}: policy must have 3 columns")
                    continue
                reason, evidence = entry.row[1], entry.row[2]
                if not reason.strip():
                    errors.append(f"{layer.path}:{entry.line}: keep-english missing reason")
                if not evidence.strip():
                    errors.append(f"{layer.path}:{entry.line}: keep-english missing evidence")

    policy_keys = {entry.key for entry in tree.policy}
    for entry in tree.merged.values():
        if entry.key in policy_keys:
            errors.append(f"key is both translated and keep-english: {entry.key!r} ({entry.layer.path}:{entry.line})")
        if not CJK.search(entry.value):
            if entry.key not in policy_keys:
                warnings.append(f"value has no CJK: {entry.key!r} -> {entry.value!r} ({entry.layer.path}:{entry.line})")

    lower: dict[str, Entry] = {}
    for entry in tree.merged.values():
        key = entry.key.lower()
        previous = lower.get(key)
        if previous is not None and previous.key != entry.key:
            if previous.value == entry.value:
                warnings.append(f"case-only duplicate (same value): {previous.key!r} / {entry.key!r}")
            else:
                errors.append(f"case-only duplicate (different value): {previous.key!r} / {entry.key!r}")
        else:
            lower[key] = entry

    if strict:
        errors.extend(warnings)
        warnings = []

    return CheckResult(
        layers=len(tree.layers),
        entries=len(tree.merged),
        overrides=override_count,
        policy=len(tree.policy),
        index=len(tree.index),
        errors=tuple(errors),
        warnings=tuple(warnings),
    )


def lookup(root: Path, text: str) -> dict:
    tree = load_tree(root)
    query = norm_key(text)
    matches = []
    for layer in tree.layers:
        for entry in tree.entries_by_order[layer.order]:
            if entry.key == text or norm_key(entry.key) == query:
                matches.append(entry)
    effective = tree.merged.get(text)
    if effective is None:
        effective = tree.norm_map.get(query)
    return {
        "query": text,
        "matches": [
            {
                "key": entry.key,
                "value": entry.value,
                "layer": entry.layer.path,
                "kind": entry.layer.kind,
                "line": entry.line,
            }
            for entry in matches
        ],
        "effective": None if effective is None else {
            "key": effective.key,
            "value": effective.value,
            "layer": effective.layer.path,
            "kind": effective.layer.kind,
            "line": effective.line,
        },
        "errors": tree.errors,
    }


def report(root: Path) -> dict:
    result = check(root)
    tree = load_tree(root)
    return {
        "layers": [
            {
                "order": layer.order,
                "path": layer.path,
                "kind": layer.kind,
                "scope": layer.scope,
                "schema": layer.schema,
                "entries": len(tree.entries_by_order[layer.order]),
            }
            for layer in tree.layers
        ],
        "counts": {
            "entries": result.entries,
            "overrides": result.overrides,
            "policy": result.policy,
            "index": result.index,
        },
        "errors": list(result.errors),
        "warnings": list(result.warnings),
    }
