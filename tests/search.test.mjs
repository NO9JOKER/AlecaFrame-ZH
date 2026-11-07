#!/usr/bin/env node
/*
 * AlecaFrame-ZH 中文搜索纯函数测试
 *
 * 运行：node tests/search.test.mjs
 *
 * 做法：用假 window（__AFZH_TEST__ + __AFCN_DICT__）执行 src/search.js，
 * 从 repo/dict/items.tsv 抽样 + 精选真实词条构造 __AFCN_DICT__，
 * 只测可注入的纯函数；不装钩子、不碰 DOM、不需要 AlecaFrame 运行。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEARCH_SRC = readFileSync(path.join(ROOT, "src", "search.js"), "utf8");
const ITEMS_TSV = readFileSync(path.join(ROOT, "dict", "items.tsv"), "utf8");

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
    console.log("       " + (error && error.message ? String(error.message).split("\n").join("\n       ") : error));
  }
}

/** 从 items.tsv 读成 {英文: 中文}；pick 里的名字必须存在，其余按步长抽样。 */
function buildSampledDict({ pick = [], sampleEvery = 500 } = {}) {
  const dict = {};
  const lines = ITEMS_TSV.split(/\r?\n/);
  const byEnglish = new Map();
  for (const line of lines) {
    if (!line) continue;
    const tab = line.indexOf("\t");
    if (tab <= 0) continue;
    const english = line.slice(0, tab);
    const chinese = line.slice(tab + 1);
    if (!english || !chinese) continue;
    byEnglish.set(english, chinese);
  }
  for (const english of pick) {
    assert.ok(byEnglish.has(english), "dict/items.tsv 里缺少测试词条：" + english);
    dict[english] = byEnglish.get(english);
  }
  let index = 0;
  for (const [english, chinese] of byEnglish) {
    if (index++ % sampleEvery === 0 && !(english in dict)) dict[english] = chinese;
  }
  return dict;
}

/** 用假 window 执行 search.js，返回测试 API。 */
function loadSearchModule(dict) {
  const fakeWindow = { __AFZH_TEST__: true, __AFCN_DICT__: dict };
  const run = new Function("window", "console", SEARCH_SRC); // eslint-disable-line no-new-func
  run(fakeWindow, console);
  const api = fakeWindow.__AFZH_SEARCH_TEST__;
  assert.ok(api, "search.js 没有在 __AFZH_TEST__ 模式下暴露 __AFZH_SEARCH_TEST__");
  return api;
}

const SAMPLE_PICK = [
  "Sagek Prime",
  "Sagek Prime Barrel",
  "Sagek Prime Barrel Blueprint",
  "Sagek Prime Blueprint",
  "Sagek Prime Receiver",
  "Sagek Prime Receiver Blueprint",
  "Soma",
  "Soma Prime",
  "Adaptation",
  "Intruder",
  "Invader",
  "Forma Blueprint",
  "Ash Prime Systems Blueprint",
  "Axi A1",
  "Neo N1"
];

const API = loadSearchModule(buildSampledDict({ pick: SAMPLE_PICK, sampleEvery: 400 }));
const apiDefault = API.defaultApi;

// ---------------------------------------------------------------------------
console.log("\n[1] 基础工具");
// ---------------------------------------------------------------------------
test("hasChinese 只对中日韩统一表意文字返回 true", () => {
  assert.equal(API.hasChinese("杀格 Prime"), true);
  assert.equal(API.hasChinese("Invader"), false);
  assert.equal(API.hasChinese(""), false);
  assert.equal(API.hasChinese(undefined), false);
  assert.equal(API.hasChinese("A1"), false);
});

test("splitTerms 按空白拆词并小写，空输入得到空数组", () => {
  assert.deepEqual(API.splitTerms("  杀格   Prime  "), ["杀格", "prime"]);
  assert.deepEqual(API.splitTerms(""), []);
  assert.deepEqual(API.splitTerms(null), []);
});

