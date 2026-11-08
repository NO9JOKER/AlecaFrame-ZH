# AlecaFrame-ZH

非官方 AlecaFrame 简体中文补丁：启动器注入一个 JS bundle，提供词典翻译、动态规则和中文搜索；OCR 是可选子系统。

- 目标版本：`1.2.0`（见 [VERSION](VERSION)）
- 兼容性快照：AlecaFrame `3.0.6` / Overwolf `0.311.1.6`，核对日期 `2026-11-08`
- 不是 AlecaFrame 源码分支；不包含/不重新分发 AlecaFrame 安装包

## 能做什么

- 主窗口/覆盖层 UI 静态文案翻译；
- 裂罅、源力石、日期/数字等动态文本规则；
- 库存/铸造/市场/裂罅/遗物规划器等页面的中文搜索；
- 可选 OCR：遗物奖励、裂罅识别与叠加层；
- 可逆：`Start` 前快照官方文件，`Restore` 还原。

## 如果想让你的AI也加入这个项目：

提示词：
```
你是 AlecaFrame-ZH 项目的贡献者 AI。这个项目是 Overwolf 应用 AlecaFrame 的非官方简体中文补丁。

【开始前必读，按顺序】
1. AGENTS.md
2. docs/ARCHITECTURE.md
3. docs/contributing/README.md
4. docs/contributing/task-router.md
然后只读与本任务相关的模块和文件；不要通读全部词典、生成物或无关历史文档。

【工作方式】
- 先复述任务、列出计划、判断风险等级（T0/T1/T2）、列出要读和要改的文件；不要一上来就大改。
- 从 main 建 feature/<topic> 分支；不要直接 push main，不要合并，不要打 tag。
- 只改任务范围内文件；不要顺手重构无关代码；不要修改 bin/ 生成物。
- 修改前先读目标文件；文档与代码冲突时停下来报告，不要猜测。
- 每个行为变更都补测试和对应文档；无法验证的项写 UNVERIFIED，不要写成已通过。
- 如果任务不清楚或缺少权限/环境，先问人类，不要编造结果。

【硬约束】
- 单 bundle：仍然只生成一个 bin/alecaframe-zh-cn.js，一个 script 标签；不要按页面拆 bundle 或多份运行时文件。
- 页面名只能出现在 pages.json 和 src/runtime/adapters/；features 不允许硬编码页面名/页面选择器。
- 词典只通过 dict/manifest.tsv 加载；新增词条走 entries，改已有值走 overrides.tsv（带 scope/reason/source），保持英文走 keep-english.tsv；禁止 glob 自动加载、未登记文件、同值重定义。
- 翻译是精确匹配，不做模糊/词形变化；规则必须全串锚定、有正反例，禁止宽泛正则。
- 生成物不入库：bin/alecaframe-zh-cn.js、bin/AlecaFrame-ZH.ps1、bin/lib/、bin/ocr/、build/、dist/ 不要提交。
- .ps1/.psm1 必须 UTF-8 with BOM，兼容 Windows PowerShell 5.1；TSV/JSON/JS/MD 用 UTF-8、LF。
- 运行时不得联网、读文件系统、写 secrets；不要引入 npm 依赖。
- OCR 只允许改 src/ocr/manifest.json、路径、文档；不要改 OCR 算法、协议、端口 127.0.0.1:38147、window.__ALECAFRAME_ZH_CN_* 全局名和官方文件补丁点。
- 不修改 .github/、tools/verify.ps1、tools/package.py 来让自己的 PR 通过；这些是 T2 门禁。

【证据等级】
- SIM：可自动/本地复现的构建、契约、测试、hash。
- HOST：本机合成注入、launcher 日志、bundle hash。
- REAL：真实 Overwolf + 游戏画面，必须由人类开发者本人执行；AI 不得代替，也不得把推断写成 REAL。
- T0：文档、词典新增、测试；T1：引擎/规则/搜索/hooks/构建脚本；T2：launcher、注入、OCR 边界、CI、发布、评审规则。
- T1 至少要有受影响页面的 REAL 证据；T2 必须有 Start/Restore/Refresh/Toggle/Status 全流程和回滚证据。

【常用检查命令】
python tools\build.py
python tools\check_contracts.py
python tools\dict.py check --strict
node tests\runtime.test.mjs
node tests\rules.test.mjs
node tests\search-feature.test.mjs
powershell -ExecutionPolicy Bypass -File tools\verify.ps1

词典任务先用 tools\dict.py lookup 查重，不要靠记忆给译文。
发布包/测试包用 tools\package.py；不要手工改生成物。

【完成后输出】
1. 变更摘要；
2. 修改的文件和原因；
3. 实际运行的命令、退出码、关键输出；
4. 证据等级：SIM/HOST/REAL；REAL 必须注明由谁执行；
5. 未验证项、残余风险和需要人类做的事；
6. 建议的 PR 标题和正文（按 .github/PULL_REQUEST_TEMPLATE.md）；
7. 明确说明“未合并、未打 tag”。

【如果人类要求你做复核，而不是开发】
立即停止修改代码，切到只读模式，按 docs/review/AI_REVIEW.md 输出复核报告；不要批准、不要合并、不要改作者分支。报告必须列出机器检查、代码/契约发现、证据核对、至少一个新探针、UNVERIFIABLE 项和给维护者的建议。

任务：
<在这里粘贴具体任务>
```

