/* AlecaFrame-ZH runtime · features.search.runtime
 * Chinese search host hooks, diagnostics and startup.
 * Depends on runtime.features.search.api from features/search/api.js.
 */
(function (root) {
  "use strict";

  const runtime = (root.__AFCN_RUNTIME__ = root.__AFCN_RUNTIME__ || {});
  const feature = runtime.features && runtime.features.search;
  if (!feature) throw new Error("features.search.runtime requires features.search.api");
  const api = feature.api;
  const resolveEnglishQuery = feature.resolveEnglishQuery;
  const archonText = runtime.features && runtime.features.archon;
  if (!archonText) throw new Error("features.search.runtime requires features.archon.text");
  const DICT = root.__AFCN_DICT__;
  const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00A0\u3000]/g;
  if (root.__AFZH_SEARCH__) return;

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
  root.__AFZH_SEARCH__ = status;
  // 控制台调试用：__AFZH_SEARCH_API__.englishForChinese("杀格 Prime 枪管蓝图")
  root.__AFZH_SEARCH_API__ = api;

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

  function getNativePlugin() {
    const plugin = root.plugin;
    if (!plugin || typeof plugin.get !== "function") return null;
    const native = plugin.get();
    return native && typeof native === "object" ? native : null;
  }

  // ---------------------------------------------------------------------------
  // 插件级钩子（在 background 窗口 里最有效：那里 root.plugin.get() 是本地 C# 插件实例）
  // ---------------------------------------------------------------------------

  /**
   * 通用「JSON 查询里带中文 search」的钩子。
   *
   * 顺序为「**本地过滤优先**」：
   *   1) 中文查询不送原生：把 query JSON 里的 search 清空，让插件按其它过滤条件（分类/筛选）
   *      返回该页面的完整列表，再用中文/英文双向索引在本地过滤 —— 因此支持**部分中文**
   *      （输入「死亡」能命中「死亡使徒」「死亡魔方」等），且只在当前分类/筛选范围内匹配；
   *   2) 本地过滤 0 命中时，若有可靠的英文候选，再退回一次「英文查询改写」交原生搜
   *      （覆盖「列表里的物品名在词典里翻不出来」的情况）；
   *   3) 英文/空查询完全不干预。
   *
   * 不能优先做英文改写：反向索引里混着 UI 术语，部分中文会被查成一个无关的英文名。
   * 实测 2026-11-07：`Death -> 死亡` 会让「死亡」被改写成 `Death`，原生在铸造厂里
   * 一个都搜不到；同一份词典里「死亡使徒」= Kaszas 本来能本地匹配。
   *
   * @param {string[]|null} nameFields 过滤用的字段；null 表示只清空 search（数据由事件异步回来）。
   * @param {{forceTrueIndex?: number}} options forceTrueIndex：把该下标的实参强制为 true。
   *        「库存」用它把 includeAll 的第 2 个实参置 true ——
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
          try {
            const first = parsed.length && parsed[0] && typeof parsed[0] === "object" ? parsed[0] : null;
            console.info(
              "[AFZH 中文搜索] " + methodName + ' 中文="' + term + '" 本地 0 命中：原生 ' +
              parsed.length + " 条" +
              (first ? "，首条 name=" + JSON.stringify(first.name) + " 字段=" + Object.keys(first).slice(0, 8).join("/") : "") +
              "，退回英文改写=" + JSON.stringify(english)
            );
          } catch (_) { /* ignore */ }
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
   * 裂罅列表搜索（已揭示 / 未揭示）：调用点
   * `GetFilteredUnveiledRivensInfo(JSON.stringify(filters), receive)` /
   * `GetFilteredVeiledRivensInfo(JSON.stringify(filters), receive)`。
   * 返回的是「分组数组」（每组含 rivens），不是平铺物品，所以不能用
   * hookJsonSearchMethod；中文查询清空 search 取全量后交给 api.filterRivenGroups
   * 本地过滤（裂罅名/武器名/挑战文案/分组标题/词条属性），英文查询不干预。
   */
  function hookRivenListSearch(native, methodName) {
    const original = native[methodName];
    if (typeof original !== "function") {
      debugOnce("missing:" + methodName, methodName + "() 不存在，跳过裂罅列表搜索钩子");
      return false;
    }
    if (original.__afzhWrapped) return true;

    const wrapper = function (query, callback) {
      const nativeThis = this;
      let filters = null;
      safeCall(() => { filters = JSON.parse(query); }, null);
      if (!filters || typeof filters !== "object") return original.apply(nativeThis, arguments);
      const term = typeof filters.search === "string" ? filters.search.trim() : "";
      if (!term || !api.hasChinese(term)) return original.apply(nativeThis, arguments);

      const args = Array.prototype.slice.call(arguments);
      args[0] = JSON.stringify(Object.assign({}, filters, { search: "" }));
      const callbackIndex = args.length - 1;
      if (typeof args[callbackIndex] !== "function") return original.apply(nativeThis, arguments);

      args[callbackIndex] = function (success, data) {
        if (!success) return callback(success, data);
        const parsed = safeCall(() => JSON.parse(data), null);
        let filtered = null;
        if (Array.isArray(parsed)) {
          // 已揭示裂罅是平铺数组；未揭示裂罅是分组数组（每组含 rivens）。
          const grouped = parsed.some((entry) => entry && typeof entry === "object" && Array.isArray(entry.rivens));
          filtered = safeCall(() => (grouped ? api.filterRivenGroups(parsed, term) : api.filterRivenItems(parsed, term)), null);
        }
        if (Array.isArray(filtered) && filtered.length > 0) {
          markHit(methodName + ":本地过滤");
          return callback(true, JSON.stringify(filtered));
        }
        // 本地文本没命中（例如属性字段没带出来）：用中文→英文候选让原生再搜一次。
        const english = safeCall(() => resolveEnglishQuery(term), null);
        if (english && !api.hasChinese(english)) {
          markHit(methodName + ":本地0命中→英文改写");
          const retry = args.slice();
          retry[0] = JSON.stringify(Object.assign({}, filters, { search: english }));
          retry[callbackIndex] = callback;
          return original.apply(nativeThis, retry);
        }
        return callback(true, JSON.stringify(Array.isArray(filtered) ? filtered : []));
      };
      return original.apply(nativeThis, args);
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
    // 库存：库存列表调用点 `plugin.get().getFilteredInventory(query, includeAll, receive)`
    // forceTrueIndex=1：中文过滤需要完整列表，把 includeAll 强制为 true（插件否则最多返回 100 条）
    (native) => hookJsonSearchMethod(native, "getFilteredInventory", ["name"], { forceTrueIndex: 1 }),
    // 铸造：铸造列表调用点 `getFilteredFoundry(JSON.stringify(filterSettings), showAll, receive)`
    // forceTrueIndex=1：中文过滤需要完整列表，把 showAll 强制为 true（实测 search 为空时原生只回 100 条，
    // 「死亡」「极速」这类中文名在按字母序排到 100 之外的物品会被漏掉）
    (native) => hookJsonSearchMethod(native, "getFilteredFoundry", ["name"], { forceTrueIndex: 1 }),
    // 遗物规划：mainRelicPlanner.js:92；结果走 onRelicPlannerUpdate 事件，这里只负责清空 search
    (native) => hookJsonSearchMethod(native, "getFilteredRelicPlanner", null),
    // WFM 订单/合同：ordersAndContracts.js:92 `plugin.get()[orders?'GetWFMOrders':'GetWFMContracts'](...)`
    (native) => hookJsonSearchMethod(native, "GetWFMOrders", ["name"]),
    (native) => hookJsonSearchMethod(native, "GetWFMContracts", ["weaponName", "name"]),
    // 已揭示裂罅：`GetFilteredUnveiledRivensInfo(JSON.stringify(filters), receive)` 返回分组数组
    (native) => hookRivenListSearch(native, "GetFilteredUnveiledRivensInfo"),
    // 未揭示裂罅：`GetFilteredVeiledRivensInfo(JSON.stringify(filters), receive)` 返回分组数组
    (native) => hookRivenListSearch(native, "GetFilteredVeiledRivensInfo"),
    // 裂罅探索器武器搜索：裂罅探索器调用点 `GetRivenWeapons(this.weaponSearchString, cb)`
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


  /**
   * 部分窗口（尤其 main）每次 plugin.get() 返回的是新的桥接对象；
   * 只包装安装时那一个实例会让页面后续调用绕过中文过滤。这里包一层 plugin.get，
   * 每次拿到对象就补装钩子，保证所有调用点都能命中。
   */
  function ensurePatchedPluginGet(native) {
    const plugin = root.plugin;
    if (!plugin || typeof plugin.get !== "function" || plugin.__afzhGetWrapped) return false;
    const originalGet = plugin.get;
    plugin.get = function () {
      const value = originalGet.apply(this, arguments);
      safeCall(() => {
        if (value && typeof value === "object") installPluginHooks(value);
      }, false);
      return value;
    };
    plugin.__afzhGetWrapped = true;
    return true;
  }

  function whenPluginReady() {
    // background 窗口 的插件对象是本地的（background 脚本）；main 窗口 是跨窗口引用。
    // 插件初始化是异步的（sharedOverwolfStuff.js:23-61），所以轮询最多 60 秒。
    if (!root.plugin || typeof root.plugin.get !== "function") {
      debugOnce("noPlugin", "root.plugin 不存在（当前窗口没有 C# 插件），跳过插件级钩子");
      return;
    }
    let attempts = 0;
    const tick = () => {
      const native = safeCall(getNativePlugin, null);
      if (native) {
        installPluginHooks(native);
        ensurePatchedPluginGet(native);
        return;
      }
      attempts++;
      if (attempts >= 240) {
        debugOnce("pluginTimeout", "root.plugin.get() 60 秒内未就绪，跳过插件级钩子");
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  }

  // ---------------------------------------------------------------------------
  // 应用级钩子（只在 main 窗口 有效：那里才有 Vue 应用实例）
  // ---------------------------------------------------------------------------

  /** 遗物规划：数据通过 onRelicPlannerUpdate 事件回到 receiveUpdate，在这里按当前 search 过滤。 */
  function installRelicPlannerHook() {
    const app = root.relicPlannerApp;
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
    const app = root.buySellPanelApp;
    if (!app || typeof app.updateSearchSuggestions !== "function" || typeof app.suggestionClicked !== "function") return false;
    if (app.__afzhMarketHook) return true;

    const originalUpdate = app.updateSearchSuggestions.bind(app);
    const originalClicked = app.suggestionClicked.bind(app);

    app.updateSearchSuggestions = function (delay) {
      const term = this && typeof this.wfmSearchCurrentGuess === "string" ? this.wfmSearchCurrentGuess.trim() : "";
      if (!term || !api.hasChinese(term)) return originalUpdate(delay);
      markHit("buySellPanelApp.updateSearchSuggestions");
      safeCall(() => clearTimeout(this.searchTimer));
      // 让还在飞的英文请求失效（市场请求点 用 searchRequestId 丢弃过期回调）
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

  /**
   * 库存「赋能」页：不调用 getFilteredInventory，而是在 库存赋能页 receiveArcaneProgress()
   * 里用 this.search 对 `item.name + ' ' + item.category` 做英文子串过滤（Vue 侧过滤），
   * 插件钩子根本看不到这个查询。这里改为：临时清空 search 让原方法只做其它筛选/排序，
   * 再用中文索引过滤 this.items。
   */
  function hookArcaneApp(app) {
    if (!app || typeof app.receiveArcaneProgress !== "function") return false;
    if (app.__afzhArcaneHook) return true;

    const original = app.receiveArcaneProgress.bind(app);
    app.receiveArcaneProgress = function (requestId, success, data, includeAll, queryChanged) {
      const term = this && typeof this.search === "string" ? this.search.trim() : "";
      if (!term || !api.hasChinese(term)) return original(requestId, success, data, includeAll, queryChanged);

      markHit("inventoryApp.receiveArcaneProgress:本地过滤");
      const saved = this.search;
      this.search = "";
      try {
        // includeAll 传 true：原方法默认把 rows 截断到 100 条，中文过滤需要全量
        original(requestId, success, data, true, queryChanged);
      } finally {
        this.search = saved;
      }
      const filtered = safeCall(() => api.filterItems(this.items, term, ["name"]), null);
      if (Array.isArray(filtered)) {
        try {
          console.info("[AFZH 诊断] 赋能 中文=" + JSON.stringify(term) + " 全量=" + (Array.isArray(this.items) ? this.items.length : "?") + " 过滤后=" + filtered.length);
        } catch (_) { /* ignore */ }
        this.items = filtered;
        this.noItems = !filtered.length;
        this.resultsLimited = false;
      }
    };
    app.__afzhArcaneHook = true;
    return true;
  }

  function installInventoryArcaneHook() {
    return hookArcaneApp(root.inventoryApp);
  }

  /**
   * 裂罅上架 WFM 的诊断：
   *  - 把 WFM 报错 toast 的完整文本写进控制台（toast 原本不进日志，出错时无从查）；
   *  - 上架前记录武器名、属性描述与三档价格，便于定位是哪个词条导致 400（如熔接词条）。
   */
  function installRivenListingDiagnostics() {
    let ok = false;
    const toast = root.showErrorToast;
    if (typeof toast === "function" && !root.__afzhToastHook) {
      root.showErrorToast = function (message) {
        try {
          if (typeof message === "string" && /listing riven|WFM/i.test(message)) {
            console.info("[AFZH 诊断] WFM 报错：" + message);
          }
        } catch (_) { /* ignore */ }
        return toast.apply(this, arguments);
      };
      root.__afzhToastHook = true;
    }
    const app = root.rivenDetailsApp;
    if (app && typeof app.listOnWFM === "function" && !app.__afzhListHook) {
      const original = app.listOnWFM.bind(app);
      app.listOnWFM = function () {
        try {
          const riven = this.riven || {};
          const traits = [];
          for (const weapon of riven.statsPerWeapon || []) {
            for (const level of (weapon && weapon.byLevel) || []) {
              for (const trait of (level.positiveTraits || []).concat(level.negativeTraits || [])) {
                if (trait) traits.push(trait.description || trait.name || trait);
              }
            }
          }
          const summary = traits.length ? traits : riven.traits || [];
          console.info(
            "[AFZH 诊断] WFM 上架尝试：武器=" + JSON.stringify(riven.weaponName || "") +
            " 属性=" + JSON.stringify(summary).slice(0, 1200) +
            " 价格=" + [this.WFMsellingPrice, this.WFMstartingPrice, this.WFMbuyoutPrice].join("/") +
            " 类型=" + JSON.stringify(this.listType) + " 可见性=" + JSON.stringify(this.listVisibility)
          );
        } catch (_) { /* ignore */ }
        return original.apply(this, arguments);
      };
      app.__afzhListHook = true;
      ok = true;
    }
    return ok;
  }

  /**
   * 资源仓库（main 窗口 → 资源仓库）：该页在前端用
   * `ResourcePlanner.matches(text, query)` 过滤（resources.js 顶部的 var），
   * 不调用插件搜索接口；这里包一层，让中文查询走词典索引。
   * 目标：`window.ResourcePlanner.matches`；只包一次（`__afzhMatchesHook`）。
   */
  function installResourcesSearchHook() {
    const planner = root.ResourcePlanner;
    if (!planner || typeof planner.matches !== "function") return false;
    if (planner.__afzhMatchesHook) return true;
    const original = planner.matches;
    planner.matches = function (text, query) {
      if (api.hasChinese(query)) {
        const matched = safeCall(() => api.matchesText(text, query), false);
        if (matched) { markHit("ResourcePlanner.matches"); return true; }
      }
      return original.call(this, text, query);
    };
    planner.__afzhMatchesHook = true;
    return true;
  }

  /**
   * 裂罅列表页（已揭示 / 未揭示）的**应用级**兜底：
   * 无论插件方法是否被成功包装，都在 Vue 应用层把中文查询换成「先取全量、再本地过滤」。
   * 做法：refresh 前把 selectedSearch 临时置空（页面输入框在同一 tick 内恢复中文），
   * 数据回来后过滤 items/itemGroups 并写回。
   */
  function hookRivenApp(app, dataKey) {
    if (!app || typeof app.refresh !== "function" || typeof app.$watch !== "function") return false;
    if (app.__afzhRivenSearch) return true;
    const originalRefresh = app.refresh;
    app.refresh = function () {
      const term = typeof this.selectedSearch === "string" ? this.selectedSearch.trim() : "";
      if (!term || !api.hasChinese(term)) {
        this.__afzhRivenTerm = "";
        return originalRefresh.apply(this, arguments);
      }
      this.__afzhRivenTerm = term;
      this.selectedSearch = "";
      try {
        return originalRefresh.apply(this, arguments);
      } finally {
        // 同一 tick 内恢复，Vue 渲染时输入框仍是用户输入的中文
        this.selectedSearch = term;
      }
    };
    app.$watch(dataKey, function (value) {
      const term = app.__afzhRivenTerm;
      if (!term || app.__afzhRivenApplying) return;
      const parsed = Array.isArray(value) ? value : [];
      const filtered = dataKey === "itemGroups"
        ? api.filterRivenGroups(parsed, term)
        : api.filterRivenItems(parsed, term);
      if (!Array.isArray(filtered) || filtered.length === parsed.length) return;
      app.__afzhRivenApplying = true;
      try {
        app[dataKey] = filtered;
      } finally {
        app.__afzhRivenApplying = false;
      }
    });
    app.__afzhRivenSearch = true;
    markHit("rivenApp:" + dataKey);
    return true;
  }

  function installRivenAppSearchHooks() {
    const unveiled = safeCall(() => hookRivenApp(root.unveiledRivensApp, "items"), false);
    const veiled = safeCall(() => hookRivenApp(root.veiledRivensApp, "itemGroups"), false);
    return !!unveiled || !!veiled;
  }

  function installAppHooks() {
    let attempts = 0;
    const tick = () => {
      const relic = safeCall(installRelicPlannerHook, false);
      const market = safeCall(installMarketPanelHook, false);
      const arcane = safeCall(installInventoryArcaneHook, false);
      const rivenDiag = safeCall(installRivenListingDiagnostics, false);
      const resources = safeCall(installResourcesSearchHook, false);
      const rivenSearch = safeCall(installRivenAppSearchHooks, false);
      status.hooks.relicPlanner = !!relic;
      status.hooks.marketPanel = !!market;
      status.hooks.inventoryArcane = !!arcane;
      status.hooks.rivenListing = !!rivenDiag;
      status.hooks.resources = !!resources;
      status.hooks.rivenSearch = !!rivenSearch;
      if (relic && market && arcane && resources && rivenSearch) return;
      attempts++;
      if (attempts >= 40) {
        if (!relic) debugOnce("relicPlannerApp", "relicPlannerApp.receiveUpdate 不可用，跳过遗物规划中文过滤");
        if (!market) debugOnce("buySellPanelApp", "buySellPanelApp.updateSearchSuggestions/suggestionClicked 不可用，跳过市场建议中文列表");
        if (!arcane) debugOnce("inventoryApp", "inventoryApp.receiveArcaneProgress 不可用，跳过赋能页中文过滤");
        if (!resources) debugOnce("resourcePlannerMissing", "ResourcePlanner.matches 不可用，跳过资源仓库中文过滤");
        if (!rivenSearch) debugOnce("rivenAppMissing", "unveiledRivensApp/veiledRivensApp 不可用，跳过裂罅页面中文过滤");
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  }

  // ---------------------------------------------------------------------------
  // 源力石页面补译
  // ---------------------------------------------------------------------------
  /**
   * 效果指南/融合配方/详情是 v-html 渲染，伤害图标把整句切成多个文本节点。
   * 先按单元格整段还原文本查词典/规则，命中后写回译文并保留行内图标。
   * 文本重建（不可见节点、去重 alt）是纯函数，见 features/archon/text.js。
   */
  function archonCellText(el) {
    return archonText.cellText(archonText.collectParts(el));
  }

  function applyArchonText(el, parts, text) {
    if (!parts.some((part) => part.type === "img")) {
      if (el.textContent.trim() !== text) el.textContent = text;
      return;
    }
    const nodes = archonText.rebuild(parts, text, (label) => {
      try { return root.__AFCN_TRANSLATE__(label); } catch (_) { return null; }
    });
    const children = nodes.map((part) => (part.type === "img" ? part.node : document.createTextNode(part.value)));
    if (typeof el.replaceChildren === "function") el.replaceChildren.apply(el, children);
    else {
      while (el.firstChild) el.removeChild(el.firstChild);
      for (const child of children) el.appendChild(child);
    }
  }

  function translateArchonComposite() {
    const tr = root.__AFCN_TRANSLATE__;
    if (typeof tr !== "function") return;
    const selectors = [".archonFrameEffects span", ".archonEffectRow p", ".archonRecipeCard p", ".archonFrameCard small", ".archonDetails p", ".archonDetailSlot p", ".archonGuideHeading h3"];
    for (const selector of selectors) {
      let nodes;
      try { nodes = document.querySelectorAll(selector); } catch (_) { continue; }
      for (const el of nodes) {
        const parts = archonText.collectParts(el);
        const text = archonText.cellText(parts);
        if (!text || text.length > 300) continue;
        // 已经是译文（不含拉丁字母）就不再处理，避免反复叠加
        if (!/[A-Za-z]/.test(text)) continue;
        let result = null;
        try { result = tr(text); } catch (_) { result = null; }
        if (typeof result === "string" && result !== text) applyArchonText(el, parts, result);
      }
    }
  }

  let archonPassTimer = null;
  function scheduleArchonPass() {
    if (archonPassTimer) return;
    archonPassTimer = setTimeout(() => {
      archonPassTimer = null;
      translateArchonComposite();
    }, 80);
  }

  function installArchonTranslatePass() {
    if (root.__afzhArchonPass) return;
    root.__afzhArchonPass = true;
    try {
      const host = document.body || document.documentElement;
      if (host && typeof MutationObserver === "function") {
        new MutationObserver(scheduleArchonPass).observe(host, { childList: true, subtree: true, characterData: true });
      }
    } catch (_) { /* ignore */ }
    setInterval(translateArchonComposite, 3000);
  }

  // ---------------------------------------------------------------------------
  // 启动
  // ---------------------------------------------------------------------------
  function start() {
    if (status.started) return;
    status.started = true;
    status.window = (typeof document !== "undefined" && document.getElementById && document.getElementById("tabInventory")) ? "main" : "background";
    if (!DICT) {
      debugOnce("noDict", "root.__AFCN_DICT__ 不存在，中文搜索不启用（只有 DOM 翻译层工作）");
      return;
    }
    if (!status.dictEntries) {
      debugOnce("emptyDict", "root.__AFCN_DICT__ 为空，中文搜索不启用");
      return;
    }
    whenPluginReady();
    installAppHooks();
    installArchonTranslatePass();
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
        " / hasChineseFn=" + typeof api.hasChinese +
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

  runtime.features.searchRuntime = { start: start, status: status, hookRivenApp: hookRivenApp, installRivenAppSearchHooks: installRivenAppSearchHooks };
})(typeof globalThis !== "undefined" ? globalThis : this);