# Changelog

## v1.1.8 (2026-11-07)

修复 v1.1.7 的两个回归，并把「合并前验证」固化成脚本与流程。

### 修复

- **中文搜索恢复「本地过滤优先」**（v1.1.5~v1.1.7 是「中文→英文改写优先」）：
  反向索引是词典全量建的，混着 UI 术语。实测词典 `dict/mioeu-terms.tsv:769` 有 `Death -> 死亡`，
  用户输入「死亡」被精确命中并改写成英文 `Death` 交给原生搜，而铸造厂里没有英文名含 `Death` 的物品
  → 原生 0 条 → 界面「无匹配物品」；同一份词典里「死亡使徒」= Kaszas 本来能本地命中（含「死亡」的键有 39 个）。
  - 中文查询改为：清空 `search` → 取当前分类/筛选的完整列表 → 按中英双向索引本地过滤（支持**部分中文**，如「死亡」）；
  - 只有**本地 0 命中**且有可靠英文候选时，才退回一次原生英文搜索（物品名缺中文/词典缺译时不丢结果）；
  - 铸造厂钩子强制 `showAll=true`：实测（2026-11-07 12:56）`type=all` 时 `showAll=false` 只回 **100 条**
    （Acrid/Ack & Brunt/Acceltra…），`showAll=true` 回 **813 条** ——「全部」分类下的中文搜索因此才完整，
    否则排在 100 条之后的物品（如「死亡使徒」）永远搜不到；
  - 裂罅武器搜索（`GetRivenWeapons`）同样改为本地优先；
  - 本地 0 命中退回英文改写时输出诊断日志（中文词、原生条数、首条 name/字段）。
- **赋能（Arcane）页中文搜索**：库存「赋能」页不走 `getFilteredInventory`，而是在
  `mainInventory.js:173 receiveArcaneProgress()` 里用 `this.search` 对英文字段做子串过滤。
  新增应用级钩子：中文时临时清空 `search`、取全量后用中英索引过滤 `this.items`，结束后还原搜索框内容。
- **节点/星球名**：仲裁、入侵、裂缝里的 `Lares, Mercury` 这类「节点, 星球」复合文本，之前整串匹配不到词典；
  新增 `translateComposite()` 只翻逗号后的星球名（`Lares，水星`），节点名保持英文——与游戏中文客户端一致。
- **启动器丢失 UTF-8 BOM**：v1.1.7 的提交把 `bin/AlecaFrame-ZH.ps1`（41 KB）的 BOM 弄丢了，
  CI 的 `Check PowerShell UTF-8 BOM` 从 v1.1.7 起必然失败；PowerShell 5.1 下
  Start / Restore / Refresh / Status 快捷方式还会因中文乱码直接解析报错。已补回 BOM，脚本内容零改动。

### 新增

- **`scripts/verify.ps1`**：合并到 main 前的统一门槛。覆盖 CI 全部检查（构建/产物标记/TSV/BOM/JS 语法/单测），
  并新增 PowerShell 语法解析、`VERSION` 与 `CHANGELOG` 一致性、生成物未入库、`-Package` 发布包自检。
- **`docs/分支与发布流程.md`**：main 只接受来自 `dev` / `feature/*` 的合并提交；改动先在分支验证，
  全绿并手动回归后再合入 main、打 tag、推送。
- 中文搜索单元测试从 40 项增加到 **47 项**（部分中文、英文透传、0 命中兜底、裂罅武器、强制 showAll、赋能页钩子）。

### 变更

