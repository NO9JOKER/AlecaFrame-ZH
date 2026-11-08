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

const sandbox = {
  console,
  location: { pathname: "/web/main.html" },
  __AFCN_PAGES__: [
    { id: "main", file: "main.html", adapter: "main", features: ["translate", "search", "archon"] },
  ],
};
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

test("adapter resolves current page from injected registry", () => {
  const page = runtime.adapters.current();
  assert.equal(page.id, "main");
  assert.equal(page.file, "main.html");
  assert.equal(page.adapter, "main");
  assert.equal(page.features.join(","), "translate,search,archon");
});

test("entry exposes resolved page context", () => {
  assert.equal(sandbox.__AFCN_PAGE__.id, "main");
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

test("composite translates a known prefix label and keeps the node name", () => {
  const index = runtime.dictIndex.buildIndex({ Mercury: "水星", Recording: "录制中" });
  const tr = runtime.translate.createTranslator(index, {
    composites: [runtime.composite.translateComposite],
  }).translate;
  assert.equal(tr("Recording Lares, Mercury"), "录制中 Lares，水星");
  assert.equal(tr("Lares, Mercury"), "Lares，水星");
  assert.equal(tr("Foo Lares, Mercury"), "Foo Lares，水星");
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

function makeCanvasTarget() {
  const target = { calls: [] };
  target.fillText = function (text) {
    target.calls.push({ method: "fillText", text: text, x: arguments[1], y: arguments[2], maxWidth: arguments[3], count: arguments.length, self: this });
    return "fill-return";
  };
  target.strokeText = function (text) {
    target.calls.push({ method: "strokeText", text: text, x: arguments[1], y: arguments[2], maxWidth: arguments[3], count: arguments.length, self: this });
    return "stroke-return";
  };
  target.measureText = function (text) {
    target.calls.push({ method: "measureText", text: text, count: arguments.length, self: this });
    return { width: String(text).length };
  };
  return target;
}

function canvasTranslator(source) {
  const index = runtime.dictIndex.buildIndex(source);
  return runtime.translate.createTranslator(index).translate;
}

test("canvas text translates chart strings and keeps this/args/return", () => {
  assert.equal(typeof runtime.canvasText.create, "function");
  const target = makeCanvasTarget();
  const api = runtime.canvasText.create({
    translate: canvasTranslator({ "Total interval": "总间隔", Active: "活跃", Intermission: "间歇" }),
    target: target,
  });
  assert.equal(api.install(), true);

  assert.equal(target.fillText("Total interval", 10, 20), "fill-return");
  assert.equal(target.calls[0].text, "总间隔");
  assert.equal(target.calls[0].x, 10);
  assert.equal(target.calls[0].y, 20);
  assert.equal(target.calls[0].maxWidth, undefined);
  assert.equal(target.calls[0].count, 3);
  assert.equal(target.calls[0].self, target);

  assert.equal(target.strokeText("Intermission", 1, 2, 80), "stroke-return");
  assert.equal(target.calls[1].text, "间歇");
  assert.equal(target.calls[1].x, 1);
  assert.equal(target.calls[1].y, 2);
  assert.equal(target.calls[1].maxWidth, 80);
});

test("canvas text keeps misses, numbers, Chinese and non-string args unchanged", () => {
  let translateCalls = 0;
  const translate = canvasTranslator({ "Total interval": "总间隔" });
  const target = makeCanvasTarget();
  const api = runtime.canvasText.create({ translate: (text) => { translateCalls++; return translate(text); }, target: target });
  api.install();

  target.fillText("Unknown UI text", 0, 0);
  target.fillText("0", 0, 0);
  target.fillText("总间隔", 0, 0);
  target.fillText(42, 0, 0);

  assert.equal(target.calls.length, 4);
  assert.equal(target.calls[0].text, "Unknown UI text");
  assert.equal(target.calls[1].text, "0");
  assert.equal(target.calls[2].text, "总间隔");
  assert.equal(target.calls[3].text, 42);
  assert.equal(translateCalls, 3, "non-string text must not reach translate()");
});

test("canvas text keeps the original when translate returns the same string", () => {
  const target = makeCanvasTarget();
  const api = runtime.canvasText.create({ translate: (text) => text, target: target });
  api.install();
  target.fillText("Status Damage", 5, 6);
  assert.equal(target.calls[0].text, "Status Damage");
  assert.equal(target.calls[0].x, 5);
});

test("canvas measureText measures the translated text", () => {
  const target = makeCanvasTarget();
  const api = runtime.canvasText.create({ translate: canvasTranslator({ "Total interval": "总间隔" }), target: target });
  api.install();

  const metrics = target.measureText("Total interval");
  assert.equal(target.calls[0].method, "measureText");
  assert.equal(target.calls[0].text, "总间隔");
  assert.equal(metrics.width, 3);

  const miss = target.measureText("Unknown UI text");
  assert.equal(target.calls[1].text, "Unknown UI text");
  assert.equal(miss.width, "Unknown UI text".length);
});

test("canvas install is idempotent and does not double translate", () => {
  let translateCalls = 0;
  const translate = canvasTranslator({ Active: "活跃" });
  const target = makeCanvasTarget();
  const originalFill = target.fillText;
  const api = runtime.canvasText.create({ translate: (text) => { translateCalls++; return translate(text); }, target: target });

  assert.equal(api.install(), true);
  const wrappedFill = target.fillText;
  assert.notEqual(wrappedFill, originalFill);
  assert.equal(api.install(), false);
  assert.equal(target.fillText, wrappedFill);

  target.fillText("Active", 1, 2);
  assert.equal(target.calls[0].text, "活跃");
  assert.equal(target.calls[0].x, 1);
  assert.equal(translateCalls, 1);
});

test("canvas module is a no-op without CanvasRenderingContext2D", () => {
  const api = runtime.canvasText.create({ translate: canvasTranslator({ Active: "活跃" }) });
  assert.equal(api.install(), false);
  assert.equal(api.translateText("Active"), "活跃");
  assert.equal(api.translateText(7), 7);
  assert.equal(api.translateText("Unknown UI text"), "Unknown UI text");
});

test("canvas text falls back to the original when translate throws", () => {
  const target = makeCanvasTarget();
  const api = runtime.canvasText.create({ translate: () => { throw new Error("boom"); }, target: target });
  assert.equal(api.install(), true);
  assert.equal(target.fillText("Total interval", 3, 4), "fill-return");
  assert.equal(target.calls[0].text, "Total interval");
  assert.equal(target.calls[0].x, 3);
  assert.equal(target.measureText("Active").width, "Active".length);
});

test("attribute translation never rewrites an identical value (MutationObserver loop guard)", () => {
  // 回归：词典 "Ax-52" -> "AX-52"，小写兜底使 translate("AX-52") 返回自身；
  // DOM 层若把相同值再写回属性，会触发 MutationObserver 死循环（铸造厂曾整窗卡死）。
  const loopIndex = runtime.dictIndex.buildIndex({ "Ax-52": "AX-52" });
  const loopTranslate = runtime.translate.createTranslator(loopIndex).translate;
  assert.equal(loopTranslate("AX-52"), "AX-52");
  assert.equal(runtime.dom.nextAttributeValue("AX-52", loopTranslate), null);
  assert.equal(runtime.dom.nextAttributeValue("Ax-52", loopTranslate), "AX-52");

  // 正常变化的属性仍然写回。
  const normalIndex = runtime.dictIndex.buildIndex({ Search: "搜索" });
  const normalTranslate = runtime.translate.createTranslator(normalIndex).translate;
  assert.equal(runtime.dom.nextAttributeValue("Search", normalTranslate), "搜索");
});

test("archon cell text rebuilds the sentence without duplicating the icon alt", () => {
  const element = {
    childNodes: [
      { nodeType: 3, nodeValue: "+30% " },
      { nodeType: 1, tagName: "IMG", getAttribute: (name) => (name === "alt" ? "Toxin" : null) },
      { nodeType: 3, nodeValue: " Toxin Status Effect damage" },
    ],
  };
  const parts = runtime.features.archon.collectParts(element);
  assert.equal(parts.length, 3);
  assert.equal(runtime.features.archon.cellText(parts), "+30% Toxin Status Effect damage");
});

test("archon cell text keeps the icon alt when the text lacks the name", () => {
  const element = {
    childNodes: [
      { nodeType: 3, nodeValue: "+5 Shields per enemy killed with " },
      { nodeType: 1, tagName: "IMG", getAttribute: (name) => (name === "alt" ? "Blast" : null) },
      { nodeType: 3, nodeValue: " damage" },
    ],
  };
  const parts = runtime.features.archon.collectParts(element);
  assert.equal(runtime.features.archon.cellText(parts), "+5 Shields per enemy killed with Blast damage");
});

test("archon rebuild anchors the original icon before the translated label", () => {
  const img = { nodeType: 1, tagName: "IMG", getAttribute: (name) => (name === "alt" ? "Toxin" : null) };
  const parts = runtime.features.archon.collectParts({
    childNodes: [
      { nodeType: 3, nodeValue: "+30% " },
      img,
      { nodeType: 3, nodeValue: " Toxin Status Effect damage" },
    ],
  });
  const nodes = runtime.features.archon.rebuild(parts, "+30% 毒素异常状态造成伤害", (label) => (label === "Toxin" ? "毒素" : null));
  assert.deepEqual(Array.from(nodes, (node) => node.type), ["text", "img", "text"]);
  assert.equal(nodes[0].value, "+30% ");
  assert.equal(nodes[1].node, img);
  assert.equal(nodes[2].value, "毒素异常状态造成伤害");
});

test("archon rebuild keeps unknown icons instead of dropping them", () => {
  const img = { nodeType: 1, tagName: "IMG", getAttribute: () => null };
  const parts = runtime.features.archon.collectParts({
    childNodes: [
      { nodeType: 3, nodeValue: "+30% " },
      img,
      { nodeType: 3, nodeValue: " Toxin Status Effect damage" },
    ],
  });
  const nodes = runtime.features.archon.rebuild(parts, "+30% 毒素异常状态造成伤害", () => null);
  assert.equal(nodes[1].node, img);
  assert.equal(nodes[0].value, "");
  assert.equal(nodes[2].value, "+30% 毒素异常状态造成伤害");
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