// ---------------------------------------------------------------------------
console.log("\n[2] 反向索引（中文 -> 英文）与择词策略");
// ---------------------------------------------------------------------------
test("整名精确反查：杀格 Prime 枪管蓝图 -> Sagek Prime Barrel Blueprint", () => {
  assert.equal(apiDefault.englishForChinese("杀格 Prime 枪管蓝图"), "Sagek Prime Barrel Blueprint");
});

test("同中文多英文时取最短英文名（确定性择词）", () => {
  // items.tsv 实测：Intruder / Invader 都译作「入侵者」，Invader 更短
  assert.equal(apiDefault.englishForChinese("入侵者"), "Invader");
  const custom = API.createApi({ "Alpha Long Name": "同名", "Beta": "同名", "Gamma": "同名" });
  assert.equal(custom.englishForChinese("同名"), "Beta", "应取最短英文名");
  const tie = API.createApi({ "Zorro": "并列", "Alpha": "并列" });
  assert.equal(tie.englishForChinese("并列"), "Alpha", "长度相同按字母序，保证确定性");
});

test("反向索引的候选桶按（长度, 字母序）排序，便于外部审计", () => {
  const index = API.buildIndex({ "Long English Name": "影", "Short": "影" });
  assert.deepEqual(index.reverse.get("影"), ["Short", "Long English Name"]);
  assert.equal(index.keys.length, 1);
});

test("英文大小写不敏感", () => {
  assert.equal(apiDefault.englishForChinese("杀格 prime 枪管蓝图"), "Sagek Prime Barrel Blueprint");
  assert.equal(apiDefault.englishForChinese("  杀格   Prime   "), "Sagek Prime");
});

// ---------------------------------------------------------------------------
console.log("\n[3] 部件组合反查（中文部件 -> 英文部件）");
// ---------------------------------------------------------------------------
test("词典里没有的整名，用部件表拼出英文：杀格 Prime 上机匣", () => {
  assert.equal(apiDefault.englishForChinese("杀格 Prime 上机匣"), "Sagek Prime Upper Receiver");
});

test("部件取最长匹配：枪管组件 优先于 枪管", () => {
  assert.equal(apiDefault.englishForChinese("杀格 Prime 枪管组件"), "Sagek Prime Barrel Assembly");
});

test("部件组合 + 蓝图：杀格 Prime 枪管 蓝图（中文里带空格也能拼）", () => {
  assert.equal(apiDefault.englishForChinese("杀格 Prime 枪管 蓝图"), "Sagek Prime Barrel Blueprint");
});

test("子串兜底：只有部分中文时取「中文名最短、再英文最短」的候选", () => {
  const custom = API.createApi({
    "Lanka Prime Barrel": "兰卡 Prime 枪管",
    "Lanka Prime Barrel Blueprint": "兰卡 Prime 枪管蓝图"
  });
  assert.equal(custom.englishForChinese("枪管蓝图"), "Lanka Prime Barrel Blueprint");
  assert.equal(custom.englishForChinese("枪管"), "Lanka Prime Barrel");
});

test("无法反查时返回 null（不瞎猜）", () => {
  assert.equal(apiDefault.englishForChinese("这不是一个游戏物品名"), null);
  assert.equal(apiDefault.englishForChinese(""), null);
});

// ---------------------------------------------------------------------------
console.log("\n[4] Prime 后缀");
// ---------------------------------------------------------------------------
test("中文「X Prime」在只有基础名时也能反查", () => {
  const custom = API.createApi({ "Soma": "月神" });
  assert.equal(custom.englishForChinese("月神 Prime"), "Soma Prime");
});

test("实词典里 X Prime 整名优先", () => {
  assert.equal(apiDefault.englishForChinese("月神 Prime"), "Soma Prime");
  assert.equal(apiDefault.englishForChinese("月神"), "Soma");
});

test("英文 Prime 名 -> 中文时保留 Prime（Warframe 名不译）", () => {
  const custom = API.createApi({ "Soma": "月神" });
  assert.equal(custom.toChineseName("Soma Prime"), "月神 Prime");
});

// ---------------------------------------------------------------------------
console.log("\n[5] 正查（英文 -> 中文）与过滤文本");
// ---------------------------------------------------------------------------
test("整名正查", () => {
  assert.equal(apiDefault.toChineseName("Adaptation"), "适应");
  assert.equal(apiDefault.toChineseName("Sagek Prime Barrel Blueprint"), "杀格 Prime 枪管蓝图");
});

