#!/usr/bin/env node
/* Smoke tests for the new pure Chinese-search API (features/search/api.js). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src", "runtime", "features", "search", "api.js");
const sandbox = {
  console,
  __AFCN_DICT__: {
    "Sagek Prime": "杀格 Prime",
    "Sagek Prime Barrel Blueprint": "杀格 Prime 枪管蓝图",
    "Critical Damage": "暴击伤害",
    "Cold": "冰冻",
    "Status Damage": "状态伤害",
    "Alloy Plate": "合金板",
    "Adramal Alloy": "阿德拉玛合金",
    "Mars": "火星",
  },
  __AFCN_RELIC_REWARDS__: {},
};
vm.createContext(sandbox);
vm.runInContext(readFileSync(SRC, "utf8"), sandbox, { filename: SRC });
const feature = sandbox.__AFCN_RUNTIME__.features.search;
const api = feature.api;

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

test("api is exposed", () => {
  assert.ok(api);
  assert.equal(typeof api.englishForChinese, "function");
  assert.equal(typeof api.toChineseName, "function");
});

test("Chinese exact reverse lookup", () => {
  assert.equal(api.englishForChinese("杀格 Prime 枪管蓝图"), "Sagek Prime Barrel Blueprint");
});

test("Chinese name to English base", () => {
  assert.equal(api.englishForChinese("杀格 Prime"), "Sagek Prime");
});

test("English to Chinese name", () => {
  assert.equal(api.toChineseName("Critical Damage"), "暴击伤害");
});

test("part + blueprint fallback", () => {
  assert.equal(api.toChineseName("Sagek Prime Barrel Blueprint"), "杀格 Prime 枪管蓝图");
});

test("resolveEnglishQuery wrapper", () => {
  assert.equal(feature.resolveEnglishQuery("杀格 Prime 枪管蓝图"), "Sagek Prime Barrel Blueprint");
});

test("unknown Chinese returns null", () => {
  assert.equal(api.englishForChinese("完全不存在的中文"), null);
});

test("local list matching supports Chinese and English", () => {
  assert.equal(api.matchesText("Alloy Plate", "合金"), true);
  assert.equal(api.matchesText("Alloy Plate", "合金板"), true);
  assert.equal(api.matchesText("Adramal Alloy", "合金"), true);
  assert.equal(api.matchesText("Alloy Plate", "alloy"), true);
  assert.equal(api.matchesText("Alloy Plate", "完全不匹配"), false);
});

test("local list matching handles name + location rows", () => {
  assert.equal(api.matchesText("Alloy Plate Mars/Gradivus", "合金板"), true);
  assert.equal(api.matchesText("Alloy Plate Mars/Gradivus", "合金"), true);
});

test("local list matching resolves location through reverse index", () => {
  assert.equal(api.matchesText("Mars/Gradivus (Caches), Rotation B", "火星"), true);
  assert.equal(api.matchesText("Mercury/Neruda (Caches), Rotation B", "火星"), false);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
