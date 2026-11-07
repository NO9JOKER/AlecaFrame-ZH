# 贡献者 AI 入口

> 你是外部贡献者的 AI：先读 [AGENTS.md](../../AGENTS.md)，再回到本页。
> 你是维护者的复核 AI：直接读 [docs/review/AI_REVIEW.md](../review/AI_REVIEW.md)，不要按贡献者流程改代码。

## 1. 三条规则

1. **只读任务相关文件。** 不要通读仓库，不要读 `bin/` 生成物、全部词条、与任务无关的旧文档。
2. **不直接推 main。** 从 `main` 切分支，向 `main` 开 PR；是否合并由维护者决定。
3. **真机由开发者负责。** AI 可以帮你跑命令，但不能替你声明“在真实 Overwolf/游戏里验证过”；REAL 证据必须由开发者本人执行并签字。

## 2. 阅读顺序

| 顺序 | 文件 | 目的 |
|---|---|---|
| 1 | [AGENTS.md](../../AGENTS.md) | 项目约束、命令、禁改区、不变量 |
| 2 | 本文件 | 贡献流程与角色 |
| 3 | [task-router.md](task-router.md) | 按任务找到必读文件、可改文件、验证命令 |
| 4 | [workflow.md](workflow.md) | fork、分支、自测、PR 的完整步骤 |
| 5 | [evidence.md](evidence.md) | 真机证据格式 |
| 6 | 任务相关模块 | 见 task-router 的“必读”列 |

## 3. 任务类型与去向

| 你想做 | 去哪里 |
|---|---|
| 加/改一个词条 | task-router「词典新增 / override」→ `dict/AGENTS.md` + `docs/词典来源.md` + 目标词条文件 |
| 加/改一条翻译规则 | task-router「规则」→ `src/runtime/AGENTS.md` + `docs/维护手册.md` 相关章节 |
| 改中文搜索/hook | task-router「搜索/hook」→ `src/runtime/AGENTS.md` + `docs/中文搜索原理.md` |
| 改启动器/注入 | task-router「launcher/注入」→ `src/launcher/AGENTS.md` + `docs/维护手册.md` |
| 改 OCR 边界/路径 | task-router「OCR」→ `src/ocr/AGENTS.md` + `docs/OCR集成说明.md` |
| 改文档/CI | task-router「文档/CI」→ 根 `AGENTS.md` + `.github/` |
| 不确定 | 停下来，在 PR/Issue 里说明，不要猜目录 |

## 4. 当前阶段说明

当前是 `refactor/architecture` 的 A 阶段（文档/模板）。B/C/E 阶段会创建模块 README、`dict/manifest.tsv`、`src/ocr/manifest.json`、`tools/dict.py` 等；在这些文件出现之前，使用 task-router 里标注的「当前等价」路径。文档与代码不一致时，停下来问，不要按旧文档硬改。

## 5. 最小提交要求

- 一个 PR 只做一个主题；Tier 按 `AGENTS.md` §8 标注。
- 改代码必须同 PR 更新对应模块 README/索引；改词典必须按词典指南与 `dict/manifest.tsv` 规则。
- 不提交生成物 `/bin`、`dist/`、`state/`、`logs/`、报告文件。
- 不修改 `.github/`、`scripts/verify.ps1`、评审规则，除非任务本身就是 T2 且维护者同意。
- PR 模板：[.github/PULL_REQUEST_TEMPLATE.md](../../.github/PULL_REQUEST_TEMPLATE.md)。
