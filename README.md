# AlecaFrame 简体中文补丁（AlecaFrame-ZH）

给 Overwolf 应用 **AlecaFrame** 增加简体中文界面，并让物品名（武器 / MOD / 赋能 / 资源 / 遗物 / Prime 部件）按游戏官方简中显示。

- 非官方、开源的本地化补丁；通过“运行时注入”实现，**不修改官方安装包、签名或 DLL**
- 支持**随时开启 / 随时取消**（中文启动、恢复英文、会话内快速切换）
- 支持**多台电脑部署**（整个文件夹拷走即可，自动定位 Overwolf 与 AlecaFrame 版本）
- 可选 **中文搜索**（仓库/铸造厂/遗物规划器/WFM 列表/市场搜索框可直接输中文）
- 可选 **中文 OCR 增强**（遗物推荐、遗物奖励、裂罅识别在中文界面下也能工作）

![遗物规划器](docs/images/zh-relic-planner.png)

---

## ⚠️ 重要声明（务必先读）

1. 本项目为**非官方**汉化补丁，与 AlecaFrame 作者、Overwolf、Digital Extremes 均无关联。
2. 实现方式是：启动 Overwolf 时传入参数关闭扩展完整性校验（`--ow-disable-features=extension-validation,...` + `--ow-enable-features=force-validation-report-only`），再注入翻译脚本。
3. 补丁只修改 AlecaFrame 的前端页面，**不修改 Warframe 游戏文件**；DE 对第三方软件的政策是“自担风险（at your own risk）”。
4. 本仓库**不包含任何 AlecaFrame 源码**（其版权归作者所有），仅包含本项目自己的脚本、词典与文档。
5. 中文 OCR 是**可选组件**：首次安装会下载便携 Python / Node / PaddleOCR 与中文模型（约 360 MiB 下载，装完约 1.0 GB），不装也能正常使用界面汉化与中文搜索。

---

## ✨ 特性

| 功能         | 说明                                                    |
| ---------- | ----------------------------------------------------- |
| 界面汉化       | 主窗口、侧栏、设置、遗物规划、裂罅、统计、MOD 规划、仲裁、市场、小队等页面               |
| 物品名汉化      | 武器、MOD、赋能、资源、遗物、Prime 部件；**战甲名保留英文**                  |
| 动态文本       | 数字/日期/数量前缀等模板规则翻译（如 `223 recorded days` → `223 天已记录`） |
| 中文搜索       | 仓库 / 铸造厂 / 遗物规划器 / WFM 列表 / 市场搜索：输入中文自动转成英文查询再本地过滤    |
| 中文 OCR（可选） | 中文界面下遗物推荐、遗物奖励、裂罅界面仍能识别（官方 OCR 只认英文）                  |
| 一键开关       | 中文/ 英文/ 会话内切换                                         |
| 可维护        | 词典为纯文本 TSV；构建脚本可再生成运行时 JS；有 CI 与词条校验                  |

对比截图：

| 中文                                | English                                |
| --------------------------------- | -------------------------------------- |
| ![中文](docs/images/zh-foundry.png) | ![English](docs/images/en-foundry.png) |

---

## 🚀 快速开始（普通用户）

> 需要先安装 [Overwolf](https://www.overwolf.com/) 和官方 **AlecaFrame**，并打开一次（让 `PackagesCache` 与 `Extensions` 目录生成）。

1. 从本仓库的 **Releases** 下载最新 `AlecaFrame-ZH-v*.zip`；
2. 解压到任意本地目录（例如 `D:\AlecaFrame-ZH`）；
3. （可选）双击 `5-安装OCR前置组件.cmd` 装中文 OCR；
4. 以后直接双击 `1-启动-中文补丁.cmd`（中文模式启动，会重启 Overwolf）。

> 不需要快捷方式：文件夹里的命令直接双击就能用。想要桌面快捷方式的话，右键对应 `.cmd` →「发送到」→「桌面快捷方式」；之后右键快捷方式 →「重命名」（或按 F2）改成喜欢的名字即可（只改显示名，不影响脚本）。
>
> 首次设置好之后，后续游戏打开时自动拉起的 AlecaFrame 也会带汉化，不用每次手动启动。

> 如果启动后仍是英文：看 `logs\launcher.log`

### 中文 OCR（可选增强）

| 操作 | 命令 |
|---|---|
| 安装前置（一次性，需联网） | `5-安装OCR前置组件.cmd` |
| 开启（默认开） | `6-启用中文遗物OCR.cmd` |

- OCR 前置装在 `bin\ocr\.tools\`（便携 Python + Node + PaddleOCR 模型），**不修改系统全局环境**；
- 已安装的组件会先做版本自检再跳过：重跑 `5-安装OCR前置组件.cmd` 通常几秒完成，不会再执行 pip；
- 体积构成：中文 OCR 模型本身只有约 16 MB（PP-OCRv4 det 4.70 MB + rec 10 MB + cls 1.38 MB），其余约 1.0 GB 是 PaddleOCR 的 Python 运行期依赖（`paddle`、`cv2`、`scipy`、`numpy` 等）；
- 安装器把 pip 缓存固定在 `bin\ocr\.tools\pip-cache` 并在安装成功后删除；旧版安装器遗留在包根的 `pip\` 缓存（单机实测约 950 MiB）会在下次运行 `5-安装OCR前置组件.cmd` 时自动回收。运行 OCR 不需要这些缓存，确认不再安装后也可以手动删除；
- 首次识别时 Paddle 模型要加载，可能失败一次后正常（冷启动最长约 2 分钟）；
- 不装前置也能用界面汉化与中文搜索，启动器会自动跳过 OCR 并在日志里提示。

---

## 🧩 工作原理

```
Start-Chinese.cmd
  1) 关闭 Overwolf
  2) 从官方 app.opk 还原页面（含 OCR 改写的 relicOverlay/main.js）
  3) 带参数启动 Overwolf（关闭扩展完整性校验，仅本次会话）
  4) 注入 <script src="assets/js/alecaframe-zh-cn.js">，只重启 AlecaFrame 渲染进程
  5) 若启用 OCR：先起本地 OCR 服务（127.0.0.1:38147），再注入各页面的 OCR 桥/叠加层