test("正查部件组合：词典没有整名时按部件表拼中文", () => {
  assert.equal(apiDefault.toChineseName("Sagek Prime Upper Receiver"), "杀格 Prime 上机匣");
});

test("查不到的英文名返回 null（DOM 翻译层不应误翻）", () => {
  assert.equal(apiDefault.toChineseName("Definitely Not A Warframe Item"), null);
  assert.equal(apiDefault.toChineseName(""), null);
});

test("searchableName = 中文字幕名 + 英文原名（小写）", () => {
  const haystack = apiDefault.searchableName("Sagek Prime Barrel Blueprint");
  assert.ok(haystack.includes("杀格 prime 枪管蓝图"), haystack);
  assert.ok(haystack.includes("sagek prime barrel blueprint"), haystack);
});

// ---------------------------------------------------------------------------
console.log("\n[6] 列表过滤（inventory / foundry / WFM / 裂罅共用）");
// ---------------------------------------------------------------------------
const ITEMS = [
  { name: "Sagek Prime Barrel Blueprint" },
  { name: "Sagek Prime Receiver Blueprint" },
  { name: "Soma Prime" },
  { name: "Adaptation" },
  { name: "Definitely Not A Warframe Item" }
];

test("空输入返回原数组（不过滤）", () => {
  assert.equal(apiDefault.filterItems(ITEMS, "", ["name"]), ITEMS);
  assert.equal(apiDefault.filterItems(ITEMS, "   ", ["name"]), ITEMS);
});

test("中文子串过滤", () => {
  const result = apiDefault.filterItems(ITEMS, "杀格", ["name"]);
  assert.deepEqual(result.map((item) => item.name), [
    "Sagek Prime Barrel Blueprint",
    "Sagek Prime Receiver Blueprint"
  ]);
});

test("多词 AND：每个词都要命中", () => {
  assert.equal(apiDefault.filterItems(ITEMS, "杀格 枪管", ["name"]).length, 1);
  assert.equal(apiDefault.filterItems(ITEMS, "杀格 月神", ["name"]).length, 0);
});

test("部件组合中文查询命中部件的蓝图条目", () => {
  assert.equal(apiDefault.filterItems(ITEMS, "杀格 Prime 枪管蓝图", ["name"]).length, 1);
});

test("英文输入仍可过滤（大小写不敏感）", () => {
  assert.equal(apiDefault.filterItems(ITEMS, "sagek prime receiver", ["name"]).length, 1);
});

test("中英混合输入（杀格 prime）", () => {
  assert.equal(apiDefault.filterItems(ITEMS, "杀格 Prime", ["name"]).length, 2);
});

test("多字段过滤：weaponName + name（WFM 合同 / 已揭示裂罅）", () => {
  const contracts = [
    { weaponName: "Sagek Prime", name: "Crita-visi" },
    { weaponName: "Soma Prime", name: "Acri-critata" }
  ];
  assert.equal(apiDefault.filterItems(contracts, "杀格", ["weaponName", "name"]).length, 1);
  assert.equal(apiDefault.filterItems(contracts, "杀格", ["name"]).length, 0);
});

test("非对象 / 无名字段 / 空数组都安全", () => {
  assert.deepEqual(apiDefault.filterItems([null, 1, "x", { name: "" }], "杀格", ["name"]), []);
  assert.deepEqual(apiDefault.filterItems([], "杀格", ["name"]), []);
  assert.equal(apiDefault.filterItems(null, "杀格", ["name"]), null);
});

test("词典里没有的物品名不会被中文查询命中（不会误伤）", () => {
  assert.equal(apiDefault.filterItems(ITEMS, "不存在的名字", ["name"]).length, 0);
});

// ---------------------------------------------------------------------------
console.log("\n[7] 遗物规划结果过滤（normalData.name + rewards[].name）");
// ---------------------------------------------------------------------------
test("遗物名命中", () => {
  const payload = JSON.stringify([
    { normalData: { name: "Axi A1" }, custom: { rewards: [{ name: "Sagek Prime Barrel Blueprint" }] } },
    { normalData: { name: "Soma Prime" }, custom: { rewards: [] } }
  ]);
  const filtered = API.filterRelicPlannerPayload(payload, "后纪");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].normalData.name, "Axi A1");
});

