# 文档索引

> 项目按新架构实现；部分目标文档会随模块落地创建，以路径是否存在为准。
> **目标接口说明**：`tools/*`、`dict/manifest.tsv`、`src/runtime/*`、`src/launcher/*`、`src/ocr/*` 等是新架构目标路径，可能尚未实现；本文档中的命令/路径不表示已存在。实际文件以仓库现状为准。
> 所有可变的版本/数量以命令输出或生成报告为准，见 [AGENTS.md](../AGENTS.md) §13。

## 给 AI 的入口

| 角色 | 先读 |
|---|---|
| 所有 AI | [AGENTS.md](../AGENTS.md) |
| 所有 AI（全景） | [docs/ARCHITECTURE.md](ARCHITECTURE.md) |
| 贡献者 AI | [docs/contributing/README.md](contributing/README.md) → [task-router.md](contributing/task-router.md) |
| 维护者复核 AI | [docs/review/AI_REVIEW.md](review/AI_REVIEW.md) |

## 给人类的入口

> 参考类文档（维护手册、OCR 集成、中文搜索原理、待改进清单）记录现有实现细节，可能包含写作时的版本/路径；实现时以代码、AGENTS 与 ADR 为准。

| 需求 | 文档 |
|---|---|
| 使用/安装 | [README.md](../README.md) |
| 贡献 | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| 写/改词典词条 | [docs/guides/dictionary.md](guides/dictionary.md) |
| 维护/排障 | [docs/维护手册.md](维护手册.md) |
| 真机验证 | [docs/verification/REAL_MACHINE.md](verification/REAL_MACHINE.md) |
| 分支/发布 | [docs/分支与发布流程.md](分支与发布流程.md) |
| OCR 集成参考 | [docs/OCR集成说明.md](OCR集成说明.md) |
| 中文搜索原理参考 | [docs/中文搜索原理.md](中文搜索原理.md) |
| 已知问题 | [docs/待改进清单.md](待改进清单.md) |

## 架构与决策

| 文档 | 内容 |
|---|---|
| [架构总览](ARCHITECTURE.md) | 运行链路、模块边界、页面/词典/OCR/启动器地图 |
| [ADR 0001](decisions/0001-capability-first-architecture.md) | 能力优先、页面矩阵、数据/代码分离、单 bundle、OCR 边界 |
| [ADR 0002](decisions/0002-contribution-and-review-model.md) | fork PR、维护者手动合并、开发者真机责任、风险分级 |
| [项目计划](project/v1.2.0-plan.md) | 工作流、里程碑、验收与发布清单 |
| [词典验收设计](project/dictionary-acceptance.md) | golden 基准、构建确定性、数据/引擎等价校验 |
| [模块文档模板](modules/README.md) | 模块 README 固定标题与计划清单 |
| [页面卡模板](pages/README.md) | 页面卡固定标题与生成矩阵说明 |
| [契约 schema](../schemas/README.md) | pages/modules/ocr/dict manifest 的结构与校验 |

## 目标文档（随实现创建）

- `docs/MODULE_MAP.md`：生成式模块索引。
- `docs/PAGE_MATRIX.md`：生成式页面矩阵（注入/适配器/OCR/覆盖/回归）。
- `docs/DICT_REPORT.md`：生成式词典报告（层/条数/冲突/覆盖）。
- `docs/guides/{rules,hooks,launcher,testing,release}.md`。
- `docs/modules/<module>/README.md`、`docs/pages/<page>.md`（按模板创建）。

## 维护规则

- 可推导的事实（条数、行数、页面清单、钩子表）由脚本生成，不手写进散文。
- 会变的版本/数量以命令输出或生成报告为准；见 [AGENTS.md](../AGENTS.md) §13。
- 新增/移动文档必须同 PR 更新本索引与 `AGENTS.md` 的链接。
- 文档与代码冲突时，以代码/契约和 ADR 为准，并同 PR 修正文档；不要按过期文档推断实现。
