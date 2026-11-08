#!/usr/bin/env node
/*
 * Rules/translation integration tests: load runtime modules in manifest order,
 * build a translator with the real rule table, and check representative cases.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = path.join(ROOT, "src", "runtime");
const MANIFEST = JSON.parse(readFileSync(path.join(RUNTIME, "modules.json"), "utf8"));

const sandbox = { console, setTimeout() {}, clearTimeout() {} };
vm.createContext(sandbox);
for (const module of MANIFEST.modules) {
  vm.runInContext(readFileSync(path.join(RUNTIME, module.file), "utf8"), sandbox, {
    filename: path.join(RUNTIME, module.file),
  });
}
const runtime = sandbox.__AFCN_RUNTIME__;
const index = runtime.dictIndex.buildIndex({
  "Critical Damage": "暴击伤害",
  "Damage to Corpus": "对 Corpus 伤害",
  Mercury: "水星",
  "Primary status chance": "主要武器触发几率",
  "Amber Archon Shard": "琥珀执刑官源力石",
  "+25% casting speed": "+25% 技能施放速度",
});
const translate = runtime.translate.createTranslator(index, {
  composites: [runtime.composite.translateComposite],
  rules: runtime.rules.list,
}).translate;

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok   " + name);
  } catch (error) {
    failures.push({ name, error });
    console.log("  FAIL " + name);
    console.log("       " + String((error && error.message) || error).split("\n").join("\n       "));
  }
}

test("rule table size is 45", () => {
  assert.equal(runtime.rules.list.length, 45);
});

test("composite translates planet only", () => {
  assert.equal(translate("Lares, Mercury"), "Lares，水星");
});

test("percent riven rule attaches damage suffix", () => {
  assert.equal(translate("109.9% Critical Damage"), "109.9% 暴击伤害");
});

test("multiplier riven rule", () => {
  assert.equal(translate("x1.5 Damage to Corpus"), "x1.5 对 Corpus 伤害");
});

test("shard Stela rule", () => {
  assert.equal(translate("5 Stela, 2 Tauforged"), "5 虚空石块，2 TAU源力石");
});

test("shard more effects rule", () => {
  assert.equal(translate("+1 more effects"), "另有 1 种效果");
});

test("shard card summary translates the effect name, not the count", () => {
  assert.equal(translate("3x Primary status chance"), "3 个 主要武器触发几率");
});

test("multiplied item stays English when the label is unknown", () => {
  assert.equal(translate("3x Unknown label"), null);
});

test("shard Stela single amount rule", () => {
  assert.equal(translate("100 Stela"), "100 虚空石块");
});

test("shard empty slot rule", () => {
  assert.equal(translate("Empty slot 3"), "空槽位 3");
});

test("shard slot title rule translates shard name and effect", () => {
  assert.equal(translate("Amber Archon Shard, +25% casting speed"), "琥珀执刑官源力石，+25% 技能施放速度");
});

test("shard frame copy prefix keeps installed summary rule", () => {
  assert.equal(translate("Copy 2, 5 / 5 installed, 3 Tauforged"), "复制 2，5 / 5 已安装，3 TAU源力石");
});

test("rank rule", () => {
  assert.equal(translate("Rank 8/8"), "等级 8/8");
});

test("date rule via Last record", () => {
  assert.equal(translate("Last record: Nov 4, 2026"), "最后记录：2026 年 11 月 4 日");
});

test("unknown text stays English (null)", () => {
  assert.equal(translate("Some untranslated UI text"), null);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
