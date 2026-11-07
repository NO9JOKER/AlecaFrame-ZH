# runtime-rules

## 职责

按顺序执行的动态文本规则表：裂罅百分比/倍率/符号、源力石数量、统计日期、通用数字/日期/段位等。每条规则是 `{ id, match(text, translate) => string|null }`，首个命中即返回。

不负责：静态词条、DOM 遍历、搜索 hook、页面适配。

## 边界

- 调用方：`core.translate` 的 `rules` 选项；`entry` 组装。
- 依赖：仅 `core.normalize`（通过函数参数拿 `translate`，不直接持有索引）。
- 禁止：window/document/host/页面名。

## 输入输出

- 输入：整段文本（已归一）、`translate(text)` 回调。
- 输出：翻译后的整串，或 `null`（保持英文）。
- 顺序：数组顺序即优先级；具体规则必须放在宽泛规则之前（`+N more effects` 先于 `(.+) effects`）。

## 契约与不变量

- 规则必须全串锚定（`^...$`），不能匹配片段；
- 数字格式统一兼容千分位/小数；
- 规则不得再次调用自身造成循环；
- 只返回字符串或 null；不改输入、无副作用；
- 规则表顺序变化属于行为变更，需要测试。

## 修改指引

- 新增/修改规则 → 本文件 + `tests/rules.test.mjs`；
- 需要词条配合时，在 `dict/entries` 补词条，不要硬编码数字；
- 复杂 DOM/上下文规则 → 放到 `features` 或 `dom`，不要塞进规则表。

## 测试

```powershell
node tests\rules.test.mjs
node tests\runtime.test.mjs
```

覆盖：规则表数量、复合文本、裂罅百分比/倍率、源力石、段位、日期、未知文本。

## 失败模式

- 宽泛规则排在具体规则前 → 具体规则不可达（`+1 more effects` 曾出现此问题，已调整顺序）；
- 正则过宽 → 误伤普通文本；必须加正反例；
- 翻译回调返回 null 又拼接 → 输出中英混合；按现有规则返回 null 或使用原文的约定处理。

## 关联

- [ADR 0001](../../decisions/0001-capability-first-architecture.md)
- [AGENTS.md](../../../AGENTS.md)
- [src/runtime/rules/index.js](../../../src/runtime/rules/index.js)
