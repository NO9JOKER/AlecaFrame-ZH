# features-search

## 职责

中文搜索能力：纯索引/查询 API + 宿主 hook 层。

- `api.js`：`buildIndex`、正向/反向查询、部件组合、Prime 后缀、子串兜底、搜索建议；无 DOM、无定时器。
- `runtime.js`：插件/应用 hook、市场建议、遗物规划器过滤、裂罅列表/武器搜索、源力石页面整段补译、资源仓库前端过滤、诊断、启动；合并后保留 `__AFZH_SEARCH__` / `__AFZH_SEARCH_API__` 诊断接口。

不负责：DOM 翻译（`dom`）、动态规则（`rules`）、页面清单（`pages.json`）、源力石单元格文本重建（`features.archon.text`）。

## 边界

- 调用方：`entry` 启动后由 `runtime.js` 自启动；纯 API 可被测试单独加载。
- 依赖：`__AFCN_DICT__`、`__AFCN_TRANSLATE__`（archon 整段）、`runtime.features.archon`（单元格文本重建）、宿主 `window.plugin` / Vue 应用对象。
- 禁止：修改词典、页面名硬编码（搜索 hook 只按宿主方法/对象 feature-detect）。

## 输入输出

- `api.js` 暴露 `runtime.features.search.api`：
  - `englishForChinese(chinese)`、`toChineseName(english)`、`searchableName`、`marketSuggestions`、`englishFromMarketMarker` 等；
  - `resolveEnglishQuery(term)` 包装；`__AFZH_SEARCH_API__` 供控制台调试。
- `runtime.js` 暴露 `window.__AFZH_SEARCH__` 状态、`runtime.features.searchRuntime.start`。

## 契约与不变量

- 中文查询不送原生插件：清空 query JSON 的 `search`，拿完整列表后本地过滤；
- 前端自己过滤、不调插件接口的列表（资源仓库）则包 `window.ResourcePlanner.matches`
  （`api.matchesText`）：中文走「中文字幕名 + 英文原名」匹配，`名称 + 位置` 拼接行退化为
  「最长可翻译前缀（物品名）」；英文/空查询不干预；
- 本地过滤 0 命中时才尝试英文改写；
- 英文/空查询不干预；
- 每个 hook 必须 feature-detect；宿主缺失只 `debugOnce` 并跳过，不抛异常；
- 钩子安装幂等（`__afzh*Hook` 标志）；
- 反向索引同中文多英文按“中文最短→英文最短→字母序”确定性择词；
- 不修改宿主业务数据，只包装方法并本地过滤。

## 修改指引

- 纯查询/索引 → `api.js` + `tests/search-feature.test.mjs`；
- 宿主 hook → `runtime.js`，必须记录目标方法/对象与窗口；
- archon 整段处理仍在 `runtime.js` 的 archon pass；单元格文本重建/图标回填在
  `features/archon/text.js`（纯函数，`tests/runtime.test.mjs` 覆盖）；
- 搜索行为变化必须补测试 + 真机中文输入验证。

## 测试

```powershell
node tests\search-feature.test.mjs
node tests\runtime.test.mjs
node tests\rules.test.mjs
node tests\search-feature.test.mjs       # 既有回归
```

未覆盖：真实插件/Vue 集成；由真机仓库/铸造厂/赋能/遗物规划器/裂罅界面验证。

## 失败模式

- 插件方法不存在 → `debugOnce` 跳过，搜索不生效但页面不崩；
- 反向索引择词错误 → 检查同中文多英文桶；
- `includeAll=false` 只返回 100 条 → 依赖 forceTrueIndex 强制完整列表；
- 市场建议点击需要官方 slug → `resolveMarketUrlName` 失败时忽略本次点击；
- 源力石 v-html 单元格查不到词条 → 常见原因是整段里出现 `Toxin Toxin`（图标 alt 重复），
  检查 `features/archon/text.js` 的 alt 去重；写回译文时不要用 `textContent` 覆盖（会丢图标）。

## 关联

- [src/runtime/AGENTS.md](../../../src/runtime/AGENTS.md)
- [ADR 0001](../../decisions/0001-capability-first-architecture.md)