test("奖励名命中（中文遗物搜索可搜奖励）", () => {
  const payload = JSON.stringify([
    { normalData: { name: "Axi A1" }, custom: { rewards: [{ name: "Sagek Prime Barrel Blueprint" }] } },
    { normalData: { name: "Neo N1" }, custom: { rewards: [{ name: "Adaptation" }] } }
  ]);
  const filtered = API.filterRelicPlannerPayload(payload, "杀格 Prime 枪管");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].normalData.name, "Axi A1");
});

test("非法 JSON / 非数组返回 null（调用方回退原数据）", () => {
  assert.equal(API.filterRelicPlannerPayload("not json", "杀格"), null);
  assert.equal(API.filterRelicPlannerPayload(JSON.stringify({ a: 1 }), "杀格"), null);
});

// ---------------------------------------------------------------------------
console.log("\n[8] 市场搜索建议");
// ---------------------------------------------------------------------------
test("本地建议带中文名 + 标记 urlName + 英文原文", () => {
  const list = apiDefault.marketSuggestions("杀格 Prime 枪管蓝图", 5);
  assert.ok(list.length >= 1, "应至少命中一条");
  assert.equal(list[0].name, "杀格 Prime 枪管蓝图");
  assert.equal(list[0].english, "Sagek Prime Barrel Blueprint");
  assert.equal(list[0].picture, "");
  assert.ok(list[0].urlName.startsWith(API.MARKET_MARKER));
  assert.equal(apiDefault.englishFromMarketMarker(list[0].urlName), "Sagek Prime Barrel Blueprint");
});

test("排序：中文整名精确 > 前缀 > 包含", () => {
  const custom = API.createApi({
    "Zzz Item": "枪管附属物",
    "Aaa Item": "枪管",
    "Mmm Item": "枪管组件"
  });
  const list = custom.marketSuggestions("枪管");
  assert.equal(list[0].name, "枪管");
  assert.equal(list[1].name, "枪管组件");
  assert.equal(list[2].name, "枪管附属物");
});

test("英文输入也能出建议；limit 生效", () => {
  assert.ok(apiDefault.marketSuggestions("sagek", 2).length <= 2);
  const many = apiDefault.marketSuggestions("prime", 3);
  assert.ok(many.length <= 3);
});

test("空查询返回空数组", () => {
  assert.deepEqual(apiDefault.marketSuggestions(""), []);
});

test("英文名字典写法的建议不会误判为标记 urlName", () => {
  assert.equal(apiDefault.englishFromMarketMarker("sagek_prime_barrel"), null);
  assert.equal(apiDefault.englishFromMarketMarker(""), null);
  assert.equal(apiDefault.englishFromMarketMarker(undefined), null);
});

// ---------------------------------------------------------------------------
console.log("\n[9] 原生英文接口的查询词改写");
// ---------------------------------------------------------------------------
test("英文输入原样返回（不干预原生行为）", () => {
  assert.equal(apiDefault.englishQueryForChinese("Sagek Prime"), "Sagek Prime");
  assert.equal(apiDefault.englishQueryForChinese(""), "");
});

test("中文输入换英文", () => {
  assert.equal(apiDefault.englishQueryForChinese("杀格 Prime"), "Sagek Prime");
  assert.equal(apiDefault.englishQueryForChinese("杀格 Prime 枪管蓝图"), "Sagek Prime Barrel Blueprint");
});

test("无法翻译的中文返回 null（调用方保持原查询，不瞎猜）", () => {
  assert.equal(apiDefault.englishQueryForChinese("这不是物品"), null);
});

// ---------------------------------------------------------------------------
console.log("\n[10] 健壮性");
// ---------------------------------------------------------------------------
test("空词典 / null 词典不抛异常", () => {
  for (const dict of [null, undefined, {}, { "": "x" }, { "abc": "" }]) {
    const custom = API.createApi(dict);
    assert.equal(custom.englishForChinese("杀格"), null);
    assert.equal(custom.toChineseName("abc"), null);
    assert.deepEqual(custom.filterItems([{ name: "abc" }], "杀格", ["name"]), []);
    assert.deepEqual(custom.marketSuggestions("杀格"), []);
  }
});

