/* AlecaFrame 简体中文运行时翻译层 · 中文搜索（由 AlecaFrame-ZH 启动器注入）
 *
 * 依赖：window.__AFCN_DICT__（英文 -> 简体中文；由 src/build.py 在 bundle 开头生成）
 *       window.plugin（AlecaFrame 的 Overwolf 扩展对象，window.plugin.get() 返回 C# 插件实例）
 *
 * 设计（详见 docs/中文搜索原理.md）：
 *   1) 启动时用 __AFCN_DICT__ 建「中文 -> 英文」反向索引（含部件组合反查、Prime 后缀、子串兜底）；
 *   2) 中文输入一律不送给原生插件：把查询里的 search 清空，让插件返回完整 JSON 列表，
 *      再用反向/正向索引在本地过滤（MIOEU 的核心思路，见 upstream/mioeu/alecaframe-zh-cn.js:362-800）；
 *   3) 所有钩子逐一 feature-detect：宿主不存在只 console.debug 一次并跳过，绝不抛异常；
 *   4) 每个钩子都有 __afzhWrapped / __afzh*Hook 标志防重复包装。
 *
 * 3.0.6 关键点（与 MIOEU 的差异，证据见 docs/中文搜索原理.md）：
 *   - MIOEU 在 main.html 里改写 window.plugin.get() 返回对象的方法；3.0.6 的插件实例创建在
 *     background.html（web/assets/js/background.js:1 `var plugin = new OverwolfPlugin(...)`），
 *     main.html 拿到的只是跨窗口引用。本文件因此**在 background.html 里**安装插件级钩子
 *     （与 MIOEU 自己的 OCR 桥一致：upstream/mioeu/alecaframe-zh-cn-relic-ocr.js:378 在 background 里
 *     `nativePlugin.SetNewRelicScreenshot = function(...)`），main.html 里安装应用级钩子。
 *     两个窗口都会注入同一个 bundle（bin/AlecaFrame-ZH.ps1:25-36 页面清单含 background.html）。
 *   - 3.0.6 的搜索框是 <main-search> 组件（assets/js/main/search.js:53-57），#inventorySearch 等
 *     id 经 inheritAttrs:false + v-bind="inputAttributes" 落到内部 <input>；refresh 读的是
 *     Vue 数据（this.search / this.selectedSearch），不是 DOM value。所以 MIOEU 那种
 *     “改 input.value 再调 refresh” 的做法在 3.0.6 无效，改为从插件调用的 query JSON 里取 search。
 */
