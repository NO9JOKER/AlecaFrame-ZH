/* AlecaFrame-ZH runtime · features.search.api
 * Pure Chinese-search index/query API. No DOM, no host hooks, no timers.
 * The runtime hook layer consumes runtime.features.search.api.
 */
(function (root) {
  "use strict";

  const runtime = (root.__AFCN_RUNTIME__ = root.__AFCN_RUNTIME__ || {});
  runtime.features = runtime.features || {};

  const DICT = (root.__AFCN_DICT__ && typeof root.__AFCN_DICT__ === "object") ? root.__AFCN_DICT__ : null;
  // 遗物基础名 -> 奖励中文名（空格分隔）。由 src/build_relic_rewards.py 生成、build.py 注入。
  const RELIC_REWARDS = (root.__AFCN_RELIC_REWARDS__ && typeof root.__AFCN_RELIC_REWARDS__ === "object") ? root.__AFCN_RELIC_REWARDS__ : null;

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

    /** 遗物奖励中文名：去掉精炼后缀后查 __AFCN_RELIC_REWARDS__；没有就返回空串。 */
    function relicRewardText(item) {
      if (!RELIC_REWARDS || !item) return "";
      const name = typeof item.name === "string" ? item.name : "";
      if (!name) return "";
      let text = RELIC_REWARDS[name];
      if (!text) {
        for (const suffix of REFINE_EN) {
          if (name.length > suffix.length && name.endsWith(suffix)) {
            text = RELIC_REWARDS[name.slice(0, -suffix.length)];
            break;
          }
        }
      }
      return typeof text === "string" ? text.toLowerCase() : "";
    }

    /**
     * 本地过滤：按空格拆词后 **每个词都必须命中**（AND）。
     * 每个字段的可搜索文本 = 中文字幕名 + 英文原名（都小写），所以中英文混输也能过滤。
     * 遗物额外拼上奖励中文名（库存遗物列表只带遗物名，奖励由 __AFCN_RELIC_REWARDS__ 提供）。
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
        const relicText = relicRewardText(item);
        if (relicText) chunks.push(relicText);
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
    function marketSuggestions(term, limit) {      return suggestions(term, limit).map((hit) => ({
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
      hookArcaneApp,
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
  root.__AFZH_SEARCH_API__ = api;
  runtime.features.search = {
    api: api,
    createApi: createApi,
    buildIndex: buildIndex,
    resolveEnglishQuery: resolveEnglishQuery,
    createTestExports: createTestExports,
    hasChinese: hasChinese,
    splitTerms: splitTerms,
    normKey: normKey,
    PART_EN_TO_ZH: PART_EN_TO_ZH,
    PART_EN_SORTED: PART_EN_SORTED,
    PART_ZH_SORTED: PART_ZH_SORTED,
    REFINE_EN: REFINE_EN,
    REFINE_ZH: REFINE_ZH,
    MARKET_MARKER: MARKET_MARKER
  };
})(typeof globalThis !== "undefined" ? globalThis : this);