test("同一部词典多次 createApi 结果一致（确定性）", () => {
  const dict = buildSampledDict({ pick: SAMPLE_PICK, sampleEvery: 800 });
  const first = API.createApi(dict);
  const second = API.createApi(dict);
  for (const query of ["杀格 Prime 枪管蓝图", "入侵者", "月神 Prime", "杀格 枪管"]) {
    assert.equal(first.englishForChinese(query), second.englishForChinese(query), query);
  }
});

// ---------------------------------------------------------------------------
console.log("\n[11] 插件钩子：中文优先本地过滤（部分中文，v1.1.8 回归）");
// ---------------------------------------------------------------------------

/** 模拟原生 getFilteredFoundry(query, showAll, cb)：按英文 name 子串过滤，空 search 返回全量。 */
function makeFoundryNative(items, calls) {
  return {
    getFilteredFoundry(query, showAll, cb) {
      const filters = JSON.parse(query);
      calls.push(filters);
      const term = String(filters.search || "").toLowerCase();
      const matched = term
        ? items.filter((item) => item.name.toLowerCase().indexOf(term) !== -1)
        : items.slice();
      cb(true, JSON.stringify(matched));
    }
  };
}

// 关键：词典里同时有 UI 术语 Death -> 死亡（mioeu-terms.tsv:769）和物品 死亡使徒 -> Kaszas
const HOOK_DICT = {
  "Death": "死亡",
  "Dethcube": "死亡魔方",
  "Kaszas": "死亡使徒",
  "Braton": "布莱顿",
  "Serration": "膛线",
  "Arcane Energize": "赋能·充沛",
  "Arcane Grace": "赋能·优雅"
};

test("铸造厂输入部分中文「死亡」：本地过滤出所有匹配项，不被 UI 术语 Death 劫持", () => {
  const mod = loadSearchModule(HOOK_DICT);
  const calls = [];
  const native = makeFoundryNative([{ name: "Kaszas" }, { name: "Dethcube" }, { name: "Braton" }], calls);
  assert.ok(mod.hookJsonSearchMethod(native, "getFilteredFoundry", ["name"]));
  let result = null;
  native.getFilteredFoundry(JSON.stringify({ type: "archwing", search: "死亡" }), false, (ok, data) => {
    result = JSON.parse(data);
  });
  assert.deepEqual(result.map((x) => x.name), ["Kaszas", "Dethcube"], "应命中所有中文名含「死亡」的物品");
  assert.equal(calls[0].search, "", "中文查询应先清空 search 走本地过滤");
  assert.ok(!calls.some((c) => c.search === "Death"), "不应把「死亡」改写成 UI 术语 Death");
});

test("铸造厂中文查询强制 showAll=true（原生 search 为空时只回 100 条，不全量会漏）", () => {
  const mod = loadSearchModule(HOOK_DICT);
  const calls = [];
  const native = {
    getFilteredFoundry(query, showAll, cb) {
      calls.push({ filters: JSON.parse(query), showAll });
      cb(true, JSON.stringify([{ name: "Kaszas" }]));
    }
  };
  assert.ok(mod.hookJsonSearchMethod(native, "getFilteredFoundry", ["name"], { forceTrueIndex: 1 }));
  let result = null;
  native.getFilteredFoundry(JSON.stringify({ search: "死亡" }), false, (ok, data) => {
    result = JSON.parse(data);
  });
  assert.equal(calls[0].showAll, true, "中文查询应强制 showAll=true");
  assert.equal(calls[0].filters.search, "");
  assert.deepEqual(result.map((x) => x.name), ["Kaszas"]);
});

