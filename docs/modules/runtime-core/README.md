# runtime-core

## 职责

提供无宿主依赖的纯运行时基础：字符串归一、词典索引、翻译决策链。`core.translate` 只依赖索引与注入的规则/复合函数，不接触 DOM、页面或宿主 API。

不负责：DOM 遍历、MutationObserver、中文搜索 hook、页面适配、构建产物注入。

## 边界

- 调用方：`runtime/rules`、`runtime/dom`、`runtime/features`、`runtime/entry`。
- 允许依赖：仅 `core.normalize`、`core.dict-index`。
- 禁止：window/document/host/页面名/网络/文件系统。
- 模块装配顺序由 `src/runtime/modules.json` 定义。

## 输入输出

- `normalize.norm(text) -> string`：空白折叠 + trim。
- `normalize.hasCjk(text) -> boolean`、`hasLatin(text) -> boolean`。
- `dictIndex.buildIndex(dict) -> { map, lowerMap }`：Map；first-wins；纯拉丁键额外建小写索引。
- `translate.createTranslator(index, { composites, rules }) -> { translate(text) }`：
  - 决策链：归一 → 精确 → 小写兜底 → composites → rules → null；
  - composite：`(text, translate) => string|null`；内置复合只处理「节点, 星球」文本：
    星球文本翻成中文，前缀整体/前导 1–2 个词能命中词条时翻成中文（如 `Recording Lares, Mercury`
    → `录制中 Lares，水星`），节点名保持英文；
  - rule：`(text, translate) => string|null` 或 `{ id, match(text, translate) }`。

## 契约与不变量

- 精确匹配优先；不做模糊/词形变化。
- 纯中文/无拉丁文本返回 null，保持原文。
- 词典 first-wins；`lowerMap` 只对无 CJK 的键生效。
- 规则按数组顺序执行；命中第一个返回字符串的规则结束。
- 所有函数无副作用、无宿主依赖。

## 修改指引

- 新纯函数/索引行为 → 本目录 + `tests/runtime.test.mjs`；
- 规则内容 → `src/runtime/rules/`（下一阶段），不要塞进 core；
- 改决策链顺序 → 必须补正反例测试，并在 ADR/PR 说明行为变化。

## 测试

```powershell
node tests\runtime.test.mjs
```

覆盖：模块装配顺序、归一、CJK/拉丁判定、first-wins、精确/小写、composites、rules、未命中返回 null。

未覆盖：DOM/宿主/真实页面（由 W3/W4 集成测试与真机负责）。

## 失败模式

- 模块未按 `modules.json` 顺序加载 → `createTranslator`/`buildIndex` 抛初始化错误；
- 词典值非字符串/空值 → 索引跳过；
- 规则返回空字符串 → 视为未命中（函数要求 string 且非空？由规则自身保证）；
- 大小写变体在数据层仍有重复 → `dict.py check` 告警，见词典 W1b。

## 关联文档

- [ADR 0001](../../decisions/0001-capability-first-architecture.md)
- [AGENTS.md](../../../AGENTS.md)
- [src/runtime/AGENTS.md](../../../src/runtime/AGENTS.md)
- [schemas/modules.schema.json](../../../schemas/modules.schema.json)
