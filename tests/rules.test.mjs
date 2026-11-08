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
// 仲裁 Vitus 提示由三段英文拼成（祝福状态 + 模型说明 + 可选的波次估算补充句），
// 规则输出依赖这三段能被 translate() 命中，所以测试索引里放同样的键。
const VITUS_MODEL =
  "Uses the arbi.guide model with resource and drop-chance boosters, Resourceful Retriever at 18%, " +
  "and every observed drone killed and collected. Your Retriever cannot be confirmed from the log. " +
  "An unknown blessing shows a range.";
const DROP_ONLY_EXTRA = "This wave estimate includes drone drops only; its reward-cycle contribution is unconfirmed.";
const REWARD_EXTRA = "Includes the expected reward-cycle contribution earned in this wave.";
const index = runtime.dictIndex.buildIndex({
  "Critical Damage": "暴击伤害",
  "Damage to Corpus": "对 Corpus 伤害",
  Mercury: "水星",
  Earth: "地球",
  Venus: "金星",
  Deimos: "火卫二",
  Caches: "资源储藏舱",
  "Dark Refactory": "深溯池",
  "The Perita Rebellion": "佩里塔叛乱",
  "Profit-Taker": "利润收割者",
  "Entrati Lab Bounty": "英择谛实验室赏金",
  Entrati: "英择谛",
  Father: "父亲",
  "Vox Solaris": "索拉里斯之声",
  "Extended Granum Void": "扩展格拉努虚空",
  "Duviri Circuit": "双衍王境回廊",
  "Duviri Full Experience": "双衍王境完整体验",
  "Primary status chance": "主要武器触发几率",
  "Amber Archon Shard": "琥珀执刑官源力石",
  "+25% casting speed": "+25% 技能施放速度",
  // 仲裁实时窗口 / 共享 run-chart 规则依赖的词条（真实词典见 dict/entries/screens/arbitration.tsv）。
  "Total interval": "间隔总计",
  "Drone spawn rate": "无人机生成率",
  "Enemy spawns": "敌人生成次数",
  "Wave time": "波次时间",
  spawns: "次",
  "spawns/min": "生成/分钟",
  agents: "个",
  seconds: "秒",
  "game units": "游戏单位",
  "VE / min": "生息精华 / 分钟",
  "drones/min": "无人机/分钟",
  "N/A": "不适用",
  Defense: "防御",
  Mission: "任务",
  Host: "主机",
  Client: "客户端",
  "Drop blessing, unknown": "掉落祝福，未知",
  "Drop blessing, confirmation missing": "掉落祝福，缺少确认",
  // 主窗口仲裁规则依赖的词条（真实词典见 dict/entries/screens/arbitration.tsv）。
  "Perspective unknown": "视角未知",
  Mars: "火星",
  "Favorite nodes": "收藏节点",
  "Active waves": "活动波次",
  Intermissions: "间隔",
  Setup: "设置",
  Unclassified: "未分类",
  "Enemy and drone coordinates recorded in this log.": "此日志记录到的敌人与无人机坐标。",
  "Enemy spawn coordinates, drone positions are not present in this log.": "此日志没有无人机位置，仅记录敌人生成坐标。",
  "Hourly rates use observed gameplay time, including intermissions.": "每小时速率使用观测到的游玩时间，包含间隔。",
  "Sorting uses the lower estimate when a range is shown.": "显示范围时按较低的估算值排序。",
  "Enemy spawn rate": "敌人生成速率",
  "Drone spawns": "无人机生成次数",
  "Observed agents": "观测到的单位",
  Completed: "已完成",
  "Complete capture": "完整采集",
  "Recorded here": "记录于此",
  "Observed spawn events, not kills or drops.": "观测到的生成事件，不代表击杀或掉落。",
  "Times use observed mission boundaries.": "时间以观测到的任务边界为准。",
  "Drop blessing expired": "掉落祝福已过期",
  [VITUS_MODEL]: "模型说明",
  [DROP_ONLY_EXTRA]: "仅掉落说明",
  [REWARD_EXTRA]: "含奖励说明",
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

test("rule table size is 127", () => {
  assert.equal(runtime.rules.list.length, 127);
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

// ---- 资源掉落来源（星球名/地图名（任务名），轮次名） ----

test("resource drop source composes planet, node, mission and rotation", () => {
  assert.equal(translate("Mars/Gradivus (Caches), Rotation B"), "火星/Gradivus（资源储藏舱），轮次 B");
  assert.equal(translate("Mercury/Neruda (Caches), Rotation B"), "水星/Neruda（资源储藏舱），轮次 B");
});

test("resource drop source without mission or rotation", () => {
  assert.equal(translate("Earth/Cetus, Rotation A"), "地球/Cetus，轮次 A");
  assert.equal(translate("Mars/Gradivus (Caches)"), "火星/Gradivus（资源储藏舱）");
});

test("resource rotation suffix", () => {
  assert.equal(translate("Rotation C"), "轮次 C");
});

test("resource drop source stays English when the planet is unknown", () => {
  assert.equal(translate("Foo/Bar (Caches), Rotation B"), null);
});

test("resource drop source with prefix and compound mission", () => {
  assert.equal(
    translate("Dark Refactory, Deimos/Recall: Dactolyst (The Perita Rebellion), Rotation A"),
    "深溯池，火卫二/Recall: Dactolyst（佩里塔叛乱），轮次 A"
  );
});

test("resource drop source with level range and phase", () => {
  assert.equal(
    translate("Venus/Orb Vallis (Level 40 - 60 PROFIT-TAKER - PHASE 1), Rotation C"),
    "金星/Orb Vallis（等级 40 - 60 利润收割者 - 阶段 1），轮次 C"
  );
  assert.equal(
    translate("Deimos/Albrecht's Laboratories (Level 115 - 120 Entrati Lab Bounty), Rotation C"),
    "火卫二/Albrecht's Laboratories（等级 115 - 120 英择谛实验室赏金），轮次 C"
  );
});

test("resource standalone sources and vendor/faction formats", () => {
  assert.equal(translate("Duviri Circuit"), "双衍王境回廊");
  assert.equal(translate("Duviri Full Experience"), "双衍王境完整体验");
  assert.equal(translate("Extended Granum Void, Rotation A"), "扩展格拉努虚空，轮次 A");
  assert.equal(translate("Entrati (Father), Neutral"), "英择谛（父亲），中立");
  assert.equal(translate("Vox Solaris, Agent"), "索拉里斯之声，代理人");
});

test("resource prefixed source stays English when the prefix is unknown", () => {
  assert.equal(translate("Unknown Prefix, Mars/Gradivus (Caches), Rotation B"), null);
});

// ---- 仲裁实时窗口 / 共享 run-chart 动态文本 ----

test("arbitration wave/rotation number labels", () => {
  assert.equal(translate("Wave 3"), "第 3 波");
  assert.equal(translate("Rotation 2"), "第 2 轮");
});

test("arbitration wave recap title", () => {
  assert.equal(translate("Wave 3 complete"), "第 3 波完成");
});

test("arbitration completed counters", () => {
  assert.equal(translate("Waves completed"), "已完成波次");
  assert.equal(translate("Rotations completed"), "已完成轮次");
});

test("arbitration timing headings", () => {
  assert.equal(translate("Wave timing"), "波次计时");
  assert.equal(translate("Rotation timing"), "轮次计时");
});

test("arbitration recent drone counts", () => {
  assert.equal(translate("12 spawned in the last minute"), "最近 1 分钟生成 12 个");
  assert.equal(translate("12 in last min"), "最近 1 分钟 12 个");
});

test("arbitration header suffix and version", () => {
  assert.equal(translate(", Defense"), "，防御");
  assert.equal(translate(", Host"), "，主机");
  // 纯版本号不含拉丁字母，翻译链不进入规则（保持 ", 3.0.6"）。
  assert.equal(translate(", 3.0.6"), null);
});

test("arbitration header suffix stays English when the value is unknown", () => {
  assert.equal(translate(", Unknown Mode"), null);
});

test("arbitration compact unit strings", () => {
  assert.equal(translate("4.2 drones/min"), "4.2 无人机/分钟");
  assert.equal(translate("5.2–6.1 VE / min"), "5.2–6.1 生息精华 / 分钟");
  assert.equal(translate("5 s"), "5 秒");
});

test("arbitration Vitus tooltip composition", () => {
  assert.equal(translate("Drop blessing, unknown. " + VITUS_MODEL), "掉落祝福，未知。模型说明。");
  assert.equal(
    translate("Drop blessing, unknown. " + VITUS_MODEL + " " + DROP_ONLY_EXTRA),
    "掉落祝福，未知。模型说明。仅掉落说明。"
  );
  assert.equal(
    translate("Drop blessing, 2:30 left. " + VITUS_MODEL + " " + REWARD_EXTRA),
    "掉落祝福剩余 2:30。模型说明。含奖励说明。"
  );
});

test("arbitration Vitus tooltip does not translate half-unknown blessing", () => {
  assert.equal(translate("Drop blessing, odd state. " + VITUS_MODEL), null);
});

test("chart tooltip duration format", () => {
  assert.equal(translate("Total interval: 2:30"), "间隔总计：2:30");
  assert.equal(translate("Wave time: 1:05"), "波次时间：1:05");
});

test("chart tooltip unit format", () => {
  assert.equal(translate("Drone spawn rate: 6 spawns/min"), "无人机生成率：6 生成/分钟");
  assert.equal(translate("Enemy spawns: 1,234 sparkles"), null);
});

test("chart tooltip empty unit format", () => {
  assert.equal(translate("Enemy spawns: 12 "), "敌人生成次数：12");
});

test("spawn map canvas distance label", () => {
  assert.equal(translate("100 game units"), "100 游戏单位");
  assert.equal(translate("0.01 game units"), "0.01 游戏单位");
});

// ---- 主窗口仲裁：日期/时间/倒计时（Vue 合并文本节点） ----

test("main window weekdays, clock time and dates", () => {
  assert.equal(translate("Mon"), "周一");
  assert.equal(translate("Sun"), "周日");
  assert.equal(translate("09:14 PM"), "21:14");
  assert.equal(translate("12:00 AM"), "00:00");
  assert.equal(translate("12:30 PM"), "12:30");
  assert.equal(translate("Nov 4, 09:14 PM"), "11 月 4 日 21:14");
  assert.equal(translate("Nov 4, 2026, 09:14 PM"), "2026 年 11 月 4 日 21:14");
  assert.equal(translate("Mon, Nov 4"), "周一，11 月 4 日");
  // 现有 stats.today/stats.month-day 组合已覆盖 "Today, Nov 4"。
  assert.equal(translate("Today, Nov 4"), "今天，11 月 4 日");
});

test("main window countdown durations", () => {
  assert.equal(translate("2h 30m"), "2 小时 30 分");
  assert.equal(translate("2d 3h"), "2 天 3 小时");
  assert.equal(translate("45m 12s"), "45 分 12 秒");
  assert.equal(translate("0m 05s"), "0 分 05 秒");
  // 嵌套：generic.in / generic.starts-at 会翻译剩余部分。
  assert.equal(translate("In 2h 30m"), "剩余 2 小时 30 分");
  assert.equal(translate("Starts at 09:14 PM"), "开始于 21:14");
});

test("main window run hero/row date lines", () => {
  assert.equal(translate("Defense, Nov 4, 2026, 09:14 PM, Perspective unknown"), "防御，2026 年 11 月 4 日 21:14，视角未知");
  assert.equal(translate("Defense, Nov 4, 2026, 09:14 PM, Host"), "防御，2026 年 11 月 4 日 21:14，主机");
  assert.equal(translate("Defense, Nov 4, 2026, 09:14 PM"), "防御，2026 年 11 月 4 日 21:14");
  assert.equal(translate("Nov 4, 09:14 PM, 12:34"), "11 月 4 日 21:14，12:34");
  assert.equal(translate("Lares, Mercury, 0:10 – 2:30"), "Lares，水星，0:10 – 2:30");
});

test("main window capture metrics", () => {
  assert.equal(translate("5:42 full capture"), "5:42 完整采集");
  assert.equal(translate("12.3 / capture min"), "12.3 / 采集分钟");
  assert.equal(translate("— / capture min"), "— / 采集分钟");
  assert.equal(translate("123.4 / hour"), "123.4 / 小时");
  assert.equal(translate("— / hour"), "— / 小时");
  assert.equal(translate("2:30 median"), "2:30 中位数");
  assert.equal(translate("3 waves"), "3 波次");
  assert.equal(translate("2 rotations"), "2 轮次");
  assert.equal(translate("12:34, 3 waves"), "12:34，3 波次");
  assert.equal(translate("12:34, No complete intervals"), "12:34，没有完整间隔");
});

test("main window spawn map readouts", () => {
  assert.equal(translate("12 positions"), "12 个位置");
  assert.equal(translate("7 / cell"), "7 / 格");
  assert.equal(translate("12 spawns in this cell"), "此格内有 12 次生成");
  assert.equal(translate("2:30, wave 3"), "2:30，第 3 波");
  assert.equal(translate("Hover a cell to inspect"), "悬停查看某一格");
  assert.equal(translate("Hover a point to inspect"), "悬停查看某一点");
  assert.equal(
    translate("Enemy and drone coordinates recorded in this log. Equal scale on both axes"),
    "此日志记录到的敌人与无人机坐标。两轴等比例"
  );
  assert.equal(
    translate("Enemy spawn coordinates, drone positions are not present in this log. Equal scale on both axes"),
    "此日志没有无人机位置，仅记录敌人生成坐标。两轴等比例"
  );
});

test("main window schedule preferences summary", () => {
  assert.equal(translate("S, community farming tier"), "S，社区刷取档位");
  assert.equal(translate("Unrated, community farming tier"), "未评级，社区刷取档位");
  assert.equal(translate("3 selected"), "已选 3 个");
  assert.equal(translate("3 nodes in your favorites"), "收藏中有 3 个节点");
  assert.equal(translate("5 upcoming rotations in seven days"), "未来七天有 5 个轮次");
  assert.equal(translate("4 saved for quick filtering"), "已保存 4 个，便于快速筛选");
  assert.equal(translate("S, A tiers"), "S, A 档位");
  assert.equal(translate("Defense, Favorite nodes"), "防御，收藏节点");
  assert.equal(translate("Defense, Mars, 3 selected nodes"), "防御，火星，已选 3 个节点");
  assert.equal(
    translate("Defense, Mars, S, A tiers, 3 selected nodes, Favorite nodes"),
    "防御，火星，S, A 档位，已选 3 个节点，收藏节点"
  );
  assert.equal(translate("Reminder saved for Lares, Nov 4, 09:14 PM."), "已保存提醒：Lares，11 月 4 日 21:14。");
  assert.equal(translate("Open live Arbitration, Lares"), "打开实时仲裁：Lares");
});

test("main window wave panel and tooltips", () => {
  assert.equal(translate("Wave 3, 2:30"), "第 3 波，2:30");
  assert.equal(
    translate("Wave 3, 0:10 – 2:30 Total 140s Active 120s, intermission 20s"),
    "第 3 波，0:10 – 2:30 总计 140 秒 活跃 120 秒，间歇 20 秒"
  );
  assert.equal(
    translate("Wave 3, 0:10 – 2:30 Total 140s Active 120s, intermission 20s 5 observed drones"),
    "第 3 波，0:10 – 2:30 总计 140 秒 活跃 120 秒，间歇 20 秒 观测到 5 架无人机"
  );
  assert.equal(translate("Active waves, 2:30"), "活动波次，2:30");
  assert.equal(translate("Intermissions, 0:20"), "间隔，0:20");
  assert.equal(translate("2:30, +0:05 above median"), "2:30，比中位数多 +0:05");
  assert.equal(translate("Observed intermission 0:10"), "观测到的间歇 0:10");
  assert.equal(translate("12 observed spawns in range"), "范围内观测到 12 次生成");
  assert.equal(translate("Entire run, 42 creations"), "整局，42 个创建");
  assert.equal(translate("Show all 12 types"), "显示全部 12 种类型");
  assert.equal(translate("0s to 5s, 12 intervals"), "0 秒到 5 秒，12 个间隔");
  assert.equal(translate("3 events"), "3 个事件");
  assert.equal(translate("Enemy spawns —"), "敌人生成次数 —");
  assert.equal(translate("Enemy spawn rate 6.2"), "敌人生成速率 6.2");
});

test("main window import evidence and toasts", () => {
  assert.equal(translate("Last import, 12 added, 3 duplicates"), "上次导入：新增 12，3 条重复");
  assert.equal(translate("3 partial captures preserved"), "保留 3 条部分采集");
  assert.equal(translate(", import cancelled"), "，导入已取消");
  assert.equal(translate(", 12 / 100 files"), "，12 / 100 个文件");
  assert.equal(translate("12 runs added, 3 already saved."), "新增 12 条记录，3 条已保存。");
});

test("main window vitus estimation tooltip", () => {
  assert.equal(
    translate(VITUS_MODEL + " Hourly rates use observed gameplay time, including intermissions."),
    "模型说明 每小时速率使用观测到的游玩时间，包含间隔。"
  );
  assert.equal(
    translate(VITUS_MODEL + " Hourly rates use observed gameplay time, including intermissions. Sorting uses the lower estimate when a range is shown."),
    "模型说明 每小时速率使用观测到的游玩时间，包含间隔。 显示范围时按较低的估算值排序。"
  );
  assert.equal(translate("Expected Vitus unavailable, gameplay timing is missing."), null);
});

test("main window earnings panel model lines", () => {
  assert.equal(translate("4 timed runs, weighted by duration"), "4 条计时记录，按持续时间加权");
  assert.equal(translate("Segment 1"), "分段 1");
  assert.equal(translate("Approximate 95% model range, 10–20 Vitus."), "模型近似 95% 区间，10–20 生息精华。");
  assert.equal(
    translate("Standard deviation 3.2 Vitus. This is a conditional estimate, not an exact luck percentile or a measured drop rate."),
    "标准差 3.2 生息精华。这是条件估算，不是精确的运气百分位或实测掉率。"
  );
  assert.equal(translate("Recorded locally, complete capture"), "本地记录，完整采集");
  assert.equal(translate("Imported, partial capture"), "已导入，部分采集");
});

test("main window image-preview canvas strings", () => {
  assert.equal(translate("Enemy spawn rate, spawns/min, full run"), "敌人生成速率，生成/分钟，完整一局");
  assert.equal(translate("Completed, Complete capture, Recorded here"), "已完成，完整采集，记录于此");
  assert.equal(
    translate("Observed spawn events, not kills or drops. Times use observed mission boundaries."),
    "观测到的生成事件，不代表击杀或掉落。 时间以观测到的任务边界为准。"
  );
  assert.equal(
    translate("Names included where available, AlecaFrame, parser 1, game version unknown"),
    "名称包含（如有），AlecaFrame，解析器 1，游戏版本未知"
  );
  assert.equal(translate("Names hidden, AlecaFrame, parser 1, 38.0.0"), "名称隐藏，AlecaFrame，解析器 1，游戏版本 38.0.0");
});

test("main window rules stay narrow", () => {
  // 不宽泛匹配：没有单位/格式的裸句子仍保持未翻译（由词条处理）。
  assert.equal(translate("Wave span"), null);
  assert.equal(translate("Some untranslated main window text"), null);
  assert.equal(translate("Defense, Nov 4"), null);
  assert.equal(translate("3 selected nodes"), null);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
