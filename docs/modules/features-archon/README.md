# features-archon

## 职责

源力石（Archon shard）页面的整段文本处理：把 `v-html` 效果单元格里的多个文本节点还原成
可精确匹配的整句，并在写回译文时保留行内伤害图标。不负责：词典词条、动态规则内容、
搜索 hook、页面清单。

## 边界

- 调用方：`features.search.runtime` 的 archon pass（`translateArchonComposite`）。
- 依赖：无（纯函数，不读 `document`/全局名）。
- 禁止：在纯函数里做 DOM 读写、联网、读文件、写 secrets；页面专属选择器留在调用方。

## 输入输出

- `collectParts(element) -> Array<{type:"text",value}|{type:"img",node,label}>`：
  按文档顺序拍平单元格；图片取 `alt`/`title` 作为元素名。
- `cellText(parts) -> string`：重建整段英文；图片 alt 只在正文完全没出现该词时补入，
  避免 `+30% <img alt="Toxin"> Toxin …` 变成 `Toxin Toxin`。
- `rebuild(parts, translated, translateLabel) -> Array<{type:"text",value}|{type:"img",node}>`：
  把译文按元素名（Toxin→毒素）拆回文本段 + 原 `<img>`；元素名翻不出时图标保留在原位。

## 契约与不变量

- 图标只能移动、不能丢失；译文只能是词典/规则返回的字符串，不做拼接猜测。
- 已经是中文（不含拉丁字母）的单元格不再进入翻译，天然防循环。
- 纯函数不依赖 DOM 实现，可在 Node VM 里用普通对象测试。

## 修改指引

- 文本重建/图标回填 → `src/runtime/features/archon/text.js` + `tests/runtime.test.mjs`；
- 调用时机/选择器 → `src/runtime/features/search/runtime.js` 的 archon pass；
- 新的效果文案 → 词典或 `src/runtime/rules/index.js`，不要写进本模块。

## 测试

```powershell
node tests\runtime.test.mjs
```

覆盖：alt 去重、正文缺词时补 alt、译文锚点回填、未知元素名时保留图标。
未覆盖：真实 Overwolf/CEF DOM；由 `docs/verification/REAL_MACHINE.md` 的源力石页面清单补 REAL。

## 失败模式

- 单元格仍显示英文 → 检查是否又出现 `Toxin Toxin` 类重复（alt 去重失效）或词典缺整串；
- 图标消失 → 检查写回路径是否绕过 `rebuild()`（直接用 `textContent` 覆盖会丢图标）；
- 图标位置怪 → 目标语言的元素名与 `translate(alt)` 不一致，需要补词条或调整锚点。

## 关联文档

- [src/runtime/AGENTS.md](../../../src/runtime/AGENTS.md)
- [features-search](../features-search/README.md)
- [ADR 0001](../../decisions/0001-capability-first-architecture.md)
