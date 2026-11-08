# Changelog

## v1.2.0 (2026-11-08)

新架构发布：能力优先模块、manifest 驱动词典/构建/启动器、单 bundle、OCR 边界。

### 新增

- 词典：`dict/manifest.tsv` 唯一加载清单，generated/upstream/人工词条/overrides/keep-english 分层；
  `tools/dict.py`（lookup/check/report）、严格校验、未登记文件检查。
- 构建：`tools/build.py` 合并词典、组装单 bundle、同步 OCR 资产、生成构建报告；
  `tools/package.py` 生成自包含测试包/zip。
- 运行时：`src/runtime/` 的 core / rules / dom / features / adapters / entry；
  中文搜索、动态规则、Archon 整段、页面上下文注册表 `__AFCN_PAGES__`。
- 启动器：`src/launcher/` 拆分入口与 lib 模块；页面、bundle、OCR 清单由 manifest 驱动。
- OCR：源码迁入 `src/ocr/`，`manifest.json` 为唯一注册表；页面脚本保持 `afzh-*.js` 部署名。
- 门禁：`tools/verify.ps1`、CI build/release workflow、测试包与真机验证文档。

### 验证

- 词典 strict、契约、Python/Node 测试、bundle 构建与真机 Start 已验证；OCR 前置未装时自动跳过。

## v1.1.11 (2026-11-07)

执刑官源力石页面完整汉化 + 重构交接文档。

### 新增

- **执刑官源力石完整汉化**：新增 `dict/extra-12.tsv`（128 行）——54 条效果文本、26 条效果名、
  6 种颜色、6 条特性，以及「虚空石块（Stela）」「TAU源力石（Tauforged）」等界面文案；
  译名依据官方中文 wiki（执刑官源力石）。
- **源力石页面整段翻译**：效果指南/融合配方的单元格是 `v-html`（文字被伤害图标切成多个文本节点），
  改为按元素整体还原（`<img>` 用 `alt` 还原元素名）后整段翻译；战甲卡片效果摘要
  （`5 Casting speed` → `5 个 技能施放速度`、`+1 more effects` → `另有 1 种效果`）同步支持。
- **重构交接文档**：新增 `docs/项目架构与实现说明.md`（逐文件说明、数据流、钩子表、坑与重构建议）。

### 修复

- 源力石页面剩余英文：`View Amber shards`、`Topaz effects`、`100 Stela, 5 possible now`、
  `5 / 5 installed, 3 Tauforged`、`Installed on N Warframes`、`No trades recorded yet.` 等。
- **翻译规则重复叠加导致的文本膨胀**（战甲卡片出现满屏重复文字）：整段翻译增加防循环守卫
  （已含中文的文本不再处理、只有确实翻出不同结果才替换），并改用 MutationObserver 防抖触发，
  减少「先英文后中文」的闪烁。

## v1.1.10 (2026-11-07)

修复铸造厂卡片把 MR 显示成「先生」。

### 修复

- **铸造厂物品卡片**：vendor 层把 `MR:` 机翻成「先生：」（把 MR 当成 Mr.），改由 `fixes.tsv` 覆盖为
  「**段位：**」，卡片显示「段位：12」。引擎原有的 `MR N → 段位 N` 规则不受影响。

## v1.1.9 (2026-11-07)

汉化补全 + 裂罅/WFM 适配 + 上架诊断。

### 修复

- **星图统计**：`Junctions:` 由「路口」改为「**枢纽**」，与「钢铁之路枢纽」统一（`fixes.tsv` 覆盖 vendor 层）。
- **WFM 裂罅类型**：`Atragraph` → 「墨染」（Atragraph Mod 是游戏里的“艺术化”MOD 类型）。
- **裂罅属性名（含熔接词条）**：按游戏数据补齐 54 条裂罅属性名，新增 `dict/extra-11.tsv`：
  - 基础：`Zoom` 变焦、`Range` 攻击范围、`Status Damage` 异常状态伤害、`Finisher Damage` 处决伤害 等；
  - 熔接（裂罅熔接器）结果：`Weak Point Damage` 弱点伤害、`Weak Point Critical Chance` 弱点暴击几率、
    `Ammo Efficiency` 弹药效率、`Magazine Reloaded/s when Holstered` 收起武器时弹匣每秒自动装填、
    `Melee Damage on Heavy Attack` 在重击时的近战伤害、`Heavy Attack Wind Up Speed` 重击准备速度、
    `Parry Angle` 招架角度、`Slam Attack Damage` 震地攻击伤害、`Damage to Scaldra/Techrot/Orokin`；
  - 特殊词条：`Critical Chance (x2 for Heavy Attacks)` 暴击几率（重击时 x2）、`Fire Rate (x2 for Bows)` 射速（弓类武器效果加倍）。
