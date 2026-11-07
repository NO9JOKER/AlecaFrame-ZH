/* AlecaFrame-ZH runtime · rules
 * Ordered translation rules for dynamic text (numbers, dates, shards, riven).
 * Each rule is { id, match(text, translate) -> string|null }; first hit wins.
 */
(function (root) {
  "use strict";

  const runtime = (root.__AFCN_RUNTIME__ = root.__AFCN_RUNTIME__ || {});
  const helpers = runtime.normalize;
  if (!helpers) throw new Error("rules requires core.normalize");

  const MONTHS = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
    January: 1, February: 2, March: 3, April: 4, June: 6, July: 7, August: 8, September: 9,
    October: 10, November: 11, December: 12,
  };
  const MONTH_RE = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
  const NUM = "(\\d[\\d,]*(?:\\.\\d+)?)";
  const DAMAGE_LABELS = new Set([
    "火焰", "冰冻", "寒冷", "毒素", "电击", "切割", "冲击", "穿刺",
    "爆炸", "磁力", "毒气", "病毒", "腐蚀", "辐射",
  ]);

  function fmtMonth(month) {
    return MONTHS[month] + " 月";
  }

  function rule(id, expression, fn) {
    return {
      id: id,
      match: function (text, translate) {
        const match = String(text || "").match(expression);
        if (!match) return null;
        const rec = match[1] ? translate(match[1]) : null;
        return fn(match, rec, translate);
      },
    };
  }

  const list = [
    rule("riven.match-percent", /^(\d+(?:\.\d+)?)% match$/, (m) => m[1] + "% 匹配"),
    rule("shard.view", /^View (.+) shards$/, (m, _rec, tr) => "查看" + (tr(m[1]) ?? m[1]) + "源力石"),
    rule("shard.stela-now", /^(\d+) Stela, (\d+) possible now$/, (m) => m[1] + " 虚空石块，当前可用 " + m[2] + " 次"),
    rule("shard.stela-mixed", /^(\d+) Stela, (\d+) regular, (\d+) Tauforged$/, (m) => m[1] + " 虚空石块，" + m[2] + " 普通，" + m[3] + " TAU源力石"),
    rule("shard.stela-tauforged", /^(\d+) Stela, (\d+) Tauforged$/, (m) => m[1] + " 虚空石块，" + m[2] + " TAU源力石"),
    rule("shard.more-effects", /^\+(\d+) more effects$/, (m) => "另有 " + m[1] + " 种效果"),
    rule("shard.effects", /^(.+) effects$/, (m, _rec, tr) => (tr(m[1]) ?? m[1]) + "效果"),
    rule("shard.find-warframes", /^Find Warframes using (.+)$/, (m, _rec, tr) => "查找使用「" + (tr(m[1]) ?? m[1]) + "」的战甲"),
    rule("shard.installed", /^(\d+) \/ 5 installed(?:, (\d+) Tauforged)?$/, (m) => m[1] + " / 5 已安装" + (m[2] ? "，" + m[2] + " TAU源力石" : "")),
    rule("shard.slots", /^(\d+) \/ 5 slots(?:, (\d+) Tauforged)?$/, (m) => m[1] + " / 5 槽位" + (m[2] ? "，" + m[2] + " TAU源力石" : "")),
    rule("shard.tauforged", /^Tauforged (.+)$/, (m, _rec, tr) => (tr(m[1]) ?? m[1]) + " TAU源力石"),
    rule("shard.installed-on", /^Installed on (\d+) Warframes$/, (m) => "已安装在 " + m[1] + " 个战甲上"),
    rule("generic.copy", /^Copy (\d+)$/, (m) => "复制 " + m[1]),
    rule("riven.percent-attr", /^([+-]?\d[\d,]*(?:\.\d+)?%)\s+(.+)$/, (m, _rec, tr) => {
      const raw = m[2].trim();
      const translated = tr(raw);
      const label = translated === null ? raw : translated;
      const damage = DAMAGE_LABELS.has(label);
      if (translated === null && !damage) return null;
      return m[1] + " " + label + (damage ? "伤害" : "");
    }),
    rule("riven.multiplier", /^x(\d+(?:\.\d+)?)\s+(.+)$/, (m, _rec, tr) => {
      const label = tr(m[2]);
      return label === null ? null : "x" + m[1] + " " + label;
    }),
    rule("riven.signed-attr", /^([+\-\u2212\u2013\u2014\uFF0D])\s*([A-Za-z][^\d].*)$/, (m, _rec, tr) => {
      const label = tr(m[2]);
      if (label === null) return null;
      const sign = "+-\u2212\u2013\u2014\uFF0D".indexOf(m[1]) === 0 ? "+" : "-";
      return sign + label;
    }),
    rule("stats.last-record", /^Last record: (.+)$/, (m, rec) => "最后记录：" + (rec || m[1])),
    rule("stats.today", /^Today, (.+)$/, (m, rec) => "今天，" + (rec || m[1])),
    rule("stats.tomorrow", /^Tomorrow, (.+)$/, (m, rec) => "明天，" + (rec || m[1])),
    rule("stats.month-year", new RegExp("^" + MONTH_RE + " (\\d{4})$"), (m) => m[2] + " 年 " + fmtMonth(m[1])),
    rule("stats.month-day", new RegExp("^" + MONTH_RE + " (\\d{1,2})(?:, (\\d{4}))?$"), (m) => (m[3] ? m[3] + " 年 " : "") + fmtMonth(m[1]) + " " + m[2] + " 日"),
    rule("stats.recorded-days", new RegExp("^" + NUM + " recorded days(?: in range)?$"), (m) => m[1] + " 天已记录"),
    rule("stats.recorded", new RegExp("^" + NUM + " recorded$"), (m) => "已记录 " + m[1]),
    rule("stats.copies-remaining", new RegExp("^" + NUM + " copies remaining$"), (m) => "剩余 " + m[1] + " 张"),
    rule("generic.rank-slash-space", /^Rank (\d+) \/ (\d+)$/, (m) => "等级 " + m[1] + " / " + m[2]),
    rule("generic.rank-slash", /^Rank (\d+)\/(\d+)$/, (m) => "等级 " + m[1] + "/" + m[2]),
    rule("generic.owned-copies", /^Owned, (\d+) copies?$/, (m) => "已拥有 " + m[1] + " 张"),
    rule("generic.ready", new RegExp("^" + NUM + " ready to upgrade$"), (m) => m[1] + " 个可升级"),
    rule("generic.mr", /^MR (\d+)$/, (m) => "段位 " + m[1]),
    rule("generic.endo", new RegExp("^" + NUM + " Endo to max$"), (m) => m[1] + " 内融核心至满级"),
    rule("generic.credits", new RegExp("^" + NUM + " credits to max$"), (m) => m[1] + " 星币至满级"),
    rule("generic.extra", new RegExp("^" + NUM + " extra to spare$"), (m) => m[1] + " 额外可用"),
    rule("generic.still-needed", new RegExp("^" + NUM + " still needed$"), (m) => "仍需 " + m[1]),
    rule("generic.to-keep", new RegExp("^" + NUM + " to keep$"), (m) => "保留 " + m[1]),
    rule("generic.to-max", new RegExp("^" + NUM + " to max$"), (m) => m[1] + " 至满级"),
    rule("generic.mods", new RegExp("^" + NUM + " mods$"), (m) => m[1] + " 个 MOD"),
    rule("generic.owned-types", new RegExp("^" + NUM + " owned types$"), (m) => "已拥有 " + m[1] + " 种"),
    rule("generic.orders", new RegExp("^" + NUM + " orders$"), (m) => m[1] + " 个订单"),
    rule("generic.multiplied-item", /^(\d+(?:\.\d+)?)x (.+)$/, (m, rec) => m[1] + " 个 " + (rec || m[2])),
    rule("generic.starts-at", /^Starts at (.+)$/, (m, rec) => "开始于 " + (rec || m[1])),
    rule("generic.in", /^In (.+)$/, (m, rec) => "剩余 " + (rec || m[1])),
  ];

  runtime.rules = { list: list };
})(typeof globalThis !== "undefined" ? globalThis : this);
