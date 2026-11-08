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

  // ---- 主窗口仲裁规则用的小工具：月份/日期/时间/倒计时/秒标签 ----
  // 主窗口日期来自 toLocaleString(undefined, {...})（宿主是 en-US 格式），
  // 与 Warframe 无关，只用于仲裁界面；不放进词典，避免污染其它屏。
  const ARB_MONTH = { Jan: "1 月", Feb: "2 月", Mar: "3 月", Apr: "4 月", May: "5 月", Jun: "6 月", Jul: "7 月", Aug: "8 月", Sep: "9 月", Oct: "10 月", Nov: "11 月", Dec: "12 月" };
  const ARB_MONTH_RE = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
  const ARB_NUM_RE = "(\\d[\\d,]*(?:\\.\\d+)?)";
  const ARB_ELAPSED_RE = "(\\d[\\d,]*:\\d{2}(?::\\d{2})?)";
  const ARB_SECONDS_RE = "(\\d[\\d,]*(?:\\.\\d+)?s|—)";
  const ARB_WEEKDAY = { Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五", Sat: "周六", Sun: "周日" };
  function arbDate(month, day, year) {
    return (year ? year + " 年 " : "") + ARB_MONTH[month] + " " + day + " 日";
  }
  function arbTime(hm, ap) {
    if (!ap) return hm;
    const parts = hm.split(":");
    let hour = Number(parts[0]);
    if (ap === "PM" && hour < 12) hour += 12;
    if (ap === "AM" && hour === 12) hour = 0;
    return String(hour).padStart(2, "0") + ":" + parts[1];
  }
  function arbSeconds(value) {
    return value.endsWith("s") ? value.slice(0, -1) + " 秒" : value;
  }

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
    // 槽位提示是「源力石名, 效果名」；必须排在 shard.tauforged 之前，否则整串会被当成 Tauforged 前缀。
    rule("shard.slot-title", /^((?:Tauforged )?[A-Za-z]+ Archon Shard), (.+)$/, (m, _rec, tr) => {
      const name = tr(m[1]);
      const detail = tr(m[2]);
      return typeof name === "string" && typeof detail === "string" ? name + "，" + detail : null;
    }),
    rule("shard.empty-slot", /^Empty slot (\d+)$/, (m) => "空槽位 " + m[1]),
    rule("shard.stela-single", /^(\d[\d,]*) Stela$/, (m) => m[1] + " 虚空石块"),
    rule("shard.frame-copy", /^Copy (\d+), (.+)$/, (m, _rec, tr) => {
      const rest = tr(m[2]);
      return typeof rest === "string" ? "复制 " + m[1] + "，" + rest : null;
    }),
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
    // ---- 仲裁实时窗口 / 运行记录（共享 run-chart）动态文本 ----
    // Vue 会把相邻静态文本与插值合并成单个文本节点（如 "Waves completed"、
    // ", Defense"、"Wave 3 complete"），Canvas 提示是 "label: 值 单位" 整串。
    // 这些串落在词典精确匹配之外，只能整串锚定；需要翻译的子串必须 translate()
    // 命中才返回，否则返回 null（不半翻）。顺序：组合长串 → 具体标签 → 通用格式。
    // 位置：必须在 riven.signed-attr 之前 —— 那条「符号+文本」宽规则会先吞掉
    // 未知估算值的 "— VE / min"（em dash 被当成减号）。
    rule(
      "arbitration.vitus-title",
      // vitusTitle = 祝福状态 + ". " + 模型说明 [+ 波次估算补充句]，拼成 title 属性后才翻译。
      /^(Drop blessing[^.]*)\. (Uses the arbi\.guide model[\s\S]+?)(?: (This wave estimate includes drone drops only; its reward-cycle contribution is unconfirmed\.|Includes the expected reward-cycle contribution earned in this wave\.))?$/,
      (m, _rec, tr) => {
        const left = /^Drop blessing, (\d+:\d{2}(?::\d{2})?) left$/.exec(m[1]);
        const blessing = left ? "掉落祝福剩余 " + left[1] : tr(m[1]);
        const model = tr(m[2]);
        if (typeof blessing !== "string" || typeof model !== "string") return null;
        const extra = m[3] ? tr(m[3]) : null;
        if (m[3] && typeof extra !== "string") return null;
        return blessing + "。" + model + "。" + (m[3] ? extra + "。" : "");
      }
    ),
    rule("arbitration.wave-complete", /^Wave (\d+) complete$/, (m) => "第 " + m[1] + " 波完成"),
    rule("arbitration.completed-count", /^(Waves|Rotations) completed$/, (m) => (m[1] === "Waves" ? "已完成波次" : "已完成轮次")),
    rule("arbitration.timing-heading", /^(Wave|Rotation) timing$/, (m) => (m[1] === "Wave" ? "波次计时" : "轮次计时")),
    // liveTiming 的 detail/label、selectedInterval 标题、run-chart 提示标题共用 "Wave 3" 形式。
    // 不经过 translate("Wave")：该词条来自 Warframe 表情名（挥手），在仲裁语境是错译。
    rule("arbitration.wave-rotation-number", /^(Wave|Rotation) (\d+)$/, (m) => "第 " + m[2] + (m[1] === "Wave" ? " 波" : " 轮")),
    rule("arbitration.last-minute-compact", /^(\d[\d,]*) in last min$/, (m) => "最近 1 分钟 " + m[1] + " 个"),
    rule("arbitration.last-minute", /^(\d[\d,]*) spawned in the last minute$/, (m) => "最近 1 分钟生成 " + m[1] + " 个"),
    rule("arbitration.drone-rate-per-minute", /^((?:\d[\d,.]*)|N\/A) drones\/min$/, (m, _rec, tr) => {
      const value = m[1] === "N/A" ? tr("N/A") : m[1];
      const unit = tr("drones/min");
      return typeof value === "string" && typeof unit === "string" ? value + " " + unit : null;
    }),
    rule("arbitration.ve-per-minute", /^(.+) (VE \/ min)$/, (m, _rec, tr) => {
      // 值只可能是数字、数字范围（5.2–6.1）或未知（—），避免误伤普通句子。
      if (!/^(?:\u2014|\d[\d,.]*(?:[\u2013-]\d[\d,.]*)?)$/.test(m[1])) return null;
      const unit = tr(m[2]);
      return typeof unit === "string" ? m[1] + " " + unit : null;
    }),
    // 头部 ", Defense" / ", Host"：Vue 把 ", " 与插值合并成单个文本节点。
    // 纯版本号的 ", 3.0.6" 不含拉丁字母，translation 链不会进入规则，保持原样。
    rule("arbitration.header-suffix", /^, ([A-Za-z][A-Za-z0-9 .'\u2019\-–]{1,40})$/, (m, _rec, tr) => {
      const rest = tr(m[1]);
      return typeof rest === "string" ? "，" + rest : null;
    }),
    rule("arbitration.map-game-units", /^([\d,.]+) game units$/, (m, _rec, tr) => {
      const unit = tr("game units");
      return typeof unit === "string" ? m[1] + " " + unit : null;
    }),
    rule("arbitration.seconds-unit", /^(\d+) s$/, (m) => m[1] + " 秒"),
    // 以下三条是共享 run-chart 的 Canvas tooltip 格式（主窗口与实时窗口同款组件）：
    //   时长 dataset:  "Total interval: 2:30"（durationValues 用 elapsed()）
    //   单位 dataset:  "Drone spawn rate: 6 spawns/min"（label + ": " + 数字 + " " + unit）
    //   空单位 dataset: "Enemy spawns: 12"（unit 为空，归一后无尾随空格）
    rule("arbitration.chart-tooltip-duration", /^([A-Za-z][^:]{0,59}): (\d+:\d{2}(?::\d{2})?)$/, (m, _rec, tr) => {
      const label = tr(m[1]);
      return typeof label === "string" ? label + "：" + m[2] : null;
    }),
    rule("arbitration.chart-tooltip-unit", /^([A-Za-z][^:]{0,59}): ([\d,.]+) ([A-Za-z][A-Za-z0-9/%._-]*)$/, (m, _rec, tr) => {
      const label = tr(m[1]);
      const unit = tr(m[3]);
      return typeof label === "string" && typeof unit === "string" ? label + "：" + m[2] + " " + unit : null;
    }),
    rule("arbitration.chart-tooltip-no-unit", /^([A-Za-z][^:]{0,59}): ([\d,.]+)$/, (m, _rec, tr) => {
      const label = tr(m[1]);
      return typeof label === "string" ? label + "：" + m[2] : null;
    }),
    // ---- 主窗口仲裁界面：Vue 合并文本节点 / 日期时间 / Canvas 文本 ----
    // 主窗口模板（main_parts/arbitrations.html、arbitrationRuns.js 等）里相邻静态文本
    // 与插值会被 Vue 合并成单个文本节点（如 "5:42 full capture"、", wave 3"、
    // "Defense, Nov 4, 2026, 09:14 PM, Perspective unknown"），词典精确匹配覆盖不到，
    // 只能整串锚定。需要翻译的子串必须 translate() 命中，否则返回 null（不半翻）。
    // 注意：不要通过 translate("Wave")/translate("Rotation") 取标签 —— 词典里 Wave
    // 是表情名「挥手」；波次/轮次一律在本规则块内写死或整串词条。
    // 注意：rule() 会对 match[1] 先做一次 translate()，整串捕获会自递归，因此用 m[0] 查表。
    rule("arbitration.main-weekday", /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/, (m) => ARB_WEEKDAY[m[0]]),
    rule("arbitration.main-clock-time", /^(\d{1,2}:\d{2}) (AM|PM)$/, (m) => arbTime(m[1], m[2])),
    rule("arbitration.main-short-date-time", new RegExp("^" + ARB_MONTH_RE + " (\\d{1,2}), (\\d{1,2}:\\d{2}) (AM|PM)$"), (m) => arbDate(m[1], m[2]) + " " + arbTime(m[3], m[4])),
    rule("arbitration.main-date-time", new RegExp("^" + ARB_MONTH_RE + " (\\d{1,2}), (\\d{4}), (\\d{1,2}:\\d{2}) (AM|PM)$"), (m) => arbDate(m[1], m[2], m[3]) + " " + arbTime(m[4], m[5])),
    rule("arbitration.main-day-date", new RegExp("^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Today|Tomorrow), " + ARB_MONTH_RE + " (\\d{1,2})$"), (m, _rec, tr) => {
      const label = tr(m[1]) ?? ARB_WEEKDAY[m[1]];
      return typeof label === "string" ? label + "，" + arbDate(m[2], m[3]) : null;
    }),
    rule("arbitration.main-countdown", /^\d+[dhms](?: \d+[dhms])*$/, (m) => {
      const units = { d: "天", h: "小时", m: "分", s: "秒" };
      return m[0].split(" ").map((part) => {
        const token = /^(\d+)([dhms])$/.exec(part);
        return token[1] + " " + units[token[2]];
      }).join(" ");
    }),
    rule("arbitration.main-run-hero-subtitle", new RegExp("^(.+), " + ARB_MONTH_RE + " (\\d{1,2}), (\\d{4}), (\\d{1,2}:\\d{2}) (AM|PM), (Host|Client|Perspective unknown)$"), (m, _rec, tr) => {
      const host = tr(m[7]);
      // 前缀是任务类型（如 Defense）；节点名不在此串。翻不出时保留原文，不半翻日期。
      const mission = tr(m[1]) ?? m[1];
      return typeof host === "string" ? mission + "，" + arbDate(m[2], m[3], m[4]) + " " + arbTime(m[5], m[6]) + "，" + host : null;
    }),
    rule("arbitration.main-run-row-identity", new RegExp("^(.+), " + ARB_MONTH_RE + " (\\d{1,2}), (\\d{4}), (\\d{1,2}:\\d{2}) (AM|PM)$"), (m, _rec, tr) => {
      // 前缀可能是任务类型，也可能是「节点, 星球」；交给 translate()（含 composite）处理。
      const head = tr(m[1]) ?? m[1];
      return head + "，" + arbDate(m[2], m[3], m[4]) + " " + arbTime(m[5], m[6]);
    }),
    rule("arbitration.main-metric-interval-date", new RegExp("^" + ARB_MONTH_RE + " (\\d{1,2}), (\\d{1,2}:\\d{2}) (AM|PM), " + ARB_ELAPSED_RE + "$"), (m) => arbDate(m[1], m[2]) + " " + arbTime(m[3], m[4]) + "，" + m[5]),
    rule("arbitration.main-full-capture", new RegExp("^" + ARB_ELAPSED_RE + " full capture$"), (m) => m[1] + " 完整采集"),
    // format() 对未知值返回 "—"：同样翻成「— / 采集分钟」「— / 小时」，不要留英文。
    rule("arbitration.main-capture-min", new RegExp("^(\\u2014|-|\\d[\\d,]*(?:\\.\\d+)?) / capture min$"), (m) => m[1] + " / 采集分钟"),
    rule("arbitration.main-interval-count", new RegExp("^" + ARB_NUM_RE + " (waves|rotations)$"), (m) => m[1] + " " + (m[2] === "waves" ? "波次" : "轮次")),
    rule("arbitration.main-duration-interval-count", new RegExp("^" + ARB_ELAPSED_RE + ", " + ARB_NUM_RE + " (waves|rotations)$"), (m) => m[1] + "，" + m[2] + " " + (m[3] === "waves" ? "波次" : "轮次")),
    rule("arbitration.main-duration-no-intervals", new RegExp("^" + ARB_ELAPSED_RE + ", No complete intervals$"), (m) => m[1] + "，没有完整间隔"),
    rule("arbitration.main-median-suffix", new RegExp("^" + ARB_ELAPSED_RE + " median$"), (m) => m[1] + " 中位数"),
    rule("arbitration.main-hourly-suffix", new RegExp("^(\\u2014|-|\\d[\\d,]*(?:\\.\\d+)?) / hour$"), (m) => m[1] + " / 小时"),
    rule("arbitration.main-positions", new RegExp("^" + ARB_NUM_RE + " positions$"), (m) => m[1] + " 个位置"),
    rule("arbitration.main-per-cell", new RegExp("^" + ARB_NUM_RE + " / cell$"), (m) => m[1] + " / 格"),
    rule("arbitration.main-cell-spawns", new RegExp("^" + ARB_NUM_RE + " spawns in this cell$"), (m) => "此格内有 " + m[1] + " 次生成"),
    rule("arbitration.main-wave-suffix", new RegExp("^" + ARB_ELAPSED_RE + ", wave (\\d+)$"), (m) => m[1] + "，第 " + m[2] + " 波"),
    rule("arbitration.main-observed-spawns", new RegExp("^" + ARB_NUM_RE + " observed spawns in range$"), (m) => "范围内观测到 " + m[1] + " 次生成"),
    rule("arbitration.main-entire-run-creations", new RegExp("^Entire run, " + ARB_NUM_RE + " creations$"), (m) => "整局，" + m[1] + " 个创建"),
    rule("arbitration.main-show-types", new RegExp("^Show all " + ARB_NUM_RE + " types$"), (m) => "显示全部 " + m[1] + " 种类型"),
    rule("arbitration.main-slow-interval", new RegExp("^" + ARB_ELAPSED_RE + ", \\+" + ARB_ELAPSED_RE + " above median$"), (m) => m[1] + "，比中位数多 +" + m[2]),
    rule("arbitration.main-observed-intermission", new RegExp("^Observed intermission " + ARB_ELAPSED_RE + "$"), (m) => "观测到的间歇 " + m[1]),
    rule("arbitration.main-events-count", new RegExp("^" + ARB_NUM_RE + " events$"), (m) => m[1] + " 个事件"),
    rule("arbitration.main-selected-count", new RegExp("^" + ARB_NUM_RE + " selected$"), (m) => "已选 " + m[1] + " 个"),
    rule("arbitration.main-favorites-count", new RegExp("^" + ARB_NUM_RE + " nodes in your favorites$"), (m) => "收藏中有 " + m[1] + " 个节点"),
    rule("arbitration.main-upcoming-count", new RegExp("^" + ARB_NUM_RE + " upcoming rotations in seven days$"), (m) => "未来七天有 " + m[1] + " 个轮次"),
    rule("arbitration.main-saved-filtering", new RegExp("^" + ARB_NUM_RE + " saved for quick filtering$"), (m) => "已保存 " + m[1] + " 个，便于快速筛选"),
    rule("arbitration.main-duration-seconds", new RegExp("^" + ARB_NUM_RE + "s$"), (m) => m[1] + " 秒"),
    rule("arbitration.main-last-import", new RegExp("^Last import, " + ARB_NUM_RE + " added, " + ARB_NUM_RE + " duplicates$"), (m) => "上次导入：新增 " + m[1] + "，" + m[2] + " 条重复"),
    rule("arbitration.main-partial-preserved", new RegExp("^" + ARB_NUM_RE + " partial captures preserved$"), (m) => "保留 " + m[1] + " 条部分采集"),
    rule("arbitration.main-import-cancelled", /^, import cancelled$/, () => "，导入已取消"),
    rule("arbitration.main-files-progress", /^, (\d+) \/ (\d+) files$/, (m) => "，" + m[1] + " / " + m[2] + " 个文件"),
    rule("arbitration.main-import-toast", new RegExp("^" + ARB_NUM_RE + " runs added, " + ARB_NUM_RE + " already saved\\.$"), (m) => "新增 " + m[1] + " 条记录，" + m[2] + " 条已保存。"),
    rule("arbitration.main-recording-title", /^Recording (.+)$/, (m, _rec, tr) => {
      const title = tr(m[1]);
      return typeof title === "string" ? "正在录制 " + title : null;
    }),
    rule("arbitration.main-tier-title", /^(?:([SABCDF])|(Unrated)), community farming tier$/, (m) => (m[1] ?? "未评级") + "，社区刷取档位"),
    rule("arbitration.main-kind-index-elapsed", new RegExp("^(Wave|Rotation) (\\d+), " + ARB_ELAPSED_RE + "$"), (m) => (m[1] === "Wave" ? "第 " + m[2] + " 波" : "第 " + m[2] + " 轮") + "，" + m[3]),
    rule("arbitration.main-metric-value", /^(Enemy spawns|Drone spawns|Enemy spawn rate|Drone spawn rate|Observed agents|Allied agents) ([\d,.]+|—)$/, (m, _rec, tr) => {
      const name = tr(m[1]);
      return typeof name === "string" ? name + " " + m[2] : null;
    }),
    rule("arbitration.main-histogram-bin", new RegExp("^" + ARB_NUM_RE + "s to " + ARB_NUM_RE + "s, " + ARB_NUM_RE + " intervals$"), (m) => m[1] + " 秒到 " + m[2] + " 秒，" + m[3] + " 个间隔"),
    rule("arbitration.main-agent-kind-title", /^([^,]{1,80}), (drone|agent)$/, (m) => m[1] + "，" + (m[2] === "drone" ? "无人机" : "单位")),
    rule("arbitration.main-interval-tooltip", new RegExp("^(Wave|Rotation) (\\d+), " + ARB_ELAPSED_RE + " – " + ARB_ELAPSED_RE + " Total " + ARB_SECONDS_RE + " Active " + ARB_SECONDS_RE + ", intermission " + ARB_SECONDS_RE + "(?: (\\d+) observed drones)?$"), (m) => {
      return (m[1] === "Wave" ? "第 " + m[2] + " 波" : "第 " + m[2] + " 轮") + "，" + m[3] + " – " + m[4] + " 总计 " + arbSeconds(m[5]) + " 活跃 " + arbSeconds(m[6]) + "，间歇 " + arbSeconds(m[7]) + (m[8] ? " 观测到 " + m[8] + " 架无人机" : "");
    }),
    rule("arbitration.main-phase-title", new RegExp("^(Active waves|Intermissions|Setup|Unclassified), " + ARB_ELAPSED_RE + "$"), (m, _rec, tr) => {
      const label = tr(m[1]);
      return typeof label === "string" ? label + "，" + m[2] : null;
    }),
    rule("arbitration.main-expanded-footnote", new RegExp("^(.+), " + ARB_ELAPSED_RE + " – " + ARB_ELAPSED_RE + "$"), (m, _rec, tr) => {
      const title = tr(m[1]);
      return typeof title === "string" ? title + "，" + m[2] + " – " + m[3] : null;
    }),
    rule("arbitration.main-vitus-title", /^(.+\.) (Hourly rates use observed gameplay time, including intermissions\.)( (Sorting uses the lower estimate when a range is shown\.))?$/, (m, _rec, tr) => {
      const assumptions = tr(m[1]);
      const hourly = tr(m[2]);
      if (typeof assumptions !== "string" || typeof hourly !== "string") return null;
      const sorting = m[3] ? tr(m[3]) : null;
      if (m[3] && typeof sorting !== "string") return null;
      return assumptions + " " + hourly + (sorting ? " " + sorting : "");
    }),
    rule("arbitration.main-reminder-toast", new RegExp("^Reminder saved for (.+), " + ARB_MONTH_RE + " (\\d{1,2}), (\\d{1,2}:\\d{2}) (AM|PM)\\.$"), (m) => "已保存提醒：" + m[1] + "，" + arbDate(m[2], m[3]) + " " + arbTime(m[4], m[5]) + "。"),
    rule("arbitration.main-open-live", /^Open live Arbitration, (.+)$/, (m) => "打开实时仲裁：" + m[1]),
    rule("arbitration.main-tiers-only", /^((?:[SABCDF](?:, [SABCDF])*)+) tiers$/, (m) => m[1] + " 档位"),
    // 告警偏好摘要（alertSummary）：实体列表 + 已知后缀；实体名按单个词条翻译，
    // 翻不出的专名保持英文（与 core.composite 对节点名的策略一致）。
    rule("arbitration.main-alert-summary", /^(?=.+, )(?:.*), (?:Favorite nodes|(?:\d[\d,]*) selected nodes|(?:[SABCDF](?:, [SABCDF])*)+ tiers)$/, (m, _rec, tr) => {
      let rest = m[0];
      const tail = [];
      let hit;
      if ((hit = /^(.*), Favorite nodes$/.exec(rest))) { rest = hit[1]; tail.unshift("收藏节点"); }
      if ((hit = /^(.*), (\d[\d,]*) selected nodes$/.exec(rest))) { rest = hit[1]; tail.unshift("已选 " + hit[2] + " 个节点"); }
      if ((hit = /^(.*?), ((?:[SABCDF](?:, [SABCDF])*)+) tiers$/.exec(rest))) { rest = hit[1]; tail.unshift(hit[2] + " 档位"); }
      if (!tail.length) return null;
      const head = rest.split(", ").map((part) => tr(part) ?? part).join("，");
      return [head, ...tail].join("，");
    }),
    rule("arbitration.main-timed-runs", new RegExp("^" + ARB_NUM_RE + " timed runs, weighted by duration$"), (m) => m[1] + " 条计时记录，按持续时间加权"),
    rule("arbitration.main-segment-title", /^Segment (\d+)$/, (m) => "分段 " + m[1]),
    rule("arbitration.main-model-range", new RegExp("^Approximate 95% model range, " + ARB_NUM_RE + "–" + ARB_NUM_RE + " Vitus\\.$"), (m) => "模型近似 95% 区间，" + m[1] + "–" + m[2] + " 生息精华。"),
    rule("arbitration.main-standard-deviation", new RegExp("^Standard deviation " + ARB_NUM_RE + " Vitus\\. This is a conditional estimate, not an exact luck percentile or a measured drop rate\\.$"), (m) => "标准差 " + m[1] + " 生息精华。这是条件估算，不是精确的运气百分位或实测掉率。"),
    rule("arbitration.main-run-list-capture", /^(Recorded locally|Imported), (complete|partial) capture$/, (m) => (m[1] === "Recorded locally" ? "本地记录" : "已导入") + "，" + (m[2] === "complete" ? "完整采集" : "部分采集")),
    rule("arbitration.main-map-footnote", /^(Enemy and drone coordinates recorded in this log\.|Enemy spawn coordinates, drone positions are not present in this log\.) Equal scale on both axes$/, (m, _rec, tr) => {
      const head = tr(m[1]);
      return typeof head === "string" ? head + "两轴等比例" : null;
    }),
    rule("arbitration.main-hover-inspect", /^Hover (a cell|a point) to inspect$/, (m) => (m[1] === "a cell" ? "悬停查看某一格" : "悬停查看某一点")),
    // 图片预览 Canvas（由 dom.canvas-text 模块翻译 fillText；规则只补拼接串）
    rule("arbitration.main-canvas-measurement", /^(.+), (spawns\/min|spawns|seconds|agents), full run$/, (m, _rec, tr) => {
      const name = tr(m[1]);
      const unit = tr(m[2]);
      return typeof name === "string" && typeof unit === "string" ? name + "，" + unit + "，完整一局" : null;
    }),
    rule("arbitration.main-canvas-status-line", /^(Recording|Ended|Completed|Aborted|Failed|Interrupted|Partial), (Complete capture|Partial capture), (Recorded here|Imported log|Imported report|Source unknown)$/, (m, _rec, tr) => {
      const status = tr(m[1]);
      const quality = tr(m[2]);
      const source = tr(m[3]);
      return typeof status === "string" && typeof quality === "string" && typeof source === "string" ? status + "，" + quality + "，" + source : null;
    }),
    rule("arbitration.main-canvas-spawns-note", /^Observed spawn events, not kills or drops\. Times use observed mission boundaries\.$/, (m, _rec, tr) => {
      const first = tr("Observed spawn events, not kills or drops.");
      const second = tr("Times use observed mission boundaries.");
      return typeof first === "string" && typeof second === "string" ? first + " " + second : null;
    }),
    rule("arbitration.main-canvas-names", /^Names (included where available|hidden), AlecaFrame, parser (\d+), (game version unknown|.+)$/, (m) => "名称" + (m[1] === "hidden" ? "隐藏" : "包含（如有）") + "，AlecaFrame，解析器 " + m[2] + "，游戏版本" + (m[3] === "game version unknown" ? "未知" : " " + m[3])),
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
    rule("generic.multiplied-item", /^(\d+(?:\.\d+)?)x (.+)$/, (m, _rec, tr) => {
      // 旧实现翻的是数字（rec = translate(m[1])），标签一直留英文；必须翻 m[2]。
      const label = tr(m[2]);
      return typeof label === "string" ? m[1] + " 个 " + label : null;
    }),
    rule("generic.starts-at", /^Starts at (.+)$/, (m, rec) => "开始于 " + (rec || m[1])),
    rule("generic.in", /^In (.+)$/, (m, rec) => "剩余 " + (rec || m[1])),

  ];

  runtime.rules = { list: list };
})(typeof globalThis !== "undefined" ? globalThis : this);