- 《维护手册》便携目录路径与打包示例改为 `$local` 变量（本机已从 `D:\AlecaFrame-ZH` 迁入工作区 `AlecaFrame-ZH\`）。

## v1.1.7 (2026-11-07)

新增一键诊断包（跨机器排障）与日志滚动。

### 新增

- **`导出诊断包.cmd` + `scripts/Export-Diagnostics.ps1`**：把出问题机器上的
  环境、版本、注入状态、charset 状态、OCR 组件、桌面快捷方式、启动器状态、各日志尾部
  打包成 `桌面\AlecaFrame-ZH-Diagnostics-<时间>.zip`，直接发给维护者即可定位。
  - 只读收集，不修改任何状态；token/密码/邮箱做粗粒度打码
  - 打包前会提示日志中可能包含 Warframe / Warframe.Market 用户名
- `launcher.log` 超过 2 MB 自动裁剪为最近 2000 行，避免长期使用后无限增长
- README 新增「出问题时怎么报」；维护手册新增第 9 节「诊断包」

### 变更

- `scripts/package.py` 发布包包含 `导出诊断包.cmd`

## v1.1.6 (2026-11-07)

修复库存/遗物中文搜索失效（根因：background.html 缺 UTF-8 声明）。

### 修复

- **根因（运行时自检实证）**：`background.html` 没有 `<meta charset>`，浏览器按 Windows-1252 解码
  注入的脚本，脚本里所有中文字面量（整份词典、`hasChinese` 的判断对象）都变成乱码
  （`膛线` 被读成 `U+00E8 U+2020 U+203A ...`）。于是：
  - `hasChinese("膛线")` 返回 false → 中文查询被当成英文放过；
  - 反向索引的键也是乱码 → 查不到 `膛线 -> Serration`。
  main.html 有 charset，所以界面显示正常，只有 background 里的插件级搜索钩子失效。
- **启动器修复**：注入前检查页面是否声明 charset，缺失则在 `<!DOCTYPE>`/`<head>` 之后（所有 `<script>` 之前）
  插入 `<meta charset="utf-8">`。目前只有 `background.html` 需要补。
- 中文查询解析改为**直接查运行时反向索引 Map**（`index.reverse`），不再依赖包装函数；
  另加零宽字符清理与 CJK-only 兜底。
- 新增运行期自检日志：启动时打印 `膛线→Serration`、`hasChinese`、字符码点，便于以后一眼定位编码问题。
- `scripts/test-inject.ps1` 增加断言：background.html 必须补 charset 且位于第一个 `<script>` 之前。

## v1.1.5 (2026-11-07)

中文搜索改为「中文 -> 英文查询改写」，修复库存/遗物里中文搜不到的问题。

### 修复

- **根因（实测日志）**：库存搜索钩子确实生效，但原生返回的是完整列表（mods 分类 1701 条），
  我们本地按 `item.name` 过滤时 0 命中 —— 3.0.6 返回条目的名字字段与本项目词典的英文键对不上，
  导致中文搜不到。
- **改为原生查询改写**：中文查询先用反向索引翻成英文（`膛线 -> Serration`、`布莱顿 -> Braton`、
  `分裂膛室 -> Split Chamber`、`并合 膛线 -> Amalgam Serration`），再交给原生插件搜索。
  这样与英文搜索行为完全一致（排序、匹配范围、条数限制都不变）；只有无法可靠翻译时才回退到本地过滤。
- 裂罅武器搜索（`GetRivenWeapons`）同样优先改写为英文查询。
- 0 命中诊断日志追加 `首条字段=...` 与 `name=...`，便于继续排查字段结构差异。

## v1.1.4 (2026-11-07)

中文搜索可诊断性 + 空结果提示本地化。

### 修复 / 改进

- 中文搜索 0 命中时输出诊断日志（原生条数、过滤条件），便于区分
  “该分类本来就没有这个物品” 与 “过滤逻辑没匹配上”
- 补齐仓库空结果相关文案：
  - `Try another search or clear your filters.` → 附带说明「中文搜索只在当前分类内生效」
  - `No items in this category yet`、`Try again`、`No matches in this ranking. Try another search.`
- 说明：库存「所有部件（All parts）」分类不包含 MOD/赋能/遗物，这是官方分类行为，
  英文搜索在该分类下同样搜不到 `Serration`；中文搜索与英文搜索的分类范围一致

## v1.1.3 (2026-11-07)

桌面快捷方式改为中文命名，防止误操作。

### 变更

- 桌面快捷方式重命名（名称里直接写明后果）：
  - `AlecaFrame 中文版（启动）` —— 会重启 Overwolf
  - `AlecaFrame 英文版（恢复）` —— 会重启 Overwolf
  - `AlecaFrame 中英切换（不重启）` —— 只重载 AlecaFrame
- 每个快捷方式补充悬停说明（tooltip），写明是否重启 Overwolf
- 重新运行 `Install-Shortcuts.cmd` 时会自动清理旧版英文命名快捷方式，避免新旧两套并存

## v1.1.2 (2026-11-07)

修复 OCR 前置组件安装"假失败"（模型其实已装好，但校验报不完整）。

### 修复

- **`Test-PaddleModels` 找错目录**：PaddleOCR 2.9.1 把模型放 `~/.paddleocr`，运行时
  （`relic-ocr-server.js`）把 `HOME/USERPROFILE` 设为 `<tools>\paddleocr-home`，而安装器把
  `HOME/USERPROFILE` 设成 `.tools`，模型落到 `.tools\.paddleocr`，校验却在 `paddleocr-home` 下找，
  于是永远报"模型文件仍不完整"。
  - 安装器改为 `HOME/USERPROFILE = paddleocr-home`，与运行时一致；
  - 校验同时检查两处目录；
  - 已按旧逻辑下载过模型的机器，安装器会自动把 `.tools\.paddleocr` 迁移过去，不重复下载。

## v1.1.1 (2026-11-07)

修复 OCR 前置组件安装失败（退出码 1）。

### 修复

- **`scripts/Install-OcrPrerequisites.ps1`：依赖探测阶段必然失败**
  PowerShell 5.1 下 `$ErrorActionPreference = "Stop"` 时，native 命令写 stderr 再被重定向（`*> $null` / `2>$null`）
  会被当成终止性错误（`NativeCommandError`）。`Test-PythonPackages` 探测未安装的 paddle 时正好触发，
  导致脚本在"下载 pip"之前就退出（退出码 1），表现为装完便携 Python 后立即失败。
  改为 `Invoke-NativeQuiet` / `Get-NativeVersion`，临时放宽 EAP 后再调用。
- **安装失败时拿不到原因**：安装器现在用 `Start-Transcript` 全程写 `logs\ocr-install.log`，
  失败时窗口停留并提示日志路径；启动器也会把日志末尾几行带进错误弹窗。
- 发布包完整性：`scripts/package.py` 增加 `verify()`，缺必需文件时直接让发布流水线失败（含 `scripts/` 目录）。

## v1.1.0 (2026-11-07)

第二个开源整理版本：并入 MIOEU 的**中文搜索**与**中文 OCR**，并用两个上游项目做词库查漏补缺。

### 新增

- **中文搜索**（`src/search.js`，移植自 MIOEU 并适配 AlecaFrame 3.0.6）
  - 仓库 `#inventorySearch`、铸造厂 `#foundrySearch`、遗物规划器 `#relicPlannerSearch`
  - WFM 订单/合同列表、已揭示裂罅列表、裂罅查找器武器搜索
  - 市场搜索框：中文输入 -> 反向索引换英文查询；建议列表显示中文
  - 3.0.6 适配：插件级钩子安装在 `background.html`（插件实例所在窗口），应用级钩子安装在 `main.html`
  - 纯函数测试 `tests/search.test.mjs`（40 项）
