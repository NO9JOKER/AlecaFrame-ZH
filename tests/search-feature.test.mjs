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
    "Rifle Riven Mod": "步枪裂罅 Mod",
    "Riven": "裂罅",
    "Veiled rivens": "未揭示裂罅",
    "Critical Chance": "暴击几率",
    "Range": "攻击范围",
    "Headshot Damage": "爆头伤害",
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

// ---- 裂罅列表搜索（已揭示 / 未揭示）----
const rivenGroups = () => [
  {
    challengeDescription: "Veiled rivens",
    rivens: [
      {
        name: "Rifle Riven",
        challengeStringWithComplication: "Equip these rivens to reveal their challenge",
        statsPerWeapon: [{ byLevel: [{ positiveTraits: [{ description: "+121.9% Critical Chance" }], negativeTraits: [] }] }],
      },
    ],
  },
  {
    challengeDescription: "Unveiled rivens",
    rivens: [{ name: "Zaw Riven", statsPerWeapon: [] }],
  },
];

test("riven group search matches Chinese card names and group headings", () => {
  assert.equal(api.filterRivenGroups(rivenGroups(), "步枪")[0].rivens.length, 1);
  assert.equal(api.filterRivenGroups(rivenGroups(), "未揭示")[0].rivens.length, 1);
  assert.equal(api.filterRivenGroups(rivenGroups(), "暴击")[0].rivens.length, 1);
});

test("riven group search keeps English substring queries", () => {
  assert.equal(api.filterRivenGroups(rivenGroups(), "rifle")[0].rivens.length, 1);
  assert.equal(api.filterRivenGroups(rivenGroups(), "zaw")[0].rivens.length, 1);
});

test("riven group search drops empty groups and unknown terms", () => {
  assert.equal(api.filterRivenGroups(rivenGroups(), "完全不存在").length, 0);
  assert.equal(api.filterRivenGroups(rivenGroups(), "").length, 2);
});

const rivenItems = () => [
  {
    name: "Rifle Riven",
    weaponName: "Soma Prime",
    statsPerWeapon: [{ byLevel: [{ positiveTraits: [{ description: "Critical Chance" }], negativeTraits: [] }] }],
  },
  { name: "Zaw Riven", weaponName: "Cyath", statsPerWeapon: [] },
  {
    name: "Kitgun Riven",
    weaponName: "Catchmoon",
    statsPerWeapon: [{ byLevel: [{ positiveTraits: [{ description: "+105.5% Critical Damage" }], negativeTraits: [] }] }],
  },
  {
    name: "Melee Riven",
    weaponName: "Gram Prime",
    statsPerWeapon: [{ byLevel: [{ positiveTraits: [{ description: "+114.9% Range" }, { description: "+100% Headshot Damage" }], negativeTraits: [] }] }],
  },
];

test("flat riven item search strips percent/html from trait descriptions", () => {
  const wrapped = [{
    name: "Rifle Riven",
    weapons: [],
    statsPerWeapon: [{ byLevel: [{ positiveTraits: [{ description: "<span>+121.9% Critical Damage</span>" }], negativeTraits: [] }] }],
  }];
  assert.equal(api.filterRivenItems(wrapped, "暴击").length, 1);
  assert.equal(api.filterRivenItems(wrapped, "crit").length, 1);
});

test("flat riven item search covers card name, weapon, traits and English", () => {
  assert.equal(api.filterRivenItems(rivenItems(), "暴击").length, 2);
  assert.equal(api.filterRivenItems(rivenItems(), "步枪").length, 1);
  assert.equal(api.filterRivenItems(rivenItems(), "范围").length, 1);
  assert.equal(api.filterRivenItems(rivenItems(), "爆头").length, 1);
  assert.equal(api.filterRivenItems(rivenItems(), "soma").length, 1);
  assert.equal(api.filterRivenItems(rivenItems(), "完全不存在").length, 0);
  assert.equal(api.filterRivenItems(rivenItems(), "").length, 4);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
