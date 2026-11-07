# AlecaFrame 简体中文补丁（AlecaFrame-ZH）

> 项目正在按新架构实现。本文描述当前可执行流程；目标架构/命令以 [AGENTS.md](AGENTS.md)、[docs/README.md](docs/README.md) 与项目计划为准。文中版本/数量是写作时快照，以 `VERSION` 和构建输出为准。

给 Overwolf 应用 **AlecaFrame** 增加简体中文界面，并让物品名（武器 / MOD / 赋能 / 资源 / 遗物 / Prime 部件）按游戏官方简中显示。

- 非官方、开源的本地化补丁；通过“运行时注入”实现，**不修改官方安装包、签名或 DLL**
- 支持**随时开启 / 随时取消**（中文启动、恢复英文、会话内快速切换）
- 支持**多台电脑部署**（整个文件夹拷走即可，自动定位 Overwolf 与 AlecaFrame 版本）
- 词库约 **2.5 万条**（UI 文案 + 18,778 条物品名 + MIOEU 术语补缺 + 人工补漏）
- 可选 **中文搜索**（仓库/铸造厂/遗物规划器/WFM 列表/市场搜索框可直接输中文）
- 可选 **中文 OCR 增强**（遗物推荐、遗物奖励、裂罅识别在中文界面下也能工作）

![遗物规划器](docs/images/zh-relic-planner.png)

---

## ⚠️ 重要声明（务必先读）

1. 本项目为**非官方**汉化补丁，与 AlecaFrame 作者、Overwolf、Digital Extremes 均无关联。
2. 实现方式是：启动 Overwolf 时传入参数关闭扩展完整性校验（`--ow-disable-features=extension-validation,...` + `--ow-enable-features=force-validation-report-only`），再注入翻译脚本。这**违反 Overwolf 平台条款** 7.2(ii)（禁用安全特性）/ 7.2(iii)（派生作品）。使用即表示你自行承担被平台限制、升级失效等风险，**不建议公开分发或商业使用**。
3. 补丁只修改 AlecaFrame 的前端页面，**不修改 Warframe 游戏文件**；DE 对第三方软件的政策是“自担风险（at your own risk）”。
4. 本仓库**不包含任何 AlecaFrame 源码**（其版权归作者所有），仅包含本项目自己的脚本、词典与文档。
5. 中文 OCR 是**可选组件**：会在项目目录内下载 Python / Node / PaddleOCR 与中文模型（数百 MB），不装也能正常使用界面汉化与中文搜索。

---

## ✨ 特性

| 功能 | 说明 |
|---|---|
| 界面汉化 | 主窗口、侧栏、设置、遗物规划、裂罅、统计、MOD 规划、仲裁、市场、小队等页面 |
| 物品名汉化 | 武器、MOD、赋能、资源、遗物、Prime 部件；**战甲名保留英文** |
| 动态文本 | 数字/日期/数量前缀等模板规则翻译（如 `223 recorded days` → `223 天已记录`） |
| 中文搜索 | 仓库 / 铸造厂 / 遗物规划器 / WFM 列表 / 市场搜索：输入中文自动转成英文查询再本地过滤 |
| 中文 OCR（可选） | 中文界面下遗物推荐、遗物奖励、裂罅界面仍能识别（官方 OCR 只认英文） |
| 一键开关 | `Start`（中文）/ `Restore`（英文）/ `Toggle`（会话内切换）/ `OcrOn` / `OcrOff` |
| 多机部署 | 自动查找 Overwolf 安装路径与扩展版本，无需改路径、无需管理员权限 |
| 可维护 | 词典为纯文本 TSV；构建脚本可再生成运行时 JS；有 CI 与词条校验 |

对比截图：

| 中文 | English |
|---|---|
| ![中文](docs/images/zh-foundry.png) | ![English](docs/images/en-foundry.png) |

---

## 🚀 快速开始（普通用户）

