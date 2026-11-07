# 架构决策记录（ADR）

| 编号 | 标题 | 状态 |
|---|---|---|
| [0001](0001-capability-first-architecture.md) | 能力优先的运行时架构与页面矩阵 | Proposed |
| [0002](0002-contribution-and-review-model.md) | 贡献与复核模型（fork PR + 维护者手动合并 + 开发者真机责任） | Proposed |

## 约定

- ADR 记录**为什么**这样决策，以及放弃的替代方案；不重复实现细节。
- 已接受的 ADR 不重写历史；要改变决策，新增一份 ADR，并在被替代的 ADR 标记 `Superseded by NNNN`。
- ADR 合并到 main 后状态改为 `Accepted`；被替代时改为 `Superseded`。
- 新 ADR 文件命名：`NNNN-kebab-case-title.md`，从 0001 递增。
- 任何改变以下内容的决策都需要新 ADR：注入契约、单 bundle、页面注册表、词典优先级模型、评审/发布门禁、OCR 边界。

## 模板

```markdown
# ADR NNNN：标题

- 状态：Proposed / Accepted / Superseded by NNNN
- 日期：YYYY-MM-DD
- 决策者：
- 相关文档：

## 背景

## 决策

## 不变量

## 考虑过的替代方案

## 后果

## 参考
```
