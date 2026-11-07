# AGENTS.md — AlecaFrame-ZH 的 AI 操作契约

> 状态：架构规范（实现中）。部分目标目录/命令尚未落地；以实际代码和本文件为准。发现文档与代码不一致时先停下，在 PR/报告中说明，不要按猜测继续。
> 人类贡献者入口：[CONTRIBUTING.md](CONTRIBUTING.md)。贡献者 AI 路线：[docs/contributing/README.md](docs/contributing/README.md)。维护者复核 AI：[docs/review/AI_REVIEW.md](docs/review/AI_REVIEW.md)。

## 0. 你是什么角色

- **贡献者 AI**：读 §1–§9，再按 [docs/contributing/task-router.md](docs/contributing/task-router.md) 只读与你任务相关的文件。不要通读整个仓库。
- **维护者复核 AI**：读 §1–§9 和 [docs/review/AI_REVIEW.md](docs/review/AI_REVIEW.md)。只读、不改代码、不合并、不写作者分支。
- **其他自动化**：把本文件当作仓库约定；与用户当前指令冲突时，以用户指令为准，并在 PR/报告中说明。

## 1. 项目是什么

- 这是 Overwolf 应用 AlecaFrame 的**非官方简体中文补丁**，不是 AlecaFrame 源码分支。
- 运行方式：启动器带 Overwolf 校验绕过参数启动，向 AlecaFrame 中需要汉化的页面注入一个 JS bundle（词典 + 翻译引擎 + 中文搜索）；具体页面清单以 launcher / `pages.json` / 生成矩阵为准，不要依赖文档里的数字。
- 兼容性核对版本（2026-11-08）：AlecaFrame `3.0.6` / Overwolf `0.311.1.6`；项目目标版本 `1.2.0`。
- **这些是带日期的兼容性快照，不是永久事实**：升级 AlecaFrame/Overwolf、发布新版本或改页面清单时，必须同 PR 更新本节与 `docs/project/v1.2.0-plan.md`；AI 发现它们与 `VERSION`、本机安装目录或命令输出不一致时，以实际为准并指出文档过期。
- 不要修改官方安装包的签名/DLL；唯一允许的官方文件原地补丁是 OCR 相关文件，且必须可还原。
- 规模会变：词典是数据主体，bundle 大部分是词典数据；运行时主链路是少量代码；OCR 是独立可选子系统。具体数字以构建/报告输出为准，不要写死。

## 2. 先读什么

所有 AI 的最短路径：

1. 本文件；
2. [docs/contributing/README.md](docs/contributing/README.md)（角色与阅读规则）；
3. [docs/contributing/task-router.md](docs/contributing/task-router.md)（按任务定位文件）。

然后只读任务相关模块：

- 词典任务：`dict/AGENTS.md`、目标词条文件头部；
- 引擎/规则/搜索：`src/runtime/AGENTS.md`、对应模块 README、目标文件头；
- 启动器/注入：`src/launcher/AGENTS.md`、`pages.json`；
- OCR：`src/ocr/AGENTS.md`、`src/ocr/CONTRACT.md`。

不要读：`bin/` 生成物、全部词条、与本任务无关的参考文档、`dist/`、`state/`、`logs/`。

## 3. 稳定命令

新架构的稳定命令（对应工具实现后）：

```powershell
python tools\build.py                            # 合并词典，生成注入 bundle 与 OCR 词库
powershell -ExecutionPolicy Bypass -File tools\verify.ps1
node tests\search.test.mjs
```

真机操作仅 Windows：

```powershell
Start-Chinese.cmd       # 冷启动：停 Overwolf -> 还原官方文件 -> 带 flag 启动 -> 注入
Refresh-Chinese.cmd     # 中文会话内重注入 + 重载渲染进程（改词典/代码后用）
Restore-English.cmd     # 还原官方文件并正常启动
Status.cmd              # 查看会话 flag / 注入状态 / OCR 状态
```

工具尚未落地时，不要凭本文件猜命令；以仓库实际可执行文件为准，并在 PR 中记录实际运行的命令。

## 4. 目录与依赖

目标结构：