> 需要先安装 [Overwolf](https://www.overwolf.com/) 和官方 **AlecaFrame**，并打开一次（让 `PackagesCache` 与 `Extensions` 目录生成）。

1. 从本仓库的 **Releases** 下载最新 `AlecaFrame-ZH-v*.zip`；
2. 解压到任意本地目录（例如 `D:\AlecaFrame-ZH`）；
3. 双击 `Install-Shortcuts.cmd`（桌面生成 3 个快捷方式）；
4. （可选）双击 `安装OCR前置组件.cmd` 装中文 OCR；
5. 以后：
   - **AlecaFrame 中文版（启动）**：中文模式启动（会重启 Overwolf）；
   - **AlecaFrame 英文版（恢复）**：恢复英文原版（会重启 Overwolf）；
   - **AlecaFrame 中英切换（不重启）**：在中文会话内快速切换中/英（只重载 AlecaFrame）。

> 如果启动后仍是英文：看 `logs\launcher.log`；如果 AlecaFrame 打不开：先运行 **Restore**，再运行 **Start**。

### 中文 OCR（可选增强）

| 操作 | 命令 |
|---|---|
| 安装前置（一次性，需联网） | `安装OCR前置组件.cmd` |
| 开启（默认开） | `启用中文遗物OCR.cmd` |
| 关闭（保留界面汉化） | `关闭中文遗物OCR.cmd` |

- OCR 前置装在 `bin\ocr\.tools\`（便携 Python + Node + PaddleOCR 模型），**不修改系统全局环境**；
- 首次识别时 Paddle 模型要加载，可能失败一次后正常（冷启动最长约 2 分钟）；
- 不装前置也能用界面汉化与中文搜索，启动器会自动跳过 OCR 并在日志里提示。

---

## 🛠 从源码构建

环境：Windows + PowerShell 5.1 + [Python 3](https://www.python.org/)。

```powershell
# 1) 生成运行时脚本 bin/alecaframe-zh-cn.js 与 OCR 词典 bin/ocr/afzh-items.js
python src\build.py

# 2) 如需根据本机游戏数据重新生成物品名对照（可选）
python src\build_items.py

# 3) 重新扫描未翻译文本（可选，配合 dict/extra-8.tsv 维护）
python src\scan_missing.py

# 4) 打包发布 zip（可选）
python scripts\package.py
```

构建产物：`bin/alecaframe-zh-cn.js`（约 1.1 MB，词典 + 翻译层 + 中文搜索）、`bin/ocr/afzh-items.js`（OCR 服务用的英文->中文映射）。

> 两个产物都是生成文件，已在 `.gitignore` 中忽略；发布 zip 时由构建步骤生成。
> 启动器 `bin/AlecaFrame-ZH.ps1` 含中文，**必须保持 UTF-8 with BOM** 保存，否则 Windows PowerShell 5.1 会乱码报错。

自检（不碰真实安装，在临时副本上跑注入/还原）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-inject.ps1
```

---

## 📁 目录结构

```
AlecaFrame-ZH/
├─ Start-Chinese.cmd / Restore-English.cmd / Toggle-Chinese.cmd
├─ Refresh-Chinese.cmd / Status.cmd / Install-Shortcuts.cmd
├─ 安装OCR前置组件.cmd / 启用中文遗物OCR.cmd / 关闭中文遗物OCR.cmd
├─ 导出诊断包.cmd               一键打包日志/环境/状态，出问题直接发 zip
├─ bin/
│  ├─ AlecaFrame-ZH.ps1          启动器（还原官方文件 -> 带参启动 -> 注入 -> 重载）
│  └─ ocr/                       可选：中文 OCR 子系统（服务端 + 页面注入脚本 + 安装器）
├─ dict/
│  ├─ items.tsv                  物品名对照（自动生成，18,778 条）
│  ├─ mioeu-terms.tsv            吸收自 MIOEU 的术语补缺
│  ├─ extra-1..9.tsv             UI 文案词库（人工维护）
│  └─ fixes.tsv                  覆盖上游机翻错误
├─ src/
│  ├─ engine.js                  运行时翻译层（DOM 遍历 + MutationObserver + 规则）
│  ├─ search.js                  中文搜索（反向索引 + 各页面查询钩子）
│  ├─ build.py                   合并词典 -> bin/alecaframe-zh-cn.js + bin/ocr/afzh-items.js
│  ├─ build_items.py             从游戏数据生成 dict/items.tsv
│  ├─ scan_missing.py            扫描未翻译界面文本 -> dict/gap-candidates.tsv
│  ├─ import_mioeu.py            从 MIOEU 提取术语生成 dict/mioeu-terms.tsv
│  └─ vendor/translations.zh-CN.json  上游词库（MIT，见 NOTICE）
├─ docs/
│  ├─ 项目架构与实现说明.md      宿主/现有实现参考：逐文件说明、数据流、坑（新架构见 AGENTS/ADR）
│  ├─ 维护手册.md                完整维护文档（强烈建议维护者阅读）
│  ├─ OCR集成说明.md             OCR 集成契约（注入页面/启动参数/协议/排障）
│  ├─ 中文搜索原理.md            中文搜索的宿主判定与实现说明
│  ├─ 词典来源.md                词库分层、冲突处理与缺口报告
│  ├─ 可行性评估.md              早期技术调研存档
│  └─ images/                    截图
├─ tests/                        搜索模块单元测试
├─ scripts/build.ps1 / package.py / test-inject.ps1 / Export-Diagnostics.ps1
└─ .github/workflows/            CI：构建校验 + 语法检查 + 测试 + tag 发布
```

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

## 🔄 版本更新与兼容性

- AlecaFrame / Overwolf 更新后，补丁可能需要适配（本机曾观察到 12 小时内小版本更新）。
- 更新后先运行一次 **Start**：脚本会自动选择最新版本目录并从该版本 `app.opk` 还原、重新注入。
- 若出现 `HashMismatch` 或 AlecaFrame 打不开：说明校验参数失效或页面结构大改，参见 [维护手册](docs/维护手册.md) 第 6 节。
- 已适配基线：AlecaFrame `3.0.6` / Overwolf `0.311.1.6`（2026-11）。
- **OCR 对官方脚本有两处原位补丁**（`relicOverlay/main.js` 的奖励回退、`rivenOverlay.html` 的 `:key`），升级后先跑 `scripts\test-inject.ps1` 的“真实安装锚点只读检查”。

### 从源码更新 / 换机器部署

| 场景 | 做法 | 需要 Python？ |
|---|---|---|
| 普通用户更新 | 下载新 Release zip 覆盖旧目录（保留自己的 `state/`、`logs/`） | 不需要 |
| 从 clone 更新 | `git pull` 后运行 `python src\build.py` 重新生成运行时脚本 | 需要 |
| 换一台电脑 | 拷整个目录（或 Release zip），双击 `Install-Shortcuts.cmd`；`state/`、`logs/` 不必同步 | 不需要 |

> 仓库里只有源码与词典；`bin/alecaframe-zh-cn.js`、`bin/ocr/afzh-items.js` 是构建产物，Release zip 内已包含。
> 仓库**不含任何本机路径、账号或环境变量**；`bin/ocr/.tools`（OCR 运行期依赖）只在执行 `安装OCR前置组件.cmd` 时下载，不入库。

---

## 🐞 出问题时怎么报（其他电脑同样适用）

双击 **`导出诊断包.cmd`**，会在桌面生成 `AlecaFrame-ZH-Diagnostics-<时间>.zip`，把这个 zip 发给维护者即可。它只**读取**不修改，包含：

| 内容 | 说明 |
|---|---|
| `env.txt` | 系统版本、Overwolf/AlecaFrame 版本、注入状态、charset 是否补上、OCR 组件与模型、快捷方式 |
| `status.txt` | `Status.cmd` 的输出（汉化状态 / 会话参数 / OCR 开关） |
| `injection.txt` | 10 个页面各自注入了哪些脚本、是否声明 UTF-8 |
| `logs/` | `launcher.log`、`ocr-install.log`、OCR 运行日志、上次会话状态 |
| `overwolf/` | Overwolf 自己的窗口日志尾部（含扩展加载/校验信息） |

> 日志里可能含 Warframe 用户名、Warframe.Market 用户名；token/密码/邮箱已做粗略打码，回传前可自行检查。

常见故障的排查顺序：`Status.cmd` → `logs\launcher.log` → `导出诊断包.cmd`。

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
按顺序排查：`安装OCR前置组件.cmd` 是否成功 → `bin/ocr/afzh-items.js` 是否存在（跑 `python src\build.py`）→ `Status.cmd` 看缺失项 → `state\RelicChineseOcr\helper.err.log`。

**Q：更新后中文没了怎么办？**
运行 `Start-Chinese.cmd`。仍不行看 `logs\launcher.log`，或 `Restore` 后重试。

---

## 🙏 致谢与许可

- 本项目代码：MIT License（见 [LICENSE](LICENSE)）。
- 上游 UI 词库 `src/vendor/translations.zh-CN.json` 来自社区项目 [MIOEU/AlecaFrame-ZH](https://github.com/MIOEU/AlecaFrame-ZH)（MIT）与 [191086215333/AlecaFrame-ZH-](https://github.com/191086215333/AlecaFrame-ZH-)（MIT）。
- 中文搜索、中文 OCR 子系统与遗物奖励回退补丁移植自 [MIOEU/AlecaFrame-ZH](https://github.com/MIOEU/AlecaFrame-ZH)（MIT），我们只做了路径适配与工程化改造；Overwolf 0.311 兼容参数参考 [MIOEU#3](https://github.com/MIOEU/AlecaFrame-ZH/pull/3)。
- 详见 [NOTICE.md](NOTICE.md)。
- 物品中英文名来自 AlecaFrame 本地游戏数据与 Warframe 官方本地化，版权归 Digital Extremes；仅用于第三方工具的中文显示。
- AlecaFrame © Alejandro Cabrerizo，All rights reserved；本项目不包含其源码。

---

## 📌 免责声明

本项目仅供学习与个人使用。因使用本补丁导致的账号、平台或软件问题，作者不承担任何责任。若你不同意上述条款，请勿使用。
