#!/usr/bin/env node
/* 裂罅页面应用级兜底测试：中文查询先取全量、恢复输入框显示、再本地过滤 items。 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = path.join(ROOT, "src", "runtime");
const MANIFEST = JSON.parse(readFileSync(path.join(RUNTIME, "modules.json"), "utf8"));

const sandbox = {
  console,
  setTimeout() { return 0; },
  clearTimeout() {},
  setInterval() { return 0; },
  clearInterval() {},
  __AFCN_DICT__: {
    "Rifle Riven Mod": "步枪裂罅 Mod",
    "Riven": "裂罅",
    "Critical Chance": "暴击几率",
    "Zaw Riven": "Zaw 裂罅",
  },
  __AFCN_RELIC_REWARDS__: {},
};
vm.createContext(sandbox);
for (const module of MANIFEST.modules) {
  const file = path.join(RUNTIME, module.file);
  vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
}
const runtime = sandbox.__AFCN_RUNTIME__;
const hookRivenApp = runtime.features.searchRuntime.hookRivenApp;
assert.equal(typeof hookRivenApp, "function");

const watched = {};
const app = {
  selectedSearch: "",
  items: [],
  lastFilters: null,
  $watch(key, fn) { watched[key] = fn; },
  refresh() { this.lastFilters = { search: this.selectedSearch }; },
};

assert.equal(hookRivenApp(app, "items"), true);

const rivenWithCrit = {
  name: "Rifle Riven",
  statsPerWeapon: [{ byLevel: [{ positiveTraits: [{ description: "+121.9% Critical Chance" }], negativeTraits: [] }] }],
};
const rivenOther = { name: "Zaw Riven", statsPerWeapon: [] };

app.selectedSearch = "暴击";
app.refresh();
assert.equal(app.selectedSearch, "暴击", "输入框应恢复中文显示");
assert.deepEqual(app.lastFilters, { search: "" }, "插件请求应先取全量");

app.items = [rivenWithCrit, rivenOther];
watched.items([rivenWithCrit, rivenOther]);
assert.equal(app.items.length, 1, "中文查询应只保留命中的裂罅");
assert.equal(app.items[0], rivenWithCrit);

app.selectedSearch = "crit";
app.refresh();
assert.deepEqual(app.lastFilters, { search: "crit" }, "英文查询保持原搜索");
app.items = [rivenWithCrit, rivenOther];
watched.items([rivenWithCrit, rivenOther]);
assert.equal(app.items.length, 2, "英文查询不做本地过滤");

console.log("riven app hook: 2 passed, 0 failed");
