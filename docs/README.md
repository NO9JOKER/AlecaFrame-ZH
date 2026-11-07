# 文档索引

> 当前状态：`refactor/architecture` 分支 A 阶段（2026-11-08）。
> 带「目标」标记的文档在 B/C/E 阶段落地；落地前使用「现有」列中的等价文档。

## 给 AI 的入口

| 角色 | 先读 |
|---|---|
| 所有 AI | [AGENTS.md](../AGENTS.md) |
| 贡献者 AI | [docs/contributing/README.md](contributing/README.md) → [task-router.md](contributing/task-router.md) |
| 维护者复核 AI | [docs/review/AI_REVIEW.md](review/AI_REVIEW.md) |

## 给人类的入口

| 需求 | 文档 |
|---|---|
| 使用/安装 | [README.md](../README.md) |
| 贡献 | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| 维护/排障 | [docs/维护手册.md](维护手册.md) |
| 分支/发布 | [docs/分支与发布流程.md](分支与发布流程.md) |
| 词典来源现状 | [docs/词典来源.md](词典来源.md) |
| 中文搜索原理 | [docs/中文搜索原理.md](中文搜索原理.md) |
| OCR 集成 | [docs/OCR集成说明.md](OCR集成说明.md) |
| 已知问题 | [docs/待改进清单.md](待改进清单.md) |

## 架构与决策

| 文档 | 状态 |
|---|---|
| [docs/decisions/0001-capability-first-architecture.md](decisions/0001-capability-first-architecture.md) | Proposed |
| [docs/decisions/0002-contribution-and-review-model.md](decisions/0002-contribution-and-review-model.md) | Proposed |
| [docs/refactor/v1.2.0-report.md](refactor/v1.2.0-report.md) | 进行中，随分支更新 |
| [docs/refactor/dict-migration-acceptance.md](refactor/dict-migration-acceptance.md) | 设计稿 |
| [docs/项目架构与实现说明.md](项目架构与实现说明.md) | 历史参考，逐步归档到 `docs/reference/` |

## 目标文档（B/C/E 阶段创建）

以下路径尚未创建，先不要作为链接使用：

- `docs/ARCHITECTURE.md`：一页全景（判断/边界/不变量），不写会变的数字。
- `docs/MODULE_MAP.md`：生成式模块索引。
- `docs/PAGE_MATRIX.md`：生成式页面矩阵（注入/适配器/OCR/覆盖/回归）。
- `docs/DICT_REPORT.md`：生成式词典报告（层/条数/冲突/覆盖）。
- `docs/guides/dictionary.md`：人类词条指南（唯一长文）。
- `docs/guides/{rules,hooks,launcher,testing,release}.md`。
- `docs/modules/<module>/README.md`、`docs/pages/<page>.md`。
- `docs/reference/`：归档的历史文档。

## 维护规则

- 可推导的事实（条数、行数、页面清单、钩子表）由脚本生成，不手写进散文。
- 新增/移动文档必须同 PR 更新本索引与 `AGENTS.md` 的链接。
- 旧文档与新架构冲突时，以新 ADR/模块文档为准，并同 PR 修正旧文档或归档。