```

- `alecaframe-zh-cn.js` 遍历 DOM 文本节点/属性做精确匹配替换，MutationObserver 持续处理 Vue 动态渲染；
- 中文搜索模块建立“中文 -> 英文”反向索引，输入中文时把英文查询字段清空、取回完整列表后本地过滤；
- 数字/日期等模板由 `src/engine.js` 内的规则处理；
- 词典优先级：`items.tsv` → `mioeu-terms.tsv` → 上游词库 → `fixes.tsv` → `extra-*.tsv`（后者覆盖前者）。

---

## 🐞 出问题时怎么报

双击 **`8-导出诊断包.cmd`**，会在桌面生成 `AlecaFrame-ZH-Diagnostics-<时间>.zip`，把这个 zip 发给维护者即可。它只**读取**不修改，包含：

| 内容 | 说明 |
|---|---|
| `env.txt` | 系统版本、Overwolf/AlecaFrame 版本、注入状态、charset 是否补上、OCR 组件与模型、快捷方式 |
| `status.txt` | `Status.cmd` 的输出（汉化状态 / 会话参数 / OCR 开关） |
| `injection.txt` | 10 个页面各自注入了哪些脚本、是否声明 UTF-8 |
| `logs/` | `launcher.log`、`ocr-install.log`、OCR 运行日志、上次会话状态 |
| `overwolf/` | Overwolf 自己的窗口日志尾部（含扩展加载/校验信息） |

> 日志里可能含 Warframe 用户名、Warframe.Market 用户名；token/密码/邮箱已做粗略打码，回传前可自行检查。

常见故障的排查顺序：`Status.cmd` → `logs\launcher.log` → `8-导出诊断包.cmd`。

---

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

【如果用户要求你做复核，而不是开发】
立即停止修改代码，切到只读模式，按 docs/review/AI_REVIEW.md 输出复核报告；不要批准、不要合并、不要改作者分支。报告必须列出机器检查、代码/契约发现、证据核对、至少一个新探针、UNVERIFIABLE 项和给维护者的建议。

任务：
<在这里粘贴具体任务>
```


---

## ❓ FAQ

**Q：会封号吗？**
只改 AlecaFrame 前端，不碰游戏文件；DE 政策为“第三方软件自担风险”。理论上风险低，但不是零风险。

**Q：为什么战甲名还是英文？**
按需求刻意保留（Ash、Wukong Prime 等），但战甲部件会显示为 `Wukong Prime 机体蓝图` 的混合形式。

**Q：为什么有的物品名仍是英文？**
游戏数据缺少该物品的简中名，或属于节点名/裂罅生成名/阵营名；剩余未覆盖清单见 `dict/gap-candidates.tsv`。

**Q：中文搜索搜不到怎么办？**
先确认 `bin\alecaframe-zh-cn.js` 是最新的（`python src\build.py`），并在 `Status.cmd` 里确认当前是中文会话；搜索只在中文会话注入的页面里生效。

**Q：OCR 开了但遗物/裂罅不显示中文？**
按顺序排查：`5-安装OCR前置组件.cmd` 是否成功 → `bin/ocr/afzh-items.js` 是否存在（跑 `python src\build.py`）→ `Status.cmd` 看缺失项 → `state\RelicChineseOcr\helper.err.log`。

**Q：更新后中文没了怎么办？**
运行 `Start-Chinese.cmd`。仍不行看 `logs\launcher.log`，或 `Restore` 后重试。


---

## 📌 免责声明

本项目仅供学习与个人使用。因使用本补丁导致的账号、平台或软件问题，作者不承担任何责任。若你不同意上述条款，请勿使用。