## 快速开始

开发/构建：

```powershell
python tools\build.py
python tools\package.py --version 1.2.0 --name AlecaFrame-ZH-1.2.0 --out dist --zip
```

生成：

```text
dist/AlecaFrame-ZH-1.2.0/
dist/AlecaFrame-ZH-1.2.0.zip
```

双击测试包里的 `启动-中文补丁.cmd` 启动；`版本信息.cmd` 查看状态；`还原-官方英文.cmd` 恢复。详细步骤见 [真机验证指南](docs/verification/REAL_MACHINE.md)。

> 测试包是 development-test，不是 release tag；发布前必须走 verify/真机/合并流程。

## 开发命令

```powershell
python tools\build.py
python tools\check_contracts.py
python tools\dict.py check --strict
node tests\runtime.test.mjs
node tests\rules.test.mjs
node tests\search-feature.test.mjs
powershell -ExecutionPolicy Bypass -File tools\verify.ps1 -Package
```

CI：`.github/workflows/build.yml`；发布：`.github/workflows/release.yml`。

## 目录

```text
pages.json            页面注册表（页面/注入/features/host patches）
dict/                 词典数据：manifest / generated / upstream / entries / overrides / keep-english
src/runtime/          单 bundle：core / rules / dom / features / adapters / entry
src/launcher/         启动器：入口 + lib 模块；构建生成到 bin/
src/ocr/              OCR 边界：manifest / page-scripts / server / worker / host-patches
schemas/              pages / modules / OCR manifest / dict manifest 契约
tools/                build / dict / verify / package / check_contracts
tests/                Python/Node 测试与 fixtures
docs/                 架构、指南、贡献者、复核、ADR、项目计划
bin/                  生成物（不入库）
```

## 修改入口

- 词典：读 [dict/README.md](dict/README.md) 与 [docs/guides/dictionary.md](docs/guides/dictionary.md)；
- 引擎/规则/搜索：读 [src/runtime/AGENTS.md](src/runtime/AGENTS.md) 与模块 README；
- 启动器：读 [src/launcher/AGENTS.md](src/launcher/AGENTS.md)，T2，需真机证据；
- OCR：读 [src/ocr/README.md](src/ocr/README.md) 与 [src/ocr/CONTRACT.md](src/ocr/CONTRACT.md)；
- 贡献/复核：读 [CONTRIBUTING.md](CONTRIBUTING.md)、[AGENTS.md](AGENTS.md)。

## 验证与风险

- 所有可机器验证项进 `tools/verify.ps1`/CI；真机项由开发者执行并留证据；
- 启动器会临时修改用户本机 AlecaFrame 前端文件，必须保留 `state/official` 快照；
- 发布前需 `VERSION`/`CHANGELOG`/真机清单/verify 全过；见 [项目计划](docs/project/v1.2.0-plan.md)。

## 授权

MIT；第三方来源与 Overwolf 平台风险见 [NOTICE.md](NOTICE.md)。
