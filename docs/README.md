# 文档索引

> 所有会变的版本/数量以命令输出或生成报告为准；不要从散文抄数字。
> 目标接口与命令现状以 [AGENTS.md](../AGENTS.md) 和仓库实际文件为准。

## 给 AI 的入口

| 角色 | 先读 |
|---|---|
| 所有 AI | [AGENTS.md](../AGENTS.md) |
| 所有 AI（全景） | [docs/ARCHITECTURE.md](ARCHITECTURE.md) |
| 贡献者 AI | [docs/contributing/README.md](contributing/README.md) → [task-router.md](contributing/task-router.md) |
| 维护者复核 AI | [docs/review/AI_REVIEW.md](review/AI_REVIEW.md) |

## 给人类的入口

| 需求 | 文档 |
|---|---|
| 使用/构建 | [README.md](../README.md) |
| 贡献 | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| 写/改词典 | [docs/guides/dictionary.md](guides/dictionary.md) |
| 真机验证 | [docs/verification/REAL_MACHINE.md](verification/REAL_MACHINE.md) |
| 分支/发布 | [docs/分支与发布流程.md](分支与发布流程.md) |
| 维护/排障 | [docs/guides/dictionary.md](guides/dictionary.md)、[验证指南](verification/REAL_MACHINE.md) |

## 架构与决策

| 文档 | 内容 |
|---|---|
| [架构总览](ARCHITECTURE.md) | 运行链路、模块边界、页面/词典/OCR/启动器地图 |
| [ADR 0001](decisions/0001-capability-first-architecture.md) | 能力优先、页面矩阵、数据/代码分离、单 bundle、OCR 边界 |
| [ADR 0002](decisions/0002-contribution-and-review-model.md) | fork PR、维护者手动合并、开发者真机责任、风险分级 |
| [项目计划](project/v1.2.0-plan.md) | 里程碑、验收、真机清单、发布清单 |
| [词典验收设计](project/dictionary-acceptance.md) | golden 基准、构建确定性、数据/引擎等价校验 |
| [模块文档](modules/README.md) | core/rules/dom/features/adapters 模块文档 |
| [页面卡模板](pages/README.md) | 页面卡固定标题与页面矩阵说明 |
| [契约 schema](../schemas/README.md) | pages/modules/OCR/dict manifest 的结构与校验 |

## 维护规则

- 可推导事实（条数、页面清单、钩子表）由脚本生成，不手写进散文；
- 新增/移动文档必须同 PR 更新本索引与 `AGENTS.md` 的链接；
- 文档与代码冲突时，以代码/契约和 ADR 为准，并同 PR 修正文档。