- **可选中文 OCR**（`bin/ocr/`，移植自 MIOEU）：中文界面下的遗物推荐、遗物奖励、裂罅识别
  - `安装OCR前置组件.cmd` 在 `bin/ocr/.tools` 内安装便携 Python/Node/PaddleOCR 与中文模型
  - `启用中文遗物OCR.cmd` / `关闭中文遗物OCR.cmd`；状态文件 `AlecaFrame-ZH.settings.json`
  - 本地服务 `127.0.0.1:38147`，协议与 MIOEU 保持一致
  - 未安装前置时自动降级：界面汉化与中文搜索照常工作
- **词库查漏补缺**
  - `dict/mioeu-terms.tsv`：吸收 MIOEU 术语库 8,195 条中的缺口部分（3,276 条，冲突保留本项目译名）
  - `src/scan_missing.py`：扫描本机 AlecaFrame 源码，导出未翻译界面文本
  - `dict/extra-8.tsv`：按扫描结果补齐 1,113 条界面文案，未覆盖候选从 1,136 降到 25
  - 合并词库从 20,757 条增加到 **25,145 条**
- **启动器**
  - 新动作：`OcrOn` / `OcrOff` / `InstallOcr`
  - 还原范围扩展到 OCR 改写的 `web/assets/js/relicOverlay/main.js`
  - 无 `app.opk` 缓存时可用「当前官方文件」自动建立快照（并校验未被汉化过）
  - `Status` 显示 OCR 开关 / 前置 / 服务状态
- **工程**
  - `scripts/test-inject.ps1`：在临时副本上回归注入/还原（含真实安装锚点只读检查）
  - CI：构建校验 + JS 语法检查 + 搜索单元测试

### 修复

- 构建校验不再把「本项目自己注入的脚本」算作词条已存在（此前会掩盖缺口）
- 校验时还原源码里的 `\'` / `\"` 转义，减少假阴性

### 已知限制

- `build-unmatched.txt` 里仍有约 405 条词条在 3.0.6 源码中找不到字面量，主要是上游 2.x 时代的淘汰文案（无害，不会命中）
- 中文搜索时库存/遗物汇总数字仍是「清空搜索后」口径（与 MIOEU 一致）
- OCR 对官方脚本有两处原位补丁，升级 AlecaFrame 后需先跑 `scripts\test-inject.ps1`

## v1.0.0 (2026-11-06)

首个开源整理版本。

- 启动器：中文启动 / 恢复英文 / 会话内切换 / 刷新词库 / 状态查看 / 桌面快捷方式
- 运行时翻译层：DOM 精确匹配 + MutationObserver 动态补翻 + 数字/日期/数量模板规则
- UI 词库：上游 1,104 条 + 人工补充/修正约 900 条
- 物品名：从 AlecaFrame 本地游戏数据生成 18,778 条（武器 / MOD / 赋能 / 资源 / 遗物 / Prime 部件；战甲名保留英文）
- 合并后词库总计 20,757 条
- 文档：README、维护手册、可行性评估
- CI：push/PR 构建校验；`v*` tag 自动打包发布