(() => {
  "use strict";

  if (window.__AFZH_SEARCH__) return;

  const DICT = (window.__AFCN_DICT__ && typeof window.__AFCN_DICT__ === "object") ? window.__AFCN_DICT__ : null;

  // ---------------------------------------------------------------------------
  // 词形表：与 src/build_items.py 的 PART_ZH / REFINE_EN / REFINE_ZH 保持一致
  // （build_items.py:39-51）。部件组合反查复用这张表，避免和词典生成规则分叉。
  // ---------------------------------------------------------------------------
  const PART_EN_TO_ZH = {
    "Blueprint": "蓝图", "Chassis": "机体", "Neuroptics": "神经光元", "Systems": "系统",
    "Barrel": "枪管", "Receiver": "机匣", "Stock": "枪托", "Upper Receiver": "上机匣",
    "Lower Receiver": "下机匣", "Blade": "刀刃", "Handle": "握柄", "Hilt": "剑柄",
    "Guard": "护手", "Rivet": "铆钉", "Chain": "链条", "Grip": "握把", "Head": "锤头",
    "Ornament": "装饰", "Link": "连接器", "Disc": "圆盘", "String": "弓弦", "Limb": "弓臂",
    "Pouch": "袋", "Carapace": "甲壳", "Cerebrum": "大脑", "Harness": "护具", "Wings": "翼",
    "Left Gauntlet": "左拳套", "Right Gauntlet": "右拳套", "Gauntlet": "拳套",
    "Boot": "靴", "Wing": "翼", "Core": "核心", "Shell": "外壳", "Barrel Assembly": "枪管组件"
  };
  const REFINE_EN = [" Intact", " Exceptional", " Flawless", " Radiant"];
  const REFINE_ZH = [" 完好", " 优良", " 无瑕", " 光辉"];

  // 英文部件按长度降序（"Upper Receiver" 先于 "Receiver"）；中文部件同理（"枪管组件" 先于 "枪管"）。
  const PART_EN_SORTED = Object.keys(PART_EN_TO_ZH).sort((a, b) => (b.length - a.length) || (a < b ? -1 : 1));
  const PART_ZH_SORTED = Object.keys(PART_EN_TO_ZH)
    .map((en) => [en, PART_EN_TO_ZH[en]])
    .sort((a, b) => (b[1].length - a[1].length) || (b[0].length - a[0].length) || (a[0] < b[0] ? -1 : 1));

  const MARKET_MARKER = "__afzh_market__:";

  const hasChinese = (value) => /[\u3400-\u9fff]/.test(String(value == null ? "" : value));

  // 输入框可能混入零宽字符/不可见空白（输入法、复制粘贴都会带），先清掉再查表
  const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00A0\u3000]/g;
  const clean = (value) => String(value == null ? "" : value).replace(INVISIBLE, "");

  function splitTerms(term) {
    return clean(term)
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function normKey(value) {
    return clean(value).trim().toLowerCase().replace(/\s+/g, " ").trim();
  }

  // ---------------------------------------------------------------------------
  // 索引
  // ---------------------------------------------------------------------------

  /** 建立词典索引：{dict, byLower, reverse, keys}。纯函数，测试可直接用假词典调用。 */
  function buildIndex(dict) {
    const source = (dict && typeof dict === "object") ? dict : {};
    const byLower = new Map();   // 小写英文 -> 词典里的原始英文键
    const reverse = new Map();   // 小写中文 -> [英文名]（已按择词策略排序）
    const keys = [];             // 去重后的小写中文键（子串检索用）

    for (const english of Object.keys(source)) {
      const chinese = source[english];
      if (!english || typeof chinese !== "string" || !chinese) continue;
      const englishLower = english.toLowerCase();
      if (!byLower.has(englishLower)) byLower.set(englishLower, english);
      const chineseLower = chinese.toLowerCase();
      let bucket = reverse.get(chineseLower);
      if (!bucket) {
        bucket = [];
        reverse.set(chineseLower, bucket);
        keys.push(chineseLower);
      }
      bucket.push(english);
    }

    // 择词策略（确定性）：同一中文对应多个英文名时，短英文名优先，其次字典序。
    // 理由：短名是“整件物品”（如 "Sagek Prime" 短于 "Sagek Prime Barrel"），
    // 长名通常是从它派生出的部件/变体；长度相同再按字母序保证稳定。
    for (const bucket of reverse.values()) {
      bucket.sort((a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0));
    }
    keys.sort();

    return { dict: source, byLower, reverse, keys };
  }

  /**
   * 用一本词典生成整套纯函数。
   * @param {object} dict 英文 -> 中文
   */
  function createApi(dict) {
    const index = buildIndex(dict);

    function forwardLookup(english) {
      if (!english || typeof english !== "string") return null;
      const direct = index.dict[english];
      if (typeof direct === "string" && direct) return direct;
      const canonical = index.byLower.get(english.toLowerCase());
      if (canonical) {
        const hit = index.dict[canonical];
        if (typeof hit === "string" && hit) return hit;
      }
      return null;
    }

    /** 英文基础名 -> 中文：整名优先，其次 "X Prime" 拆成 X + " Prime"（Warframe 名不译）。 */
    function baseToChinese(english) {
      const direct = forwardLookup(english);
      if (direct) return direct;
      if (/ Prime$/i.test(english)) {
        const base = forwardLookup(english.slice(0, -6));
        if (base) return base + " Prime";
      }
      return null;
    }

    /**
     * 英文名 -> 中文字幕名（用于本地过滤/显示）。
     * 顺序：词典整名 -> 部件组合（父名 + 部件表）-> 无法翻译返回 null。
     */
    function toChineseName(english) {
      if (!english || typeof english !== "string") return null;
      const direct = forwardLookup(english);
      if (direct) return direct;

      const lower = english.toLowerCase();
      for (const part of PART_EN_SORTED) {
        const suffix = " " + part.toLowerCase();
        if (lower.length <= suffix.length || !lower.endsWith(suffix)) continue;
        const baseEnglish = english.slice(0, english.length - suffix.length);
        const baseChinese = baseToChinese(baseEnglish);
        if (baseChinese) return baseChinese + " " + PART_EN_TO_ZH[part];
      }
      // 兜底："X Prime" 只查得到基础名 X 时，保留 Prime 后缀（Warframe 名不翻译）。
      return baseToChinese(english);
    }

    /** 搜索用文本：中文字幕名（小写）+ 英文原名（小写），术语子串匹配用。 */
    function searchableName(english) {
      const chinese = toChineseName(english);
      const lower = String(english == null ? "" : english).toLowerCase();
      return chinese ? chinese.toLowerCase() + " " + lower : lower;
    }

    /** 中文（精确）-> 英文；同中文多英文时取排序后的第一个。 */
    function exactReverse(chineseLower) {
      const bucket = index.reverse.get(chineseLower);
      return bucket && bucket.length ? bucket[0] : null;
    }

    /** 中文基础名（可能带 " Prime"）-> 英文。 */
    function baseEnglish(chineseLower) {
      const direct = exactReverse(chineseLower);
      if (direct) return direct;
      if (chineseLower.endsWith(" prime")) {
        const base = exactReverse(chineseLower.slice(0, -6));
        if (base) return base + " Prime";
      }
      return null;
    }

    /** 中文名包含查询时：中文名最短优先，再英文最短，最后字母序（确定性兜底）。 */
    function substringEnglish(queryLower) {
      if (!queryLower) return null;
      let best = null;
      let bestZhLen = Infinity;
      let bestEnLen = Infinity;
      for (const chineseLower of index.keys) {
        if (chineseLower.indexOf(queryLower) === -1) continue;
        const bucket = index.reverse.get(chineseLower);
        if (!bucket || !bucket.length) continue;
        const english = bucket[0];
        const zhLen = chineseLower.length;
        const enLen = english.length;
        if (zhLen < bestZhLen || (zhLen === bestZhLen && (enLen < bestEnLen || (enLen === bestEnLen && english < best)))) {
          best = english;
          bestZhLen = zhLen;
          bestEnLen = enLen;
        }
      }
      return best;
    }

    /**
     * 中文 -> 英文（反向索引主入口）。
     * 顺序：整名精确 -> 部件组合（最长中文部件尾）-> Prime 后缀 -> 中文子串。
     * 返回 null 表示没有可靠英文候选（调用方应保持原样，不要瞎猜）。
     */
    function englishForChinese(chinese) {
      if (!chinese || typeof chinese !== "string") return null;
      const query = normKey(chinese);
      if (!query) return null;

      const exact = exactReverse(query);
      if (exact) return exact;

      for (const entry of PART_ZH_SORTED) {
        const englishPart = entry[0];
        const suffix = " " + entry[1].toLowerCase();
        if (query.length <= suffix.length || !query.endsWith(suffix)) continue;
        const base = query.slice(0, query.length - suffix.length);
        const englishBase = baseEnglish(base);
        if (englishBase) return englishBase + " " + englishPart;
      }

      if (query.endsWith(" prime")) {
        const base = exactReverse(query.slice(0, -6));
        if (base) return base + " Prime";
      }

      return substringEnglish(query);
    }

    /** 给原生英文接口用的查询词：中文 -> 英文；无中文返回原值；无法翻译返回 null。 */
    function englishQueryForChinese(query) {
      if (!hasChinese(query)) return query;
      const chinese = normKey(query);
      if (!chinese) return query;
      const english = englishForChinese(chinese);
      if (english) return english;
      // 兜底 1：去掉混杂的拉丁/标点/不可见字符，只留汉字再查一次
      const cjk = chinese.replace(/[^\u3400-\u9fff]/g, "");
      if (cjk && cjk !== chinese) {
        const fromCjk = englishForChinese(cjk);
        if (fromCjk) return fromCjk;
      }
      // 兜底 2：按「查询词是中文名子串」找最短候选（不依赖精确反向索引）
      const guess = substringEnglish(chinese) || substringEnglish(cjk);
      return guess || null;
    }

    /**
     * 本地过滤：按空格拆词后 **每个词都必须命中**（AND）。
     * 每个字段的可搜索文本 = 中文字幕名 + 英文原名（都小写），所以中英文混输也能过滤。
     */
    function filterItems(items, term, nameFields) {
      if (!Array.isArray(items)) return items;
      const terms = splitTerms(term);
      if (!terms.length) return items;
      const fields = (Array.isArray(nameFields) && nameFields.length) ? nameFields : ["name"];

      return items.filter((item) => {
        if (!item || typeof item !== "object") return false;
        const chunks = [];
        for (const field of fields) {
          const value = item[field];
          if (typeof value === "string" && value) chunks.push(searchableName(value));
        }
        if (!chunks.length) return false;
        const haystack = chunks.join(" ");
        return terms.every((single) => haystack.indexOf(single) !== -1);
      });
    }

    /** 市场搜索建议：从词典里直接找中文/英文子串命中，按 精确 > 前缀 > 包含 排序。 */
    function suggestions(term, limit) {
      const query = normKey(term);
      const max = Number.isFinite(limit) && limit > 0 ? limit : 50;
      if (!query) return [];

      const hits = [];
      for (const english of Object.keys(index.dict)) {
        const chinese = index.dict[english];
        if (!chinese || typeof chinese !== "string") continue;
        const chineseLower = chinese.toLowerCase();
        const englishLower = english.toLowerCase();
        const inChinese = chineseLower.indexOf(query) !== -1;
        const inEnglish = englishLower.indexOf(query) !== -1;
        if (!inChinese && !inEnglish) continue;
        let rank = 3;
        if (chineseLower === query) rank = 0;
        else if (chineseLower.indexOf(query) === 0) rank = 1;
        else if (inChinese) rank = 2;
        hits.push({ english, chinese, rank, zhLen: chinese.length, enLen: english.length });
      }

      hits.sort((a, b) => (a.rank - b.rank) || (a.zhLen - b.zhLen) || (a.enLen - b.enLen) || (a.english < b.english ? -1 : 1));
      return hits.slice(0, max);
    }

    /** 市场建议项：urlName 用标记前缀携带英文名，点击时再向插件换取真实 slug。 */
    function marketSuggestions(term, limit) {
      return suggestions(term, limit).map((hit) => ({
        name: hit.chinese,
        english: hit.english,
        urlName: MARKET_MARKER + encodeURIComponent(hit.english),
        picture: ""
      }));
    }

    /** 若是本模块生成的 urlName，取出英文名；否则返回 null。 */
    function englishFromMarketMarker(urlName) {
      if (typeof urlName !== "string" || urlName.indexOf(MARKET_MARKER) !== 0) return null;
      try {
        return decodeURIComponent(urlName.slice(MARKET_MARKER.length));
      } catch (_) {
        return null;
      }
    }

    return {
      index,
      hasChinese,
      splitTerms,
      toChineseName,
      searchableName,
      englishForChinese,
      englishQueryForChinese,
      filterItems,
      suggestions,
      marketSuggestions,
      englishFromMarketMarker,
      dictSize: Object.keys(index.dict).length,
      reverseSize: index.reverse.size
    };
  }

  /** node 测试入口：暴露可注入的纯函数集合（不依赖任何宿主）。 */
  function createTestExports(defaultApi) {
    return {
      createApi,
      buildIndex,
      hasChinese,
      splitTerms,
      normKey,
      PART_EN_TO_ZH,
      PART_EN_SORTED,
      PART_ZH_SORTED,
      REFINE_EN,
      REFINE_ZH,
      MARKET_MARKER,
      filterRelicPlannerPayload,
      defaultApi
    };
  }

  const api = createApi(DICT);

  /**
   * 把中文查询解析成英文（供原生插件搜索）。
   * 直接查运行时反向索引（Map），不依赖 createApi 里的包装函数 ——
   * 实测在某些页面里 englishQueryForChinese 会把中文原样返回，但 index.reverse 是好的。
   * 顺序：整名 -> 去空格整名 -> 忽略空格全表扫描 -> 子串最短 -> 交给 api 的兜底实现。
   */
  function resolveEnglishQuery(term) {
    const raw = String(term == null ? "" : term);
    const cleaned = raw.replace(INVISIBLE, "").trim().toLowerCase();
    if (!cleaned || !api.hasChinese(cleaned)) return null;

    const reverse = api.index && api.index.reverse;
    if (reverse) {
      const direct = reverse.get(cleaned);
      if (direct && direct.length) return direct[0];

      const compact = cleaned.replace(/\s+/g, "");
      if (compact && compact !== cleaned) {
        const hit = reverse.get(compact);
        if (hit && hit.length) return hit[0];
      }

      for (const entry of reverse) {
        const zh = entry[0];
        const list = entry[1];
        if (!list || !list.length) continue;
        if (zh.replace(/\s+/g, "") === compact) return list[0];
      }

      let best = null;
      let bestLen = Infinity;
      for (const entry of reverse) {
        const zh = entry[0];
        const list = entry[1];
        if (!list || !list.length) continue;
        if (zh.indexOf(cleaned) === -1) continue;
        if (zh.length < bestLen) { best = list[0]; bestLen = zh.length; }
      }
      if (best) return best;
    }

    try {
      const fallback = api.englishQueryForChinese(term);
      if (fallback && !api.hasChinese(fallback)) return fallback;
    } catch (_) { /* ignore */ }
    return null;
  }

  // ---------------------------------------------------------------------------
  // 运行状态 / 诊断（浏览器控制台里 __AFZH_SEARCH__ 可看到钩子是否生效）
  // ---------------------------------------------------------------------------
  const status = {
    version: 1,
    dictEntries: DICT ? Object.keys(DICT).length : 0,
    reverseEntries: api.reverseSize,
    window: "main",
    hooks: {},
    hits: {},
    debugged: {},
    hitLogged: {},
    started: false
  };
  window.__AFZH_SEARCH__ = status;
  // 控制台调试用：__AFZH_SEARCH_API__.englishForChinese("杀格 Prime 枪管蓝图")
  window.__AFZH_SEARCH_API__ = api;

  function debugOnce(key, message) {
    if (status.debugged[key]) return;
    status.debugged[key] = true;
    try { console.debug("[AFZH 中文搜索] " + message); } catch (_) { /* ignore */ }
  }

  function markHit(name) {
    status.hits[name] = (status.hits[name] || 0) + 1;
    if (status.hitLogged[name]) return;
    status.hitLogged[name] = true;
    try { console.info("[AFZH 中文搜索] 钩子生效：" + name); } catch (_) { /* ignore */ }
  }

  function safeCall(fn, fallback) {
    try { return fn(); } catch (error) {
      try { console.debug("[AFZH 中文搜索] 忽略异常：" + (error && error.message || error)); } catch (_) { /* ignore */ }
      return fallback;
    }
  }

  if (window.__AFZH_TEST__) {
    // node 测试模式：只暴露纯函数与钩子工厂（不装钩子、不碰 DOM / 定时器），tests/search.test.mjs 用。
    const testExports = createTestExports(api);
    testExports.resolveEnglishQuery = resolveEnglishQuery;
    testExports.hookJsonSearchMethod = hookJsonSearchMethod;
    testExports.hookRivenWeapons = hookRivenWeapons;
    window.__AFZH_SEARCH_TEST__ = testExports;
    return;
  }

  function getNativePlugin() {
    const plugin = window.plugin;
    if (!plugin || typeof plugin.get !== "function") return null;
    const native = plugin.get();
    return native && typeof native === "object" ? native : null;
  }

  // ---------------------------------------------------------------------------
  // 插件级钩子（在 background.html 里最有效：那里 window.plugin.get() 是本地 C# 插件实例）
  // ---------------------------------------------------------------------------

  /**
   * 通用「JSON 查询里带中文 search」的钩子。
   *
   * v1.1.8 起顺序改为「**本地过滤优先**」（v1.1.5~1.1.7 是英文改写优先）：
   *   1) 中文查询不送原生：把 query JSON 里的 search 清空，让插件按其它过滤条件（分类/筛选）
   *      返回该页面的完整列表，再用中文/英文双向索引在本地过滤 —— 因此支持**部分中文**
   *      （输入「死亡」能命中「死亡使徒」「死亡魔方」等），且只在当前分类/筛选范围内匹配；
   *   2) 本地过滤 0 命中时，若有可靠的英文候选，再退回一次「英文查询改写」交原生搜
   *      （覆盖「列表里的物品名在词典里翻不出来」的情况）；
   *   3) 英文/空查询完全不干预。
   *
   * 为什么不能优先做英文改写（v1.1.5 的做法）：反向索引里混着 UI 术语，部分中文会被查成
   * 一个无关的英文名。实测 2026-11-07：`dict/mioeu-terms.tsv` 有 `Death -> 死亡`，
   * 用户输入「死亡」被改写成 `Death`，原生在铸造厂里一个都搜不到 → 空列表；
   * 而同一份词典里「死亡使徒」= Kaszas 本来是能本地匹配上的。
   *
   * @param {string[]|null} nameFields 过滤用的字段；null 表示只清空 search（数据由事件异步回来）。
   * @param {{forceTrueIndex?: number}} options forceTrueIndex：把该下标的实参强制为 true。
   *        「库存」用它把 includeAll（mainInventory.js:318 的第 2 个实参）置 true ——
   *        插件在 includeAll=false 时最多只返回 100 条，中文过滤需要完整列表。
   */
  function hookJsonSearchMethod(native, methodName, nameFields, options) {
    const original = native[methodName];
    if (typeof original !== "function") {
      debugOnce("missing:" + methodName, methodName + "() 不存在，跳过该钩子");
      return false;
    }
    if (original.__afzhWrapped) return true;

    const opts = options || {};

    const wrapper = function (query) {
      const nativeThis = this;
      let filters = null;
      safeCall(() => { filters = JSON.parse(query); }, null);
      if (!filters || typeof filters !== "object") return original.apply(nativeThis, arguments);

      const term = typeof filters.search === "string" ? filters.search.trim() : "";
      if (!term || !api.hasChinese(term)) return original.apply(nativeThis, arguments);

      const args = Array.prototype.slice.call(arguments);

      // 只作为「本地过滤 0 命中」时的兜底：中文 -> 最可能的英文名
      let english = null;
      safeCall(() => {
        const candidate = resolveEnglishQuery(term);
        if (candidate && !api.hasChinese(candidate)) english = candidate;
      }, null);

      let callbackIndex = -1;
      for (let i = args.length - 1; i >= 1; i--) {
        if (typeof args[i] === "function") { callbackIndex = i; break; }
      }

      // 只清空 search 的钩子（遗物规划：数据走 onRelicPlannerUpdate 事件）
      if (nameFields === null || callbackIndex < 0) {
        const next = args.slice();
        if (english) {
          markHit(methodName + ":英文改写");
          next[0] = JSON.stringify(Object.assign({}, filters, { search: english }));
        } else {
          markHit(methodName + ":清空搜索");
          next[0] = JSON.stringify(Object.assign({}, filters, { search: "" }));
        }
        return original.apply(nativeThis, next);
      }

      const callback = args[callbackIndex];
      const localArgs = args.slice();
      localArgs[0] = JSON.stringify(Object.assign({}, filters, { search: "" }));
      if (typeof opts.forceTrueIndex === "number" && opts.forceTrueIndex > 0 && opts.forceTrueIndex < localArgs.length) {
        localArgs[opts.forceTrueIndex] = true;
      }

      localArgs[callbackIndex] = function (success, data) {
        const pass = Array.prototype.slice.call(arguments);
        if (!success) return callback.apply(this, pass);
        const parsed = safeCall(() => JSON.parse(data), null);
        if (!Array.isArray(parsed)) return callback.apply(this, pass);

        const filtered = safeCall(() => api.filterItems(parsed, term, nameFields), null);
        if (Array.isArray(filtered) && filtered.length > 0) {
          markHit(methodName + ":本地过滤");
          pass[1] = JSON.stringify(filtered);
          return callback.apply(this, pass);
        }

        // 本地 0 命中：有可靠英文候选就退回原生英文搜索（物品名没中文/词典缺译时仍能搜到）
        if (english) {
          markHit(methodName + ":本地0命中→英文改写");
          const retryArgs = args.slice();
          retryArgs[0] = JSON.stringify(Object.assign({}, filters, { search: english }));
          return original.apply(nativeThis, retryArgs);
        }

        // 真的没有：留一条诊断，能区分「该分类本来就没有这个物品」和「过滤逻辑没匹配上」
        try {
          const ctx = {};
          for (const key of ["type", "search", "onlyOwned"]) {
            if (filters[key] !== undefined) ctx[key] = filters[key];
          }
          let sample = "";
          if (parsed.length) {
            const first = parsed[0];
            if (first && typeof first === "object") {
              sample = " 首条字段=" + Object.keys(first).slice(0, 12).join("/") +
                " name=" + JSON.stringify(first.name);
            }
          }
          console.info(
            "[AFZH 中文搜索] " + methodName + ' 中文="' + term + '" 未命中：原生 ' +
            parsed.length + " 条，过滤条件 " + JSON.stringify(ctx) + sample
          );
        } catch (_) { /* ignore */ }
        pass[1] = JSON.stringify(Array.isArray(filtered) ? filtered : []);
        return callback.apply(this, pass);
      };
      return original.apply(nativeThis, localArgs);
    };
    wrapper.__afzhWrapped = true;
    native[methodName] = wrapper;
    return native[methodName] === wrapper;
  }

  /**
   * GetRivenWeapons(search, callback)：第一个参数是纯字符串（不是 JSON）。
   * 与 JSON 搜索钩子一致：中文优先取全量再本地过滤（支持部分中文），0 命中时再退回英文改写。
   */
  function hookRivenWeapons(native) {
    const methodName = "GetRivenWeapons";
    const original = native[methodName];
    if (typeof original !== "function") {
      debugOnce("missing:" + methodName, methodName + "() 不存在，跳过裂罅武器搜索钩子");
      return false;
    }
    if (original.__afzhWrapped) return true;

    const wrapper = function (search, callback) {
      const nativeThis = this;
      const term = typeof search === "string" ? search.trim() : "";
      if (!term || !api.hasChinese(term) || typeof callback !== "function") {
        return original.apply(nativeThis, arguments);
      }

      let english = null;
      safeCall(() => {
        const candidate = resolveEnglishQuery(term);
        if (candidate && !api.hasChinese(candidate)) english = candidate;
      }, null);

      return original.call(nativeThis, "", (success, data) => {
        if (!success) return callback(success, data);
        const parsed = safeCall(() => JSON.parse(data), null);
        const filtered = Array.isArray(parsed)
          ? safeCall(() => api.filterItems(parsed, term, ["name"]), null)
          : null;
        if (Array.isArray(filtered) && filtered.length > 0) {
          markHit(methodName + ":本地过滤");
          return callback(true, JSON.stringify(filtered));
        }
        if (english) {
          markHit(methodName + ":本地0命中→英文改写");
          return original.call(nativeThis, english, callback);
        }
        return callback(success, data);
      });
    };
    wrapper.__afzhWrapped = true;
    native[methodName] = wrapper;
    return native[methodName] === wrapper;
  }

  /**
   * GetWFMarketSearchSuggestions(query, callback)：中文先换成最可能的英文物品名，
   * 再把返回的英文名翻成中文用于显示（urlName 保持官方 slug，点击链路不变）。
   */
  function hookMarketSuggestions(native) {
    const methodName = "GetWFMarketSearchSuggestions";
    const original = native[methodName];
    if (typeof original !== "function") {
      debugOnce("missing:" + methodName, methodName + "() 不存在，跳过市场搜索建议改写钩子");
      return false;
    }
    if (original.__afzhWrapped) return true;

    const wrapper = function (query, callback) {
      const term = typeof query === "string" ? query.trim() : "";
      if (!term || !api.hasChinese(term)) return original.apply(this, arguments);
      const english = resolveEnglishQuery(term);
      if (!english) {
        debugOnce("marketQuery:" + term, "市场搜索建议：中文「" + term + "」没有英文候选，保持原查询");
        return original.apply(this, arguments);
      }

      markHit(methodName);
      const args = Array.prototype.slice.call(arguments);
      args[0] = english;
      if (typeof callback === "function") {
        args[1] = function (success, response) {
          if (!success) return callback(success, response);
          const list = safeCall(() => JSON.parse(response), null);
          if (!Array.isArray(list)) return callback(success, response);
          for (const item of list) {
            if (item && typeof item.name === "string") {
              const chinese = api.toChineseName(item.name);
              if (chinese) item.name = chinese;
            }
          }
          return callback(true, JSON.stringify(list));
        };
      }
      return original.apply(this, args);
    };
    wrapper.__afzhWrapped = true;
    native[methodName] = wrapper;
    return native[methodName] === wrapper;
  }

  // 插件方法 -> 钩子。JSON 搜索类方法集中在这里，nameFields 对应各页面 JSON 的字段名。
  const PLUGIN_HOOKS = [
    // 库存：mainInventory.js:318 `plugin.get().getFilteredInventory(query, includeAll, receive)`
    // forceTrueIndex=1：中文过滤需要完整列表，把 includeAll 强制为 true（插件否则最多返回 100 条）
    (native) => hookJsonSearchMethod(native, "getFilteredInventory", ["name"], { forceTrueIndex: 1 }),
    // 铸造：mainFoundry.js:249 `getFilteredFoundry(JSON.stringify(filterSettings), showAll, receive)`
    (native) => hookJsonSearchMethod(native, "getFilteredFoundry", ["name"]),
    // 遗物规划：mainRelicPlanner.js:92；结果走 onRelicPlannerUpdate 事件，这里只负责清空 search
    (native) => hookJsonSearchMethod(native, "getFilteredRelicPlanner", null),
    // WFM 订单/合同：ordersAndContracts.js:92 `plugin.get()[orders?'GetWFMOrders':'GetWFMContracts'](...)`
    (native) => hookJsonSearchMethod(native, "GetWFMOrders", ["name"]),
    (native) => hookJsonSearchMethod(native, "GetWFMContracts", ["weaponName", "name"]),
    // 已揭示裂罅：unveiled.js:60 `GetFilteredUnveiledRivensInfo(JSON.stringify(filters), receive)`
    (native) => hookJsonSearchMethod(native, "GetFilteredUnveiledRivensInfo", ["weaponName", "name"]),
    // 裂罅探索器武器搜索：general.js:187 `GetRivenWeapons(this.weaponSearchString, cb)`
    hookRivenWeapons,
    // 市场搜索建议（"Create an order" 选择器 warframeMarket/ui.js:98 也会走这里）
    hookMarketSuggestions
  ];

  const installedInstances = typeof WeakSet === "function" ? new WeakSet() : null;

  function installPluginHooks(native) {
    if (!native) return false;
    if (installedInstances && installedInstances.has(native)) return true;
    if (installedInstances) installedInstances.add(native);
    let installed = 0;
    for (const hook of PLUGIN_HOOKS) {
      const ok = safeCall(() => hook(native), false);
      if (ok) installed++;
    }
    status.hooks.plugin = installed;
    if (installed) {
      try { console.info("[AFZH 中文搜索] 插件级钩子已安装 " + installed + " 个"); } catch (_) { /* ignore */ }
    } else {
      debugOnce("pluginHooksNone", "插件级钩子一个都没装上（宿主方法名可能变了）");
    }
    return installed > 0;
  }

  function whenPluginReady() {
    // background.html 的插件对象是本地的（background.js:1）；main.html 是跨窗口引用。
    // 插件初始化是异步的（sharedOverwolfStuff.js:23-61），所以轮询最多 60 秒。
    if (!window.plugin || typeof window.plugin.get !== "function") {
      debugOnce("noPlugin", "window.plugin 不存在（当前窗口没有 C# 插件），跳过插件级钩子");
      return;
    }
    let attempts = 0;
    const tick = () => {
      const native = safeCall(getNativePlugin, null);
      if (native) {
        installPluginHooks(native);
        return;
      }
      attempts++;
      if (attempts >= 240) {
        debugOnce("pluginTimeout", "window.plugin.get() 60 秒内未就绪，跳过插件级钩子");
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  }

  // ---------------------------------------------------------------------------
  // 应用级钩子（只在 main.html 有效：那里才有 Vue 应用实例）
  // ---------------------------------------------------------------------------

  /** 遗物规划：数据通过 onRelicPlannerUpdate 事件回到 receiveUpdate，在这里按当前 search 过滤。 */
  function installRelicPlannerHook() {
    const app = window.relicPlannerApp;
    if (!app || typeof app.receiveUpdate !== "function") return false;
    if (app.__afzhRelicHook) return true;

    const original = app.receiveUpdate.bind(app);
    app.receiveUpdate = function (result, data, updateRecommended) {
      if (result === "data") {
        const term = this && typeof this.search === "string" ? this.search.trim() : "";
        if (term && api.hasChinese(term)) {
          markHit("relicPlannerApp.receiveUpdate");
          const filtered = safeCall(() => filterRelicPlannerPayload(data, term), null);
          if (Array.isArray(filtered)) data = JSON.stringify(filtered);
        }
      }
      return original(result, data, updateRecommended);
    };
    app.__afzhRelicHook = true;
    return true;
  }

  /** 遗物规划 JSON 过滤：遗物名（normalData.name）或任一奖励名（custom.rewards[].name）命中即可。 */
  function filterRelicPlannerPayload(data, term) {
    const parsed = safeCall(() => JSON.parse(data), null);
    if (!Array.isArray(parsed)) return null;
    const terms = api.splitTerms(term);
    if (!terms.length) return parsed;
    return parsed.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const names = [];
      if (item.normalData && typeof item.normalData.name === "string") names.push(item.normalData.name);
      const rewards = item.custom && item.custom.rewards;
      if (Array.isArray(rewards)) {
        for (const reward of rewards) {
          if (reward && typeof reward.name === "string") names.push(reward.name);
        }
      }
      if (!names.length) return false;
      const haystack = names.map((name) => api.searchableName(name)).join(" ");
      return terms.every((single) => haystack.indexOf(single) !== -1);
    });
  }

  /** 市场搜索建议面板：中文输入用本地词典出 50 条中文建议，点击时再换成官方 slug。 */
  function installMarketPanelHook() {
    const app = window.buySellPanelApp;
    if (!app || typeof app.updateSearchSuggestions !== "function" || typeof app.suggestionClicked !== "function") return false;
    if (app.__afzhMarketHook) return true;

    const originalUpdate = app.updateSearchSuggestions.bind(app);
    const originalClicked = app.suggestionClicked.bind(app);

    app.updateSearchSuggestions = function (delay) {
      const term = this && typeof this.wfmSearchCurrentGuess === "string" ? this.wfmSearchCurrentGuess.trim() : "";
      if (!term || !api.hasChinese(term)) return originalUpdate(delay);
      markHit("buySellPanelApp.updateSearchSuggestions");
      safeCall(() => clearTimeout(this.searchTimer));
      // 让还在飞的英文请求失效（marketQuotes.js:129 用 searchRequestId 丢弃过期回调）
      if (typeof this.searchRequestId === "number") this.searchRequestId++;
      this.searching = false;
      this.searchError = false;
      this.activeSuggestion = -1;
      this.searchSuggestions = api.marketSuggestions(term, 50);
      this.doingSearch = true;
    };

    app.suggestionClicked = function (name, urlName) {
      const english = api.englishFromMarketMarker(urlName);
      if (!english) return originalClicked(name, urlName);
      markHit("buySellPanelApp.suggestionClicked");
      resolveMarketUrlName(english, (resolved) => {
        if (!resolved || !resolved.urlName) {
          debugOnce("marketResolve:" + english, "市场建议：无法把「" + english + "」换成官方 slug，忽略本次点击");
          return;
        }
        return originalClicked(name, resolved.urlName);
      });
    };

    app.__afzhMarketHook = true;
    return true;
  }

  /** 用插件官方接口把英文物品名换成 warframe.market 的 slug（urlName）。 */
  function resolveMarketUrlName(englishName, done) {
    const native = safeCall(getNativePlugin, null);
    if (!native || typeof native.GetWFMarketSearchSuggestions !== "function") return done(null);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      done(value);
    };
    const started = safeCall(() => {
      native.GetWFMarketSearchSuggestions(englishName, (success, response) => {
        if (!success) return finish(null);
        const list = safeCall(() => JSON.parse(response), null);
        if (!Array.isArray(list)) return finish(null);
        const lower = englishName.toLowerCase();
        const exact = list.find((item) => item && typeof item.name === "string" && item.name.toLowerCase() === lower);
        const hit = exact || list.find((item) => item && typeof item.urlName === "string");
        return finish(hit || null);
      });
      return true;
    }, false);
    if (!started) finish(null);
  }

  function installAppHooks() {
    let attempts = 0;
    const tick = () => {
      const relic = safeCall(installRelicPlannerHook, false);
      const market = safeCall(installMarketPanelHook, false);
      status.hooks.relicPlanner = !!relic;
      status.hooks.marketPanel = !!market;
      if (relic && market) return;
      attempts++;
      if (attempts >= 40) {
        if (!relic) debugOnce("relicPlannerApp", "relicPlannerApp.receiveUpdate 不可用，跳过遗物规划中文过滤");
        if (!market) debugOnce("buySellPanelApp", "buySellPanelApp.updateSearchSuggestions/suggestionClicked 不可用，跳过市场建议中文列表");
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  }

  // ---------------------------------------------------------------------------
  // 启动
  // ---------------------------------------------------------------------------
  function start() {
    if (status.started) return;
    status.started = true;
    status.window = (typeof document !== "undefined" && document.getElementById && document.getElementById("tabInventory")) ? "main" : "background";
    if (!DICT) {
      debugOnce("noDict", "window.__AFCN_DICT__ 不存在，中文搜索不启用（只有 DOM 翻译层工作）");
      return;
    }
    if (!status.dictEntries) {
      debugOnce("emptyDict", "window.__AFCN_DICT__ 为空，中文搜索不启用");
      return;
    }
    whenPluginReady();
    installAppHooks();
    try {
      // 自检：把几个已知词条打出来，用于确认运行时词典/反向索引真的可用
      const probeText = "膛线";
      const probe = resolveEnglishQuery(probeText);
      const codes = [];
      for (const ch of probeText) codes.push(ch.codePointAt(0).toString(16));
      console.info(
        "[AlecaFrame-ZH] 中文搜索已加载：词条=" + status.dictEntries + " 反向=" + status.reverseEntries +
        " 窗口=" + status.window +
        " 自检: 膛线→" + JSON.stringify(probe) +
        " / Serration=" + JSON.stringify(api.index ? api.index.dict["Serration"] : undefined) +
        " / rev.get(膛线)=" + JSON.stringify(api.index && api.index.reverse ? api.index.reverse.get(probeText) : undefined) +
        " / hasChinese=" + JSON.stringify(api.hasChinese(probeText)) +
        " / hasChineseFn=" + typeof hasChinese +
        " / codes=" + codes.join(",") +
        " / cleaned=" + JSON.stringify(probeText.replace(INVISIBLE, "").trim().toLowerCase())
      );
    } catch (e) {
      try { console.info("[AlecaFrame-ZH] 自检异常：" + (e && e.message)); } catch (_) { /* ignore */ }
    }
  }

  if (typeof document === "undefined") {
    start();
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