```text
dict/                 词典数据（manifest / generated / 人工词条 / overrides / keep-english）
src/runtime/          单 bundle 运行时：core / rules / dom / features / adapters / entry
src/launcher/         PowerShell 启动器模块：Snapshot / Patch / Overwolf / Ocr / Cli
src/ocr/              OCR 子系统边界：manifest / page-scripts / server / worker
tools/                构建、校验、词典工具、索引生成
tests/                单元测试 / fixtures / golden / 手工真机清单
docs/                 架构、指南、贡献者入口、复核模板、ADR、项目计划
bin/                  只放生成物；源码不要放这里
```

依赖方向（禁止反向依赖）：

- `core`：纯函数/索引/决策链，不依赖任何上层。
- `rules`、`dom`、`features`：只能依赖 `core`；features 内部可按需依赖 rules/dom。
- `adapters`、`entry`：可以依赖 core/rules/dom/features；不得被它们反向依赖。
- `dict` 数据只通过 build 进入 bundle；运行时不得直接读词典文件。
- `launcher`/`tools`/`tests` 可以读所有层，但不能被运行时依赖。

边界规则：

- **页面名只能出现在 `pages.json` 和 `adapters/`**；features 不许知道页面名。
- 单 bundle 注入契约不变：一个 `assets/js/alecaframe-zh-cn.js`，一个 `<script>` 标签。
- OCR 只能通过 `src/ocr/manifest.json` 描述；OCR 逻辑保持稳定，边界先行。

## 5. 硬性不变量（改坏会静默出错）

1. 启动器/注入可逆：所有改动前先快照，`Restore` 必须能恢复官方文件。
2. `.ps1`/`.psm1` 必须 UTF-8 with BOM；兼容 Windows PowerShell 5.1。
3. 生成物不入库：`bin/alecaframe-zh-cn.js`、`bin/ocr/afzh-items.js`、报告文件等。
4. 翻译是**精确匹配**；不做模糊/词形变化。规则必须全串锚定，禁止宽泛正则（如 `^(\d+) (.+)$`），且要有防循环守卫。
5. 运行时不得联网（OCR 仅 `127.0.0.1:38147`）、不得访问文件系统、不得写 secrets。
6. 以下全局名是与宿主/OCR 的硬契约，不要改名：`__AFCN__`、`__AFCN_DICT__`、`__AFCN_RELIC_REWARDS__`、`__AFCN_TRANSLATE__`、`__AFZH_SEARCH__`、`__AFZH_SEARCH_API__`、`__AFZH_SEARCH_TEST__`、`__ALECAFRAME_ZH_CN_ITEMS__`，以及 `src/ocr/CONTRACT.md` 列出的 OCR 全局名。
7. `status.last-session.json`、settings 等状态文件要加 `schemaVersion`；读取时能处理无版本/缺省值，否则给出明确错误。
8. 页面/宿主版本升级后，hook 方法与选择器可能失效；失败必须可诊断，不能静默吞掉。

## 6. 可改 / 禁改

| 区域 | 规则 |
|---|---|
| `dict/` 人工词条 | 可改；`generated/` 只由脚本生成，禁手改 |
| `src/runtime/` | 可改；必须同 PR 更新模块 README/测试 |
| `src/launcher/` | 可改；T2，必须有真机 Start/Restore 证据 |
| `src/ocr/` | 只允许改 manifest/路径/文档；OCR 逻辑变更需独立项目/ADR |
| `tools/`、`tests/` | 可改；改门禁本身按 T2 处理 |
| `bin/` | 禁改（生成物） |
| `.github/`、`tools/verify.ps1`、`tools/package.py` | T2；不得弱化检查 |
| OCR 协议、端口、官方文件补丁点 | 禁改（除非独立 OCR 项目） |

## 7. 证据与 PR

- 贡献者负责**真机验证**；维护者的 AI 不能替代真机，也不能替开发者签字。
- 证据等级：`SIM`（可自动/本地命令复现）、`HOST`（本机合成注入/日志）、`REAL`（真实 Overwolf + 游戏画面，由开发者本人执行）。
- PR 必须使用 [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md)，并附 `docs/contributing/evidence.md` 要求的证据。
- 维护者的复核 AI 只输出报告，不批准、不合并；最终由维护者手动合并。
- 审核发生在合并前；作者先合并再补审核的 PR 不接受。

## 8. 风险分级

