/* AlecaFrame 简体中文运行时翻译层（由 AlecaFrame-ZH 启动器注入）
 * 依赖：window.__AFCN_DICT__（由构建脚本与本文件合并）
 * 设计：只做"精确文本匹配"替换，不改应用逻辑；动态内容由 MutationObserver 持续补翻。
 */
(() => {
  "use strict";
  if (window.__AFCN__) return;
  window.__AFCN__ = true;

  const DICT = window.__AFCN_DICT__ || {};
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "NOSCRIPT", "OPTION"]);
  const ATTRS = ["placeholder", "title", "aria-label", "data-tooltip", "data-tippy-content"];

  const norm = (s) => String(s).replace(/\s+/g, " ").trim();
  const hasCjk = (s) => /[\u3400-\u9fff]/.test(s);
  const map = new Map();
  const lowerMap = new Map(); // 纯拉丁键的小写索引：WFM 等外部数据大小写不固定（Status damage / Status Damage）
  for (const k of Object.keys(DICT)) {
    const nk = norm(k);
    if (!nk || map.has(nk)) continue;
    map.set(nk, DICT[k]);
    if (!hasCjk(nk) && !lowerMap.has(nk.toLowerCase())) lowerMap.set(nk.toLowerCase(), DICT[k]);
  }
  window.__AFCN_DICT__ = DICT;

  let translated = 0;
  const stats = { text: 0, attr: 0 };

  // 动态模板（数字/日期）规则：按顺序尝试，命中的返回译文
  const MONTHS = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
    January: 1, February: 2, March: 3, April: 4, June: 6, July: 7, August: 8, September: 9,
    October: 10, November: 11, December: 12
  };
  const MONTH_RE = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
  const NUM = "(\\d[\\d,]*(?:\\.\\d+)?)";

  // 「节点, 星球」复合文本（如仲裁/入侵里显示的 `Lares, Mercury`）：
  // 游戏中文客户端里节点名保持英文，只有星球名是中文，所以只翻逗号后半段。
  const PLANET_NAMES = new Set([
    "Earth", "Venus", "Mercury", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
    "Phobos", "Deimos", "Ceres", "Europa", "Eris", "Sedna", "Lua", "Void",
    "Kuva Fortress", "Zariman", "Duviri", "Orb Vallis", "Cambion Drift", "Plains of Eidolon",
    "Cetus", "Necralisk", "Hollvania", "Höllvania"
  ]);

  // 伤害类型中文名：裂罅卡片里要显示成「冰冻伤害 / 火焰伤害」这种（图标由 app 自己渲染）。
  const DAMAGE_LABELS = new Set([
    "火焰", "冰冻", "寒冷", "毒素", "电击", "切割", "冲击", "穿刺",
    "爆炸", "磁力", "毒气", "病毒", "腐蚀", "辐射"
  ]);

  function translateComposite(text) {
    const m = text.match(/^(.+?),\s*([^,]+)$/);
    if (!m) return null;
    const planet = norm(m[2]);
    if (!PLANET_NAMES.has(planet)) return null;
    const hit = map.get(planet);
    if (hit === undefined) return null;
    return m[1] + "，" + hit;
  }

  function fmtMonth(m) { return MONTHS[m] + " 月"; }

  const RULES = [
    // 裂罅属性（已揭示裂罅/裂罅探索器卡片）：插件把「数值+属性名」拼成一个文本节点，
    // 如 `+109.9% Critical Damage` / `x1.5 Damage to Corpus`；属性名本身翻不出来整串就不动。
    [/^(\d+(?:\.\d+)?)% match$/, (m) => m[1] + "% 匹配"],
    [/^([+-]?\d[\d,]*(?:\.\d+)?%)\s+(.+)$/, (m) => {
      const raw = m[2].trim();
      const translated = translateValue(raw);
      const label = translated === null ? raw : translated;
      const damage = DAMAGE_LABELS.has(label);
      if (translated === null && !damage) return null;
      return m[1] + " " + label + (damage ? "伤害" : "");
    }],
    [/^x(\d+(?:\.\d+)?)\s+(.+)$/, (m) => {
      const label = translateValue(m[2]);
      return label === null ? null : "x" + m[1] + " " + label;
    }],
    // WFM 相似裂罅卡片：属性名不带数值，只有正负号（`+Multishot`、`-Zoom`、`+Crit. chance`）。
    [/^([+\-\u2212\u2013\u2014\uFF0D])\s*([A-Za-z][^\d].*)$/, (m) => {
      const label = translateValue(m[2]);
      if (label === null) return null;
      const sign = "+-\u2212\u2013\u2014\uFF0D".indexOf(m[1]) === 0 ? "+" : "-";
      return sign + label;
    }],
    [/^Last record: (.+)$/, (m, rec) => "最后记录：" + (rec || m[1])],
    [/^Today, (.+)$/, (m, rec) => "今天，" + (rec || m[1])],
    [/^Tomorrow, (.+)$/, (m, rec) => "明天，" + (rec || m[1])],
    [new RegExp("^" + MONTH_RE + " (\\d{4})$"), (m) => m[2] + " 年 " + fmtMonth(m[1])],
    [new RegExp("^" + MONTH_RE + " (\\d{1,2})(?:, (\\d{4}))?$"), (m) => (m[3] ? m[3] + " 年 " : "") + fmtMonth(m[1]) + " " + m[2] + " 日"],
    [new RegExp("^" + NUM + " recorded days(?: in range)?$"), (m) => m[1] + " 天已记录"],
    [new RegExp("^" + NUM + " recorded$"), (m) => "已记录 " + m[1]],
    [new RegExp("^" + NUM + " copies remaining$"), (m) => "剩余 " + m[1] + " 张"],
    [/^Rank (\d+) \/ (\d+)$/, (m) => "等级 " + m[1] + " / " + m[2]],
    [/^Rank (\d+)\/(\d+)$/, (m) => "等级 " + m[1] + "/" + m[2]],
    [/^Owned, (\d+) copies?$/, (m) => "已拥有 " + m[1] + " 张"],
    [new RegExp("^" + NUM + " ready to upgrade$"), (m) => m[1] + " 个可升级"],
    [/^MR (\d+)$/, (m) => "段位 " + m[1]],
    [new RegExp("^" + NUM + " Endo to max$"), (m) => m[1] + " 内融核心至满级"],
    [new RegExp("^" + NUM + " credits to max$"), (m) => m[1] + " 星币至满级"],
    [new RegExp("^" + NUM + " extra to spare$"), (m) => m[1] + " 额外可用"],
    [new RegExp("^" + NUM + " still needed$"), (m) => "仍需 " + m[1]],
    [new RegExp("^" + NUM + " to keep$"), (m) => "保留 " + m[1]],
    [new RegExp("^" + NUM + " to max$"), (m) => m[1] + " 至满级"],
    [new RegExp("^" + NUM + " mods$"), (m) => m[1] + " 个 MOD"],
    [new RegExp("^" + NUM + " owned types$"), (m) => "已拥有 " + m[1] + " 种"],
    [new RegExp("^" + NUM + " orders$"), (m) => m[1] + " 个订单"],
    [/^(\d+(?:\.\d+)?)x (.+)$/, (m, rec) => m[1] + " 个 " + (rec || m[2])],
    [/^Starts at (.+)$/, (m, rec) => "开始于 " + (rec || m[1])],
    [/^In (.+)$/, (m, rec) => "剩余 " + (rec || m[1])]
  ];

  function applyRule(text) {
    for (const [re, fn] of RULES) {
      const m = text.match(re);
      if (!m) continue;
      const rec = m[1] ? translateValue(m[1]) : null;
      return fn(m, rec);
    }
    return null;
  }

  function translateValue(text) {
    const key = norm(text);
    if (!key || !/[A-Za-z]/.test(key)) return null;
    const hit = map.get(key);
    if (hit !== undefined) return hit;
    if (!hasCjk(key)) {
      const lowerHit = lowerMap.get(key.toLowerCase());
      if (lowerHit !== undefined) return lowerHit;
    }
    const composite = translateComposite(key);
    if (composite !== null) return composite;
    return applyRule(key);
  }


  function translateTextNode(node) {
    const raw = node.nodeValue;
    if (!raw || raw.length > 400) return;
    let next = translateValue(raw);
    // 裂罅卡片里的伤害类型要显示成「冰冻伤害 / 火焰伤害」（图标由 app 自己渲染）；
    // 属性名可能是独立文本节点、也可能带纯数字前缀（`+0.3 Range`），都要按上下文处理。
    if (inRivenContext(node)) {
      const trimmed = norm(raw);
      if (next === null) {
        // 纯数值 / 带秒单位（`+0.3 Range`、`6s Combo Duration`）加属性名
        const flat = trimmed.match(/^([+-]?\d[\d,]*(?:\.\d+)?)(s?)\s+([A-Za-z][^\d].*)$/);
        if (flat) {
          const translated = translateValue(flat[3]);
          if (translated !== null) {
            next = flat[1] + (flat[2] ? " 秒" : " ") + rivenLabel(translated);
          }
        }
      } else {
        next = rivenLabel(next);
      }
      if (next === null && DAMAGE_LABELS.has(trimmed)) next = rivenLabel(trimmed);
    }
    if (next === null) return;
    const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const lead = m ? m[1] : "";
    const tail = m ? m[3] : "";
    const text = lead + next + tail;
    if (text !== raw) { node.nodeValue = text; translated++; stats.text++; }
  }

  /** 裂罅上下文里的伤害类型补「伤害」后缀；`寒冷` 按游戏词形改为「冰冻」。 */
  function rivenLabel(label) {
    if (label.indexOf("伤害") !== -1) return label;
    const fixed = label === "寒冷" ? "冰冻" : label;
    return DAMAGE_LABELS.has(fixed) ? fixed + "伤害" : label;
  }

  /** 文本节点是否位于裂罅卡片内（祖先 class 含 riven）。 */
  function inRivenContext(node) {
    let el = node ? node.parentNode : null;
    for (let depth = 0; el && depth < 8; depth++) {
      const cls = typeof el.className === "string" ? el.className : "";
      if (cls && cls.indexOf("riven") !== -1) return true;
      el = el.parentNode;
    }
    return false;
  }

  function translateAttrs(el) {
    if (!el.getAttribute) return;
    for (const a of ATTRS) {
      let v;
      try { v = el.getAttribute(a); } catch { continue; }
      if (!v) continue;
      const hit = translateValue(v);
      if (hit !== null) {
        try { el.setAttribute(a, hit); translated++; stats.attr++; } catch { }
      }
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { translateTextNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) {
      if (SKIP_TAGS.has(root.tagName)) return;
      translateAttrs(root);
    }
    let tw;
    try {
      tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode(n) {
          if (n.nodeType === 1 && SKIP_TAGS.has(n.tagName)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
    } catch { return; }
    let n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) translateTextNode(n);
      else translateAttrs(n);
    }
  }

  let scheduled = false;
  function scanAll() {
    scheduled = false;
    try { walk(document.body || document.documentElement); } catch { }
    console.log("[AlecaFrame-ZH] translated nodes=" + translated + " entries=" + map.size);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    (window.requestAnimationFrame || window.setTimeout)(scanAll, 0);
  }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData" && m.target && m.target.nodeType === 3) {
        translateTextNode(m.target);
      } else if (m.type === "childList") {
        for (const n of m.addedNodes) {
          if (n.nodeType === 3) translateTextNode(n);
          else if (n.nodeType === 1) walk(n);
        }
      } else if (m.type === "attributes" && m.attributeName && m.target && m.target.nodeType === 1) {
        translateAttrs(m.target);
      }
    }
  });

  function start() {
    console.log("[AFCN] starting, entries=" + map.size);
    walk(document.body || document.documentElement);
    try {
      mo.observe(document.documentElement, {
        subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS
      });
    } catch { }
    // 首次渲染/懒加载页面可能有延迟，补扫几次
    setTimeout(scanAll, 1500);
    setTimeout(scanAll, 4000);
    setTimeout(() => console.log("[AlecaFrame-ZH] loaded translated=" + translated + " entries=" + map.size), 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