test("英文查询原样交给原生，不做本地过滤", () => {
  const mod = loadSearchModule(HOOK_DICT);
  const calls = [];
  const native = makeFoundryNative([{ name: "Kaszas" }, { name: "Braton" }], calls);
  assert.ok(mod.hookJsonSearchMethod(native, "getFilteredFoundry", ["name"]));
  let result = null;
  native.getFilteredFoundry(JSON.stringify({ search: "Braton" }), false, (ok, data) => {
    result = JSON.parse(data);
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].search, "Braton", "英文查询必须原样透传");
  assert.deepEqual(result.map((x) => x.name), ["Braton"]);
});

test("本地过滤 0 命中时退回英文改写（词典缺译也不丢结果）", () => {
  const mod = loadSearchModule({ "Alpha": "阿尔法" });
  const calls = [];
  const native = makeFoundryNative([{ name: "AlphaX" }], calls);
  assert.ok(mod.hookJsonSearchMethod(native, "getFilteredFoundry", ["name"]));
  let result = null;
  native.getFilteredFoundry(JSON.stringify({ search: "阿尔法" }), false, (ok, data) => {
    result = JSON.parse(data);
  });
  assert.deepEqual(calls.map((c) => c.search), ["", "Alpha"], "先本地过滤（search 清空），0 命中后按英文重试");
  assert.deepEqual(result.map((x) => x.name), ["AlphaX"]);
});

test("裂罅武器搜索：部分中文同样先本地过滤", () => {
  const mod = loadSearchModule(HOOK_DICT);
  const calls = [];
  const all = [{ name: "Kaszas" }, { name: "Braton" }];
  const native = {
    GetRivenWeapons(search, cb) {
      calls.push(search);
      const term = String(search || "").toLowerCase();
      cb(true, JSON.stringify(term ? all.filter((x) => x.name.toLowerCase().indexOf(term) !== -1) : all));
    }
  };
  assert.ok(mod.hookRivenWeapons(native));
  let result = null;
  native.GetRivenWeapons("死亡", (ok, data) => { result = JSON.parse(data); });
  assert.deepEqual(result.map((x) => x.name), ["Kaszas"]);
  assert.equal(calls[0], "", "中文应先用空查询取全量");
});

test("赋能页：中文查询走 Vue 侧过滤（receiveArcaneProgress 钩子）", () => {
  const mod = loadSearchModule(HOOK_DICT);
  const app = {
    search: "充沛",
    items: [],
    noItems: true,
    resultsLimited: true,
    requestId: 7,
    receiveArcaneProgress(requestId, success, data, includeAll) {
      if (requestId !== this.requestId) return;
      const parsed = JSON.parse(data);
      const query = this.search.trim().toLowerCase();
      const rows = parsed.items.filter((it) => !query || (it.name + " " + it.category).toLowerCase().includes(query));
      this.items = includeAll ? rows : rows.slice(0, 100);
      this.noItems = !this.items.length;
      this.resultsLimited = !includeAll && rows.length > 100;
    }
  };
  assert.ok(mod.hookArcaneApp(app));
  app.receiveArcaneProgress(7, true, JSON.stringify({ items: [
    { name: "Arcane Energize", category: "Arcane" },
    { name: "Arcane Grace", category: "Arcane" },
    { name: "Braton", category: "Weapon" }
  ] }), false, true);
  assert.deepEqual(app.items.map((x) => x.name), ["Arcane Energize"], "应只留下中文名含「充沛」的赋能");
  assert.equal(app.noItems, false);
  assert.equal(app.search, "充沛", "search 必须还原，不能把搜索框清空");
  assert.equal(app.resultsLimited, false);
});

test("赋能页：英文查询原样交给原方法", () => {
  const mod = loadSearchModule(HOOK_DICT);
  let called = 0;
  const app = { search: "Braton", receiveArcaneProgress() { called++; } };
  assert.ok(mod.hookArcaneApp(app));
  app.receiveArcaneProgress(1, true, "{}", false, false);
  assert.equal(called, 1);
});

// ---------------------------------------------------------------------------
console.log("\n" + (failures.length ? "FAILED" : "PASSED") + "  " + passed + " passed, " + failures.length + " failed");
if (failures.length) {
  for (const failure of failures) console.error("\n--- " + failure.name + " ---\n" + (failure.error && failure.error.stack || failure.error));
  process.exit(1);
}