| Tier | 范围 | 合并要求 |
|---|---|---|
| T0 | 文档、词典新增（不改值）、测试 | CI/本地检查通过 + 复核报告；维护者可快速合并 |
| T1 | 引擎、规则、搜索、hooks、构建脚本 | T0 要求 + 规则/行为 golden + 受影响界面 REAL 证据 |
| T2 | 启动器、注入、OCR 边界、CI、发布、评审规则本身 | T1 要求 + 完整真机清单 + 维护者抽检 |

## 9. OCR 与词典边界

- OCR：`src/ocr/` 是独立子系统边界；launcher 只按 `src/ocr/manifest.json` 复制/注入/启停；协议、端口、全局名、官方补丁点稳定，逻辑变更另立项目。
- 词典：按「变更域」分文件，不按页面分；优先级由 `dict/manifest.tsv` 决定；同一英文键只有一个权威译文，改值只能写 `overrides.tsv` 并附 scope/reason/source。

## 10. 分支与版本

- `main` 是发布分支；功能分支通过 PR 合入 main。
- 维护者手动合并；贡献者不直接推 main，也不自行合并。
- 发版：维护者提交 `VERSION`/`CHANGELOG` 后打 tag；tag 必须在 main 上。
- 一个 PR 只做一个主题；不要混合词典数据、语义修正和运行时逻辑。

## 11. 不要做

- 不要按 AlecaFrame 页面创建代码/词典主目录；页面只做 `pages.json` + 生成矩阵 + 适配器例外层。
- 不要拆成按页面加载的多个 bundle；不要把词典拆成独立运行时文件。
- 不要把词典改成 JSON/Excel；不要用 Excel 编辑 TSV。
- 不要为每个文件写一篇长文档；用模块 README + 文件头契约 + 一份词典指南。
- 不要提交生成物、不要把本机绝对路径/用户名/token 写进代码或证据。
- 不要用 `git add -f` 提交被忽略的产物；不要 force push main。
- 不要说“已验证”却没有证据；不要在无法验证时假装通过。

## 12. 相关文件

- [docs/contributing/README.md](docs/contributing/README.md)
- [docs/contributing/task-router.md](docs/contributing/task-router.md)
- [docs/contributing/evidence.md](docs/contributing/evidence.md)
- [docs/review/AI_REVIEW.md](docs/review/AI_REVIEW.md)
- [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md)
- [docs/decisions/0001-capability-first-architecture.md](docs/decisions/0001-capability-first-architecture.md)
- [docs/decisions/0002-contribution-and-review-model.md](docs/decisions/0002-contribution-and-review-model.md)
- [docs/project/v1.2.0-plan.md](docs/project/v1.2.0-plan.md)

## 13. 事实来源与文档维护

以下事实会变。本文件只写“截至 2026-11-08”的核对值，不承担永久正确性；需要当前值时查唯一来源：

| 事实 | 唯一来源 | 写死规则 |
|---|---|---|
| 当前发布版本 | 根 `VERSION` + `CHANGELOG.md` | 发版提交必须同步 §1 与项目计划 |
| 宿主版本 | 本机安装目录/诊断包 | 升级后更新 §1 兼容性版本；过期值不能当现状 |
| 页面清单/注入数量 | `pages.json` + `PAGE_MATRIX.md` 生成 | 不在代码/文档里另写一份 |
| 词典条数/冲突/覆盖 | `tools/dict.py report` / 构建输出 / `DICT_REPORT.md` | 不把数字写进正文 |
| 测试数量 | 测试命令输出 | 只写“现有测试全过”，不写死条数 |
| OCR 页面脚本与映射 | `src/ocr/manifest.json` + 生成页面矩阵 | 不从文档抄数量 |
| bundle 内容与路径 | `tools/build.py` + `modules.json` + 生成产物 | 以产物/构建报告为准 |

规则：

1. 文中出现“当前/最新/兼容性”时，必须带日期或指向来源；否则视为可能过期。
2. 修改上述事实（版本、页面、词典结构、测试、OCR 映射）必须同 PR 更新引用它的文档；CI/复核检查链接与生成索引，不靠记忆。
3. AI 发现文档与 `VERSION`、安装目录、命令输出不一致：以实际为准，不按过期文档推断；在 PR/报告中指出过期文档。
4. 可推导的数字优先由脚本生成（`MODULE_MAP`/`PAGE_MATRIX`/`DICT_REPORT`），散文只写判断与坑。
