# ADR 0002：贡献与复核模型（fork PR + 维护者手动合并 + 开发者真机责任）

- 状态：Proposed（随首次架构实现合入 main 后生效）
- 日期：2026-11-08
- 决策者：项目维护者
- 相关：`docs/decisions/0001-capability-first-architecture.md`、`.github/PULL_REQUEST_TEMPLATE.md`、`docs/review/AI_REVIEW.md`

## 背景

- 项目由单人维护；未来贡献者会**使用自己的 AI** 开发、验证后提交。
- 维护者使用自己的 AI 分析变更，然后**手动合并**。
- 真机回归由开发者负责：维护者无法复现每个贡献者的 Windows/Overwolf/游戏环境。
- 仓库为私有仓库、单 GitHub 账号；GitHub 原生“另一个账号批准”既无法证明独立性，也不应成为流程核心。
- 项目起步阶段没有外部用户，可以自由定义新结构；但行为验证不能省。

## 决策

### 1. 角色与门禁

| 角色 | 职责 | 不做什么 |
|---|---|---|
| 贡献者（及其 AI） | 实现、自测、**真机验证**、提交 PR 与证据 | 不直接推 main；不提交生成物；不代替维护者合并 |
| 维护者的复核 AI | 只读复核：复跑检查、审 diff、查证据一致性、找问题、出报告 | 不改代码、不合并、不签字、不替开发者声明“已验证” |
| 维护者 | 最终决策、手动合并、打 tag、发布；T2 抽检 | 不把真机责任转给 AI |

审核发生在合并前。作者先合并再补审核的 PR 不接受。

### 2. 贡献流程：fork PR

1. 贡献者 fork 仓库，从 `main` 切分支（`feature/<scope>` 或 `fix/<scope>`）。
2. 本地实现 + 运行项目检查 + 按 Tier 做真机验证。
3. 向 `main` 开 PR，填写 `.github/PULL_REQUEST_TEMPLATE.md` 与证据。
4. GitHub Actions/维护者本地跑检查；维护者的复核 AI 输出报告。
5. 维护者手动合并；合并后由贡献者清理自己的分支。

贡献者没有 main 写权限，因此不需要依赖 GitHub required review；维护者手动合并就是最终门禁。

### 3. 分支模型

- `main` 是发布分支；功能分支通过 PR 合入。
- 不设置长期集成分支；一个 PR 一个主题。
- 维护者发版时在主分支提交 `VERSION`/`CHANGELOG`，然后打 tag。

### 4. 真机责任与证据

- 开发者对 REAL（真实 Overwolf + 游戏画面）验证负责；证据必须包含环境版本、commit、bundle hash、操作步骤、截图/日志、未验证项。
- 维护者的 AI 只检查证据是否自洽、是否覆盖声明的变更；不能替代真机，也不能把“没有证据”判成通过。
- T2（launcher/注入/OCR/CI/发布）建议维护者在自己机器上至少再跑一次 Start/Restore；这是风险控制，不是对开发者的不信任。

### 5. 风险分级

| Tier | 范围 | 合并要求 |
|---|---|---|
| T0 | 文档、词典新增（不改值）、测试 | 本地/CI 检查 + 复核报告；维护者可快速合并 |
| T1 | 引擎、规则、搜索、hooks、构建脚本 | T0 + 规则/行为 golden + 受影响界面 REAL 证据 |
| T2 | 启动器、注入、OCR 边界、CI、发布、评审规则本身 | T1 + 完整真机清单 + 维护者抽检 |

### 6. 复核 AI 的约束

- 新会话、只读、以 PR head SHA 为准；不读作者 AI 的对话上下文。
- 必须实际运行检查，不信任作者描述；至少设计一个 PR 中没有的新探针。
- 输出结构化报告（结论 + 证据 + 未验证项 + 风险），结论只供维护者决策，不等于批准。
- 不得修改评审规则/CI 来让自己通过；这类改动本身是 T2。

### 7. 发版与 CI

- 发版：维护者直接在主分支提交 `VERSION` + `CHANGELOG`，然后打 tag；release workflow 校验 tag==VERSION 且 tag 在 main 上。
- 暂不增加 Windows CI：维护者的复核 AI 在本机 Windows 上运行 `tools/verify.ps1`，加上开发者真机证据，足以覆盖；未来贡献者变多再评估 path-filtered Windows job。
- Linux CI 负责构建、词典检查、JS/单元测试、文档/索引/范围检查。

## 考虑过的替代方案

| 方案 | 不采纳原因 |
|---|---|
| GitHub required review + 第二账号 | 单账号无法证明独立性；平台限制；维护者本来就要手动合并；增加复杂度 |
| 让 AI 自动合并 T1/T2 | 无人承担最终责任；真机不可自动化；出问题难追责 |
| 作者合并后再让 AI 审核 | 审核无法阻止破坏，只是事后审计 |
| 不要证据，只靠代码 review | 这个项目的风险在宿主/真机行为，纯代码 review 覆盖不了 |
| 每个 PR 都要求完整真机回归 | 对 T0 过重；按 Tier 分级即可 |

## 后果

正面：流程简单；责任清晰；维护者保留最终控制；不依赖平台付费能力；贡献者 AI 可用任意工具。

负面：维护者是瓶颈；证据质量依赖开发者自觉；复核 AI 可能走过场；T2 仍有残余风险。

缓解：PR 模板强制证据；复核 AI 检查清单 + 新探针；维护者抽检；T2 亲自跑一次 Start/Restore；以后可按需增加 Windows CI 或第二账号。

## 参考

- `.github/PULL_REQUEST_TEMPLATE.md`
- `docs/review/AI_REVIEW.md`
- `docs/contributing/evidence.md`
- `docs/contributing/workflow.md`
