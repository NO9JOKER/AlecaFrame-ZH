#!/usr/bin/env node
/*
 * 裂罅中文搜索「全词条」覆盖测试：
 * 读取项目全部词典数据（generated / upstream / entries / fixes / overrides），
 * 对每条中文词条验证五类模糊搜索都能命中对应的裂罅卡片：
 *   1) 完整中文词条；
 *   2) 中文词条的 2 字前缀（模糊搜索）；
 *   3) 英文名的首词（英文模糊搜索）；
 *   4) 属性名拆分（"+100% <英文>" 形态的裂罅属性）。
 * 纯数据驱动，不依赖宿主。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src", "runtime", "features", "search", "api.js");

function readTsv(file, minCols = 2) {
  const dict = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("\t");
    if (parts.length < minCols) continue;
    const en = parts[0].trim();
    const zh = parts[1].trim();
    if (en && zh) dict[en] = zh;
  }
  return dict;
}

function walkTsv(dir) {
  let dict = {};
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      dict = Object.assign(dict, walkTsv(full));
    } else if (name.endsWith(".tsv") && name !== "keep-english.tsv") {
      dict = Object.assign(dict, readTsv(full));
    }
  }
  return dict;
}

const dict = Object.assign(
  {},
  readTsv(path.join(ROOT, "dict", "generated", "items.tsv")),
  readTsv(path.join(ROOT, "dict", "generated", "mioeu-terms.tsv")),
  readTsv(path.join(ROOT, "dict", "fixes.tsv")),
  walkTsv(path.join(ROOT, "dict", "entries")),
  readTsv(path.join(ROOT, "dict", "overrides.tsv"))
);
const upstream = path.join(ROOT, "dict", "upstream", "translations.zh-CN.json");
if (statSync(upstream).isFile()) {
  const json = JSON.parse(readFileSync(upstream, "utf8"));
  for (const [en, zh] of Object.entries(json)) {
    if (typeof zh === "string" && en && zh) dict[en] = zh;
  }
}

const sandbox = { console, __AFCN_DICT__: dict, __AFCN_RELIC_REWARDS__: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(SRC, "utf8"), sandbox, { filename: SRC });
const api = sandbox.__AFCN_RUNTIME__.features.search.api;

const hasChinese = (value) => /[\u3400-\u9fff]/.test(value);
// 只有「像裂罅属性名」的短词条才做属性形态测试；长句/描述/URL 用不到属性形态。
const attributeLike = (en) =>
  en.length >= 3 &&
  en.length <= 48 &&
  !/[<>:.]/.test(en) &&
  !/  /.test(en) &&
  /^[A-Za-z]/.test(en);
const entries = Object.entries(dict).filter(([en, zh]) => en && zh && hasChinese(zh));

function run(name, cases) {
  let passed = 0;
  const failures = [];
  for (const item of cases) {
    let hits = null;
    try {
      hits = api.filterRivenItems([item.riven], item.query);
    } catch (error) {
      failures.push({ ...item, error: String(error) });
      continue;
    }
    if (Array.isArray(hits) && hits.length === 1) passed++;
    else failures.push(item);
  }
  console.log(`${name}: ${passed}/${cases.length} passed, ${failures.length} failed`);
  for (const failure of failures.slice(0, 10)) {
    console.log(`  FAIL ${JSON.stringify(failure.en)} => ${JSON.stringify(failure.query)}`);
  }
  return failures.length;
}

const full = [];
const fuzzy = [];
const english = [];
const trait = [];
const traitFuzzy = [];
for (const [en, zh] of entries) {
  full.push({ en, query: zh.toLowerCase(), riven: { name: "Rifle Riven", weaponName: en } });
  if (zh.length >= 4) {
    fuzzy.push({ en, query: zh.slice(0, 2).toLowerCase(), riven: { name: "Rifle Riven", weaponName: en } });
  }
  const firstWord = en.split(/\s+/)[0];
  if (firstWord.length >= 3 && /^[A-Za-z]/.test(en)) {
    english.push({ en, query: firstWord.toLowerCase(), riven: { name: "Rifle Riven", weaponName: en } });
  }
  if (attributeLike(en) && !en.includes("(") && !en.includes(")") && zh.length >= 4) {
    traitFuzzy.push({
      en,
      query: zh.slice(0, 2).toLowerCase(),
      riven: {
        name: "Rifle Riven",
        statsPerWeapon: [{ byLevel: [{ positiveTraits: [{ description: "+100% " + en }], negativeTraits: [] }] }],
      },
    });
  }
  if (attributeLike(en)) {
    trait.push({
      en,
      query: zh.toLowerCase(),
      riven: {
        name: "Rifle Riven",
        statsPerWeapon: [{ byLevel: [{ positiveTraits: [{ description: "+100% " + en }], negativeTraits: [] }] }],
      },
    });
  }
}

const failed =
  run("完整中文词条", full) +
  run("中文 2 字模糊", fuzzy) +
  run("英文首词模糊", english) +
  run("属性名拆分", trait) +
  run("属性 2 字模糊", traitFuzzy);

console.log(`词典条目 ${entries.length} 条，五类用例 ${full.length + fuzzy.length + english.length + trait.length + traitFuzzy.length} 个`);
if (!entries.length) {
  console.error("dictionary entries not found; check paths");
  process.exitCode = 1;
} else if (failed) {
  process.exitCode = 1;
}
