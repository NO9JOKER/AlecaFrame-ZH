#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Unit tests for tools/dictlib.py (standard library only, no temp files)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tools import dictlib  # noqa: E402


MANIFEST = """\
0\tgenerated/items.tsv\tgenerated\tglobal\t2\tgenerated items
10\tentries/common/ui.tsv\tmanual\tshared\t2\tcommon UI
20\toverrides.tsv\toverride\tglobal\t5\toverride layer
30\tkeep-english.tsv\tpolicy\t-\t3\tkeep english policy
"""


class DictFixture:
    """In-memory dict tree; patches dictlib._read_text only."""

    def __init__(self):
        self.root = Path("memory-repo")
        self.files = {
            "dict/manifest.tsv": MANIFEST,
            "dict/generated/items.tsv": "Alpha\t阿尔法\n",
            "dict/entries/common/ui.tsv": "Beta\t贝塔\n",
            "dict/overrides.tsv": "Alpha\t阿尔法改\tglobal\treason-long-enough\tsource:test\n",
            "dict/keep-english.tsv": "Gamma\tbrand\tbrand-reference\n",
        }
        self.patcher = patch("tools.dictlib._read_text", side_effect=self.read_text)
        self.patcher.start()

    def read_text(self, path: Path) -> str:
        rel = path.relative_to(self.root).as_posix()
        if rel not in self.files:
            raise dictlib.DictError(f"missing file: {rel}")
        return self.files[rel]

    def write(self, rel: str, text: str):
        self.files[rel] = text

    def cleanup(self):
        self.patcher.stop()


class DictlibTests(unittest.TestCase):
    def setUp(self):
        self.fx = DictFixture()

    def tearDown(self):
        self.fx.cleanup()

    def test_valid_tree_passes(self):
        result = dictlib.check(self.fx.root)
        self.assertTrue(result.ok(), result.errors)
        self.assertEqual(result.layers, 4)
        self.assertEqual(result.entries, 2)
        self.assertEqual(result.overrides, 1)
        self.assertEqual(result.policy, 1)

    def test_lookup_returns_effective_override(self):
        result = dictlib.lookup(self.fx.root, "Alpha")
        self.assertEqual(result["effective"]["value"], "阿尔法改")
        self.assertEqual([m["kind"] for m in result["matches"]], ["generated", "override"])

    def test_lookup_normalizes_whitespace(self):
        result = dictlib.lookup(self.fx.root, "  Alpha  ")
        self.assertEqual(result["effective"]["value"], "阿尔法改")

    def test_shadow_without_override_is_error(self):
        self.fx.write("dict/entries/common/ui.tsv", "Alpha\t另一个\n")
        result = dictlib.check(self.fx.root)
        self.assertFalse(result.ok())
        self.assertTrue(any("shadow without override" in e for e in result.errors))

    def test_same_value_redefinition_is_error(self):
        self.fx.write("dict/entries/common/ui.tsv", "Alpha\t阿尔法\n")
        result = dictlib.check(self.fx.root)
        self.assertFalse(result.ok())
        self.assertTrue(any("same-value redefinition" in e for e in result.errors))

    def test_override_requires_long_reason_and_source(self):
        self.fx.write("dict/overrides.tsv", "Alpha\t新值\tglobal\tshort\tsource:test\n")
        result = dictlib.check(self.fx.root)
        self.assertFalse(result.ok())
        self.assertTrue(any("reason must be >= 8" in e for e in result.errors))

    def test_override_without_lower_key_is_error(self):
        self.fx.write("dict/overrides.tsv", "Missing\t值\tglobal\treason-long-enough\tsource:test\n")
        result = dictlib.check(self.fx.root)
        self.assertFalse(result.ok())
        self.assertTrue(any("not defined in a lower layer" in e for e in result.errors))

    def test_keep_english_conflict_is_error(self):
        self.fx.write("dict/keep-english.tsv", "Alpha\tbrand\tbrand-reference\n")
        result = dictlib.check(self.fx.root)
        self.assertFalse(result.ok())
        self.assertTrue(any("both translated and keep-english" in e for e in result.errors))

    def test_case_only_variants_are_allowed(self):
        self.fx.write("dict/entries/common/ui.tsv", "ALPHA\t另一个\n")
        normal = dictlib.check(self.fx.root)
        strict = dictlib.check(self.fx.root, strict=True)
        self.assertTrue(normal.ok())
        self.assertTrue(strict.ok(), strict.errors)

    def test_no_cjk_noop_is_warning_and_strict_fails(self):
        self.fx.write("dict/entries/common/ui.tsv", "Beta\tBeta\n")
        normal = dictlib.check(self.fx.root)
        strict = dictlib.check(self.fx.root, strict=True)
        self.assertTrue(normal.ok())
        self.assertFalse(strict.ok())

    def test_manifest_duplicate_order_is_error(self):
        self.fx.write("dict/manifest.tsv", "0\ta.tsv\tmanual\tglobal\t2\n0\tb.tsv\tmanual\tglobal\t2\n")
        with self.assertRaises(dictlib.DictError):
            dictlib.read_manifest(self.fx.root)

    def test_malformed_tsv_columns_is_error(self):
        self.fx.write("dict/entries/common/ui.tsv", "Beta\n")
        with self.assertRaises(dictlib.DictError):
            dictlib.load_tree(self.fx.root)


if __name__ == "__main__":
    unittest.main()