- **相似裂罅（warframe.market 数据）**：补 WFM 短名映射（`Crit. chance`、`Crit. damage`、`Magazine size`、
  `Heavy attack eff.`、`Crit % on slide`、`Melee damage`、`Initial combo` 等）；
  `engine.js` 新增「正负号前缀」规则：`+Multishot` → `+多重射击`、`-Zoom` → `-变焦`。
- **裂罅卡片纯数值词条**：新增「数字 + 属性名」规则，`+0.3 Range` → `+0.3 攻击范围`、`6s Combo Duration` → `6 秒连击持续时间`
  （与游戏内熔接说明的「秒连击持续时间」写法一致）。
- **`src/build.py` 词典叠加顺序**：`extra-*.tsv` 改为按数字排序（此前 `extra-10/11` 会被 `extra-2..9` 覆盖，
  新词条不生效）。
- **裂罅上架 WFM 诊断**：WFM 报错 toast 的完整文本会写入日志；上架前记录武器名、属性与三档价格，
  用于定位 400 错误（例如熔接词条）。
- **WFM 界面文案**：`List on warframe.market`（标题/按钮）、`Edit warframe.market listing`、`75% match`、
  `Whisper`、`avail.`、`Orders`、`Invisible`、`Create alert`、`Compare live market listings`、
  `Hide/Show`、`Filtered`、`Copied` 等；`data-tippy-content` 也纳入翻译属性，悬停提示同步中文。
- **外部数据大小写回退**：WFM 返回的属性名大小写不固定（`Status damage` / `Status Damage`），
  引擎在精确匹配未命中时按小写再查一次。
- **星图统计**：`Duviri:` 由 vendor 层误译「杜维里：」改为「双衍王境：」。

### 参考

- 裂罅属性中译名参考 <https://github.com/wxhn1225/riven-roll> 的 `src/data/game.json`（游戏数据，简中词形）。

### 已知限制

- 带**熔接词条**的紫卡上架 WFM：v1.1.9 实测可正常上架（此前 400 判断为 WFM 连接瞬断，
  非词条本身问题）；诊断日志保留备用。
- 统计 → 交易历史在中文游戏语言下仍不可用（官方限制），可行性评估见 `docs/待改进清单.md`。

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
- **词库补漏 `dict/extra-10.tsv`（12 条）**：裂罅属性名（`Beam Length`、`Headshot Critical Chance`、
  `Maximum Ammo`、`Melee Status Chance`、`Slam Attack Damage`、`Slide Critical Chance`、`Self Damage Reduction`）
  与 `Ascent`/`Coalescent`/`Points`/`Veil`/`Volatile`；未覆盖界面串 **166 → 20 条**。
- **修掉 `scan_missing.py` 的 141 条误报**：之前没排除补丁自己注入的 `afzh-*.js`（OCR 桥/图片映射），
  把补丁内部字符串当成了界面缺口；现按 `afzh-` 前缀排除。
- **裂罅属性（已揭示裂罅/探索器卡片）**：插件把「数值+属性名」拼成一个文本节点（`+109.9% Critical Damage`、
  `x1.5 Damage to Corpus`），整串匹配不到词典，之前只有带颜色 span 的伤害类型能翻。`src/engine.js` 新增两条规则：
  百分比前缀与 `xN` 倍率前缀先拆开，只翻后半段属性名；属性名翻不出来时整串保持原样。
- **遗物中文模糊搜索**：库存「遗物」列表的条目只带遗物名（`Axi I1`），没有奖励字段，所以之前
  输入「死亡」（想找含「死亡魔方」奖励的遗物）搜不到；输入「死亡魔方」/「魔方」能命中是因为退回了
  英文改写（`Dethcube`）而原生搜索会匹配奖励。
  新增 `dict/relic-rewards.tsv`（800 个遗物 → 奖励中文名，`src/build_relic_rewards.py` 从本机游戏数据
  生成、随仓库分发）+ 构建时注入 `window.__AFCN_RELIC_REWARDS__`，本地过滤把奖励中文名一起参与匹配，
  精炼后缀（`Radiant` 等）自动剥离。
- **裂罅伤害类型显示**：裂罅卡片里的伤害类型现在显示为「冰冻伤害 / 火焰伤害 / 毒素伤害…」
  （原为「冰冻 / 火焰 / 毒素」），按卡片上下文（祖先 class 含 `riven`）判定，图标保持不动；
  百分比属性规则同步支持该后缀。
- 同轮词形修正：`Coalescent` 统一为官方「联结」、`Kuva Fort.` 修正为「赤毒要塞」（vendor 层多了句号）、
  `Ammo Maximum` 统一为「最大弹药量」。

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
