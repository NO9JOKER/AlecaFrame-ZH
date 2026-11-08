# runtime-rules

## 职责

按顺序执行的动态文本规则表：裂罅百分比/倍率/符号、源力石数量、统计日期、通用数字/日期/段位、资源掉落来源（星球/节点/任务/轮次、前缀、等级区间、PHASE、派系/商人来源），以及仲裁实时窗口/运行记录的 Vue 合并文本节点与 run-chart Canvas 提示格式。每条规则是 `{ id, match(text, translate) => string|null }`，首个命中即返回。

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
- 仲裁/Vue 合并文本节点（如 `Waves completed`、`, Defense`、`Wave 3 complete`）与 run-chart Canvas 提示（如
  `Total interval: 2:30`、`Drone spawn rate: 6 spawns/min`）也走本规则表；Canvas 字符串由
  `dom.canvas-text` 在绘制时交给 `translate()`，规则在这里定义，不要在 canvas 模块里另写匹配逻辑；
- 复杂 DOM/上下文规则 → 放到 `features` 或 `dom`，不要塞进规则表。

## 测试

```powershell
node tests\rules.test.mjs
node tests\runtime.test.mjs
```

覆盖：规则表数量、复合文本、裂罅百分比/倍率、源力石、段位、日期、仲裁合并文本节点（波次/计数/头部后缀/速率单位）、run-chart Canvas 提示格式、未知文本保持英文（非半翻）。

## 失败模式

- 宽泛规则排在具体规则前 → 具体规则不可达（`+1 more effects` 曾出现此问题，已调整顺序）；
- 正则过宽 → 误伤普通文本；必须加正反例；
- 翻译回调返回 null 又拼接 → 输出中英混合；按现有规则返回 null 或使用原文的约定处理。

## 关联

- [ADR 0001](../../decisions/0001-capability-first-architecture.md)
- [AGENTS.md](../../../AGENTS.md)
- [src/runtime/rules/index.js](../../../src/runtime/rules/index.js)
