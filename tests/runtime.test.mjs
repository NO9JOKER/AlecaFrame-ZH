#!/usr/bin/env node
/*
 * Runtime core tests: load modules in src/runtime/modules.json order into a VM,
 * then exercise normalize / index / translate without DOM or host dependencies.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = path.join(ROOT, "src", "runtime");
const MANIFEST = JSON.parse(readFileSync(path.join(RUNTIME, "modules.json"), "utf8"));

const sandbox = { console };
vm.createContext(sandbox);
for (const module of MANIFEST.modules) {
  const file = path.join(RUNTIME, module.file);
  vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
}
const runtime = sandbox.__AFCN_RUNTIME__;

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

test("modules load in manifest order", () => {
  assert.ok(runtime.normalize);
  assert.ok(runtime.dictIndex);
  assert.ok(runtime.translate);
});

test("normalize collapses whitespace and trims", () => {
  assert.equal(runtime.normalize.norm("  A   B  "), "A B");
  assert.equal(runtime.normalize.norm(null), "");
});

test("CJK/Latin detection", () => {
  assert.equal(runtime.normalize.hasCjk("膛线"), true);
  assert.equal(runtime.normalize.hasCjk("Serration"), false);
  assert.equal(runtime.normalize.hasLatin("Serration"), true);
  assert.equal(runtime.normalize.hasLatin("膛线"), false);
});

test("dictionary index keeps first definition and lowercases ASCII keys", () => {
  const source = { Alpha: "阿尔法", "Status Damage": "状态伤害", "Cold": "冰冻", "COLD": "寒冷" };
  const index = runtime.dictIndex.buildIndex(source);
  assert.equal(index.map.get("Alpha"), "阿尔法");
  assert.equal(index.lowerMap.get("alpha"), "阿尔法");
  assert.equal(index.map.get("COLD"), "寒冷");
  assert.equal(index.lowerMap.get("cold"), "冰冻");
});

test("translator exact match wins", () => {
  const index = runtime.dictIndex.buildIndex({ "Status Damage": "状态伤害" });
  const tr = runtime.translate.createTranslator(index).translate;
  assert.equal(tr("Status Damage"), "状态伤害");
});

test("translator lowercased fallback", () => {
  const index = runtime.dictIndex.buildIndex({ "Status Damage": "状态伤害" });
  const tr = runtime.translate.createTranslator(index).translate;
  assert.equal(tr("status damage"), "状态伤害");
});

test("translator preserves non-Latin text as null", () => {
  const index = runtime.dictIndex.buildIndex({ "膛线": "膛线" });
  const tr = runtime.translate.createTranslator(index).translate;
  assert.equal(tr("纯中文"), null);
});

test("composites run before rules", () => {
  const index = runtime.dictIndex.buildIndex({});
  const tr = runtime.translate.createTranslator(index, {
    composites: [(text) => (text === "Lares, Mercury" ? "Lares，水星" : null)],
    rules: [() => "rule-should-not-win"],
  }).translate;
  assert.equal(tr("Lares, Mercury"), "Lares，水星");
});

test("rules run after dictionary and receive translate()", () => {
  const index = runtime.dictIndex.buildIndex({ "Critical Damage": "暴击伤害" });
  const tr = runtime.translate.createTranslator(index, {
    rules: [
      {
        id: "percent",
        match: (text, translate) => {
          const hit = text.match(/^(\d+(?:\.\d+)?)% (.+)$/);
          if (!hit) return null;
          const label = translate(hit[2]);
          return label === null ? null : hit[1] + "% " + label;
        },
      },
    ],
  }).translate;
  assert.equal(tr("+109.9% Critical Damage"), null);
  assert.equal(tr("109.9% Critical Damage"), "109.9% 暴击伤害");
});

test("all rules miss -> null (keeps English)", () => {
  const index = runtime.dictIndex.buildIndex({});
  const tr = runtime.translate.createTranslator(index, { rules: [() => null] }).translate;
  assert.equal(tr("Unknown UI text"), null);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
