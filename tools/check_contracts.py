#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate AlecaFrame-ZH architecture contracts with only the standard library.

Checks:
  - schemas/*.json parse
  - pages.json against schemas/pages.schema.json
  - page id / officialWindow / file uniqueness
  - optional src/runtime/modules.json, src/ocr/manifest.json against their schemas
  - optional dict/manifest.tsv against schemas/dict-manifest.spec.md (basic row checks)

Exit codes: 0 ok, 1 contract violation, 2 input/read error.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMAS = ROOT / "schemas"


class ValidationError(Exception):
    pass


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ValidationError(f"missing file: {path.relative_to(ROOT)}")
    except json.JSONDecodeError as exc:
        raise ValidationError(f"invalid json: {path.relative_to(ROOT)}: {exc}")


def json_type_ok(value, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "null":
        return value is None
    return True


class Validator:
    def __init__(self, schema: dict):
        self.root_schema = schema
        self.errors: list[str] = []

    def error(self, path: str, message: str):
        self.errors.append(f"{path or '$'}: {message}")

    def resolve(self, ref: str) -> dict:
        if not ref.startswith("#/"):
            raise ValidationError(f"unsupported $ref: {ref}")
        node = self.root_schema
        for part in ref[2:].split("/"):
            part = part.replace("~1", "/").replace("~0", "~")
            node = node[part]
        return node

    def matches(self, instance, schema: dict) -> bool:
        """Small structural match for if/then; not a full validator."""
        if not isinstance(schema, dict):
            return True
        if "const" in schema and instance != schema["const"]:
            return False
        if "enum" in schema and instance not in schema["enum"]:
            return False
        if "type" in schema:
            types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
            if not any(json_type_ok(instance, t) for t in types):
                return False
        if isinstance(instance, dict):
            for key in schema.get("required", []):
                if key not in instance:
                    return False
            for key, sub in schema.get("properties", {}).items():
                if key in instance and not self.matches(instance[key], sub):
                    return False
        return True

    def validate(self, instance, schema: dict, path: str = ""):
        if "$ref" in schema:
            self.validate(instance, self.resolve(schema["$ref"]), path)
            return
        if "const" in schema and instance != schema["const"]:
            self.error(path, f"expected const {schema['const']!r}, got {instance!r}")
            return
        if "enum" in schema and instance not in schema["enum"]:
            self.error(path, f"expected one of {schema['enum']!r}, got {instance!r}")
            return
        if "type" in schema:
            types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
            if not any(json_type_ok(instance, t) for t in types):
                self.error(path, f"expected type {types!r}, got {type(instance).__name__}")
                return
        if isinstance(instance, dict):
            for key in schema.get("required", []):
                if key not in instance:
                    self.error(path, f"missing required key {key!r}")
            props = schema.get("properties", {})
            additional = schema.get("additionalProperties", True)
            for key, value in instance.items():
                child = f"{path}.{key}" if path else key
                if key in props:
                    self.validate(value, props[key], child)
                elif additional is False:
                    self.error(child, "additional property is not allowed")
            if "if" in schema and self.matches(instance, schema["if"]):
                if "then" in schema:
                    self.validate(instance, schema["then"], path)
        elif isinstance(instance, list):
            if "minItems" in schema and len(instance) < schema["minItems"]:
                self.error(path, f"expected at least {schema['minItems']} items")
            if "maxItems" in schema and len(instance) > schema["maxItems"]:
                self.error(path, f"expected at most {schema['maxItems']} items")
            if schema.get("uniqueItems"):
                keys = [json.dumps(item, ensure_ascii=False, sort_keys=True) for item in instance]
                if len(keys) != len(set(keys)):
                    self.error(path, "items are not unique")
            if "items" in schema:
                for index, item in enumerate(instance):
                    self.validate(item, schema["items"], f"{path}[{index}]")
        elif isinstance(instance, str):
            if "minLength" in schema and len(instance) < schema["minLength"]:
                self.error(path, f"expected minLength {schema['minLength']}")
            if "maxLength" in schema and len(instance) > schema["maxLength"]:
                self.error(path, f"expected maxLength {schema['maxLength']}")
            if "pattern" in schema and re.search(schema["pattern"], instance) is None:
                self.error(path, f"does not match pattern {schema['pattern']!r}")
        elif isinstance(instance, (int, float)) and not isinstance(instance, bool):
            if "minimum" in schema and instance < schema["minimum"]:
                self.error(path, f"expected >= {schema['minimum']}")
            if "maximum" in schema and instance > schema["maximum"]:
                self.error(path, f"expected <= {schema['maximum']}")


def check_pages() -> tuple[int, list[str]]:
    pages_path = ROOT / "pages.json"
    schema_path = SCHEMAS / "pages.schema.json"
    data = load_json(pages_path)
    schema = load_json(schema_path)
    validator = Validator(schema)
    validator.validate(data, schema)
    warnings: list[str] = []

    if validator.errors:
        return 0, validator.errors

    pages = data["pages"]
    for key in ("id", "officialWindow", "file"):
        seen: dict[str, int] = {}
        for index, page in enumerate(pages):
            value = page[key]
            if value in seen:
                validator.error(f"pages[{index}].{key}", f"duplicate value {value!r} (first at index {seen[value]})")
            else:
                seen[value] = index

    ids = {page["id"] for page in pages}
    for index, page in enumerate(pages):
        if page["inject"] and not page["features"]:
            warnings.append(f"pages[{index}] ({page['id']}): inject=true but features is empty")
        for script in page["ocrScripts"]:
            if not page["inject"]:
                validator.error(f"pages[{index}].ocrScripts", f"{script}: page is not injected")
        if page["inject"] and page["id"] not in ids:
            validator.error(f"pages[{index}]", "unreachable page id")
        if not page["inject"] and not page.get("reason"):
            validator.error(f"pages[{index}]", "inject=false without reason")

    bundle = data["bundle"]
    if not (ROOT / bundle["source"]).exists():
        warnings.append(f"bundle source does not exist yet (generated?): {bundle['source']}")

    return len(pages), validator.errors + [f"WARN {w}" for w in warnings]


def check_optional(name: str, instance_path: Path, schema_path: Path) -> list[str]:
    if not instance_path.exists():
        return [f"INFO {name}: planned (missing {instance_path.relative_to(ROOT)})"]
    data = load_json(instance_path)
    schema = load_json(schema_path)
    validator = Validator(schema)
    validator.validate(data, schema)
    if validator.errors:
        return validator.errors
    return []


def check_schemas() -> list[str]:
    errors: list[str] = []
    for path in sorted(SCHEMAS.glob("*.json")):
        try:
            load_json(path)
        except ValidationError as exc:
            errors.append(str(exc))
    return errors


def check_dict_manifest() -> list[str]:
    path = ROOT / "dict" / "manifest.tsv"
    if not path.exists():
        return ["INFO dict-manifest: planned (missing dict/manifest.tsv)"]
    errors: list[str] = []
    orders: set[int] = set()
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 5:
            errors.append(f"dict/manifest.tsv:{line_number}: expected at least 5 columns")
            continue
        try:
            order = int(parts[0])
        except ValueError:
            errors.append(f"dict/manifest.tsv:{line_number}: order is not an integer")
            continue
        if order in orders:
            errors.append(f"dict/manifest.tsv:{line_number}: duplicate order {order}")
        orders.add(order)
    return errors


def main() -> int:
    all_errors: list[str] = []
    infos: list[str] = []

    all_errors.extend(check_schemas())
    page_count, page_errors = check_pages()
    all_errors.extend(page_errors)

    all_errors.extend(check_optional("modules", ROOT / "src/runtime/modules.json", SCHEMAS / "modules.schema.json"))
    all_errors.extend(check_optional("ocr", ROOT / "src/ocr/manifest.json", SCHEMAS / "ocr-manifest.schema.json"))
    all_errors.extend(check_dict_manifest())

    infos = [e for e in all_errors if e.startswith(("INFO ", "WARN "))]
    errors = [e for e in all_errors if not e.startswith(("INFO ", "WARN "))]

    for item in infos:
        print(item)
    for item in errors:
        print(f"ERROR {item}")

    if errors:
        print(f"contracts: FAIL ({len(errors)} error(s))")
        return 1
    print(f"contracts: OK (pages={page_count})")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ValidationError as exc:
        print(f"contracts: INPUT ERROR {exc}")
        sys.exit(2)
