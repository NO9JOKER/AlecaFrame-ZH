# Changelog

## 未发布

### 修复：OCR 前置安装首次初始化模型会报「索引超出了数组界限」（模型其实已装好）

- **现象**：全新安装首次运行 `安装OCR前置组件.cmd`，模型初始化步骤弹窗“OCR 前置组件安装失败（退出码 1）”，
  日志显示 `& python -c "from paddleocr import PaddleOCR; ..."` 抛 `索引超出了数组界限`
  （IndexOutOfRangeException）；但模型文件其实已在同一步下载完成，重跑一次或直接启动即可用。
- **根因**：PowerShell 5.1 在真实控制台 + `Start-Transcript` 下处理 PaddleOCR 首次下载时的 tqdm
  进度条输出，会在原生命令输出/转录路径上抛 IndexOutOfRangeException；脚本 trap 随即以退出码 1 结束，
  并跳过了后面的 pip 缓存清理（本次实测残留 `.tools\pip-cache` 331.6 MB）。
- **修复**（`scripts/Install-OcrPrerequisites.ps1`）：
  - 模型初始化改为写临时 `.py` 文件执行（不再用 `-c` 长参数），并把全部输出重定向到
    `bin\ocr\.tools\downloads\paddleocr-warmup.log`；
  - 成功判定改为 `Test-PaddleModels`（模型文件齐全即成功），不再以子进程退出码为准；
  - 失败时把日志末尾 15 行带进错误信息，便于诊断；
  - 成功后继续执行原有的 pip 缓存清理，不再因这一步提前退出而残留。
- **验证**：隔离环境（清空模型缓存 → 走首次下载路径）对比验证：新写法（临时 `.py` + 输出重定向）
  模型下载完成、退出码 0、模型 9 个文件齐全；脚本经 Windows PowerShell 5.1 AST 解析通过（0 错误），
  repo 门禁通过。真实控制台下的 IndexOutOfRangeException 已由用户真机日志（2026-11-09 23:57）复现，
  新写法待下次全新环境安装时做真机复验。

### 修复：裂罅「未揭示裂罅」页未汉化（Unseen (???) rivens / 卡片类型名 / 挑战提示）

- **现象**：主窗口 → 裂罅 → 未揭示裂罅（Veiled stash）页里，分组标题 `Unseen (???) rivens`、
  卡片名 `Zaw Riven` / `Rifle Riven` / `Kitgun Riven` / `Shotgun Riven` / `Melee Riven` /
  `Pistol Riven`、提示 `Equip these rivens to reveal their challenge` 仍为英文。
- **根因**：这些文本不是页面静态文案，而是 C# 插件 `AlecaFrameClientLib.dll` 下发的数据：
  - 分组标题来自 `group.challengeDescriptionHtml`（未知挑战组的固定文案是 `Unseen (???) rivens`）；
  - 卡片标题来自 `riven.name`，模板先做 `.replace(' Mod','')`，所以实际显示 `Rifle Riven` 等——
    词典里只有 `Rifle Riven Mod`，精确匹配不到；
  - 挑战提示来自 `riven.challengeStringWithComplication`（`Equip these rivens to reveal their challenge`）。
- **修复**：`dict/entries/screens/riven.tsv` 补 11 条精确词条：分组标题、挑战提示与兜底提示，
  以及由 `dict/generated/items.tsv` 的 `X Riven Mod` 译文去掉 ` Mod` 得到的 8 种卡片名
  （步枪/霰弹枪/手枪/近战/组合枪/Zaw/曲翼枪械/同伴武器裂罅）。
  `tests/golden/build.json` 按词典变更重新 snapshot（entries 25,408 → 25,419，bundle hash 更新）。
- **验证**：`dict.py check --strict`、`build.py`、`golden.py verify`、python unittest、
  node runtime/rules/search 测试全过；bundle 中已确认包含新词条；未揭示裂罅页面真机复验待确认。

### 修复：资源掉落来源未翻译（Rotation B）且星球名未匹配

- **现象**：主窗口 → 资源仓库 → 打开资源详情（如合金板），`Known drop sources` 列表整行是英文，
  例如 `Mars/Gradivus (Caches), Rotation B`：星球名、任务名、轮次名都未翻译。
- **根因**：该行来自 C# 插件下发的 `location` 字段，页面以单个文本节点渲染
  （`{{source.location}}`）；词典里只有 `Rotation`、`Caches`、`Mars` 等**碎片**词条，
  没有整串结构，`Rotation B` 也不在精确匹配里。
- **修复**（`src/runtime/rules/index.js`）新增两条动态规则：
  - `resource.drop-location`：解析 `星球/节点 (任务), Rotation X`，输出
    `星球中文/节点（任务中文），轮次 X`；节点名保留游戏内英文专名（词库没有官方节点中文名），
    星球名与任务名走词典；用星球白名单避免把 `6 spawns/min` 这类带斜杠的数值串误判为掉落来源；
  - `resource.rotation`：`Rotation A/B/C` → `轮次 A/B/C`。
- **验证**：`tests/rules.test.mjs` 新增 4 个用例（星球/任务/轮次组合、无任务/无轮次、纯轮次、
  未知星球不半翻），规则表 121 → 123；`node tests/rules.test.mjs` 45 项全过；`build.py`、
  `golden.py verify`、`dict.py check --strict`、runtime/search 测试与 `tools/verify.ps1`
  （PASS=15 FAIL=0）全过。真机资源详情页复验待确认。

### 修复：资源仓库中文模糊搜索未适配

- **现象**：主窗口 → 资源仓库（Resource inventory）的搜索框输入中文（如「合金」）不会过滤，
  只能输英文；同页资源详情的「已知掉落来源」搜索同样不支持中文。
- **根因**：该页在前端用 `ResourcePlanner.matches(text, query)` 自己过滤
  （`web/assets/js/main/resources.js` 顶部的 `var ResourcePlanner`），不调用插件搜索接口，
  所以既有的「插件 JSON search 钩子」覆盖不到；列表里的资源名是英文（中文只由 DOM 翻译层显示），
  中文查询自然匹配不到。
- **修复**：
  - `src/runtime/features/search/api.js` 新增纯函数 `matchesText(text, term)`：
    英文按原子串匹配；中文走「中文字幕名 + 英文原名」；`物品名 + 位置` 拼接行退化为
    「最长可翻译前缀（物品名）」再匹配；位置里的星球名再走一次反向索引（如「火星」→ Mars）；
  - `src/runtime/features/search/runtime.js` 新增 `installResourcesSearchHook()`：
    幂等、feature-detect 地包一层 `window.ResourcePlanner.matches`，中文查询命中才接管，
    其余情况完全走原逻辑；
  - `docs/modules/features-search/README.md` 补充该 hook 的边界与匹配规则。
- **验证**：`tests/search-feature.test.mjs` 新增 3 个用例（中英文匹配、名称+位置行、位置反向索引），
  10 项全过；`runtime` 25 项、`rules` 45 项、`build.py`、`golden.py verify`（已 snapshot）、
  `dict.py check --strict`、`tools/verify.ps1`（PASS=15 FAIL=0）全过。
  真机资源仓库中文搜索复验待确认。

### 修复：掉落来源的任务名未翻译（前缀 / 等级区间 / PHASE / 派系与商人来源）

- **现象**：资源仓库 → 资源详情的「已知掉落来源」里，除最简单的 `星球/节点 (任务), Rotation X`
  外，其余格式仍是英文，例如：
  `Dark Refactory, Deimos/Recall: Dactolyst (The Perita Rebellion), Rotation A`、
  `金星/Orb Vallis (Level 40 - 60 PROFIT-TAKER - PHASE 1) 轮次 C`、
  `火卫二/Albrecht's Laboratories (Level 115 - 120 Entrati Lab Bounty) 轮次 C`、
  `Duviri Circuit`、`Extended Granum Void, Rotation A`、`Entrati (Father), Neutral`、`Vox Solaris, Agent`。
- **修复**：
  - `src/runtime/rules/index.js` 扩展来源规则并新增 4 条：
    - `resource.drop-prefixed`：`前缀, 星球/节点 (任务), Rotation X` → `前缀中文，星球/节点（任务中文），轮次 X`；
    - `resource.drop-location` 括号内支持 `Level X - Y …` 与 `… - PHASE N`，输出
      `（等级 X - Y 任务中文 - 阶段 N）`；
    - `resource.source-rotation`：无星球前缀的 `名称, Rotation X` → `名称中文，轮次 X`；
    - `resource.faction-source`：`派系 (成员), Neutral/Friendly/Hostile` → `派系中文（成员中文），中立/友好/敌对`；
    - `resource.vendor-source`：`商人, Agent` → `商人中文，代理人`。
  - `dict/entries/common/ui.tsv` 补 16 条术语词条：`Dark Refactory`/`Dark Refractory`→深溯池、
    `The Perita Rebellion`→佩里塔叛乱、`Entrati`→英择谛、`Entrati Lab Bounty`→英择谛实验室赏金、
    `Duviri Circuit`→双衍王境回廊、`Duviri Full Experience`→双衍王境完整体验、
    `Exemplar Granum Crown Cache`→范本格拉努硬币藏匿处、`Extended Granum Void`→扩展格拉努虚空、
    `Granum Void`→格拉努虚空、`Bounty`→赏金、`Phase`→阶段、`Father`→父亲、`Friendly`→友好、
    `Hostile`→敌对、`Hard`→困难（`Level`/`Normal` 上游词典已有，不重复登记）。
- **验证**：`tests/rules.test.mjs` 新增 4 个用例（前缀+组合任务、等级区间+PHASE、独立来源、
  未知前缀不半翻），规则表 123 → 127，49 项全过；`build.py`、`golden.py verify`（已 snapshot）、
  `dict.py check --strict`（entries 25,419 → 25,435）、`tools/verify.ps1`（PASS=15 FAIL=0）全过。
  真机资源详情页复验待确认。
- 说明：节点名（地图名）保持英文——官方中文客户端 269 个节点里 192 个也是英文；
  资源描述翻译（234 条）按约定后续分批做。

### 修复：资源描述（234 条 / 318 行）未翻译

- **现象**：资源仓库 → 资源详情里的英文描述（含 `Location:` 行）全部未翻译，例如
  `A mark of identification carried by soldiers during The Old War so that their names might be remembered if they never returned home.`
  与 `Location: Obtained from crates and enemies in Perita Rebellion missions (Dark Refactory).`。
- **根因**：描述来自 C# 插件下发的 `descriptionHtml`（源数据 `cachedData/json/Resources.json` 的
  `description` 字段），页面按文本节点渲染；词典里没有这些长句词条，也不适合写成动态规则。
- **修复**：新增词典文件 `dict/entries/common/resource-descriptions.tsv`
  （`dict/manifest.tsv` 顺序 120、shared、2 列），收录 234 条资源描述的 **318 个去重行**
  （含 `Location:` 行），逐行精确匹配；专有名词按官方游戏译名：Sentient 保留英文、
  Murmur→低语者、Entrati→英择谛、Duviri→双衍王境、Toroids→环型装置、Necramech→殁世机甲，
  植物/矿石等按 `dict/generated/items.tsv` 的官方译名（塔苏摩、龙旋根、福烁草、延凡草、慧泉嫩芽、
  密印髓质、萨莫感染石等）。
- **验证**：`dict.py check --strict` 通过（entries 25,435 → **25,753**，layers 22）、`build.py`、
  `golden.py verify`（已 snapshot）、`tools/verify.ps1`（PASS=15 FAIL=0）全过；
  bundle 抽查已包含描述译文。真机资源详情页复验待确认。

## v1.2.1 (2026-11-08)

### 修复：OCR 前置安装的体积与幂等性（pip 缓存落到包根 / OpenCV 回溯 / 版本自检失效）

- **现象**：运行 `安装OCR前置组件.cmd` 后，包根出现 `pip\` 目录（单机实测 949.6 MiB / 142 个文件），
  叠加 `bin\ocr\.tools\` 的 1,016.1 MiB，包目录「已装 OCR」约 1.99 GiB；首次下载约 990 MiB。
  真正的中文 OCR 模型只有约 16 MB（PP-OCRv4 det 4.70 MB + rec 10 MB + cls 1.38 MB），
  其余都是 PaddleOCR 的 Python 运行期依赖。另外**每次重跑安装都会重新执行 pip**（不跳过），
  重新拉取/重装 paddlepaddle 等包。
- **根因 1（缓存落到包根）**：安装器从未显式指定 pip 缓存目录，而它为了隔离 Paddle 模型会改写
  `HOME`/`USERPROFILE`；在这种环境下 pip 20.3.4 解析出的缓存目录不是标准用户缓存目录。
  本机两次真实安装都把缓存落在「运行安装脚本时的当前目录\pip\cache」（一次在包根、一次在开发工作区根，
  各约 949.6 MiB）。实测显式设置 `PIP_CACHE_DIR` 为绝对路径后，`pip cache dir` 固定返回该路径。
- **根因 2（依赖回溯）**：`paddleocr==2.9.1` 要求 `numpy<2` 且依赖 `opencv-python` /
  `opencv-contrib-python`；不钉版时 pip 先取 OpenCV 4.12+（要求 `numpy>=2`）再逐版回退，
  把 9 个 OpenCV 变体都下载一遍（约 950 MiB），而实际安装集只有约 304 MiB。
- **根因 3（版本自检失效导致不幂等）**：`Test-PythonPackages` 用 `python -c` 传多行断言，
  而 Windows PowerShell 5.1 调用原生程序时会丢掉参数里的双引号，Python 收到
  `assert paddle.__version__ == 2.6.2` 直接 SyntaxError（安装日志可复现），本函数永远返回 false，
  于是每次运行都重新跑 get-pip + pip install。
- **修复**：
  - `scripts/Install-OcrPrerequisites.ps1` 显式设置 `PIP_CACHE_DIR=<tools>\pip-cache`，不再落到当前目录；
  - 安装成功后删除 `pip-cache`，并回收旧版遗留在 `<包根>\pip` 的缓存（只删除确认是 pip http 缓存的目录，
    防止误删用户文件）；
  - 把 `opencv-python` / `opencv-contrib-python` / `opencv-python-headless` 钉到 `4.11.0.86`
    （与本机已装版本一致，兼容 `numpy==1.26.4`），首次下载由约 990 MiB 降到约 360 MiB；
  - 版本自检改用单引号字符串，恢复「已安装 → 跳过 pip」的幂等行为；
  - 安装完成时打印 `bin\ocr\.tools` 实际体积。
- **结果**：首次下载约 360 MiB；装完 `bin\ocr\.tools\` 约 1.0 GiB，包根不再出现 `pip\`；
  旧机器重跑一次安装即可回收约 950 MiB（本机包目录 1,987.5 MiB → 1,037.9 MiB）。
  OCR 协议、端口、识别流程与全局名均未改动。
- **验证**：
  - 脚本经 Windows PowerShell 5.1 AST 解析通过（11 个函数）；`pip cache dir` 行为与
    `Remove-PipCacheIfSafe` 的「清理 pip 缓存 / 保留普通目录」行为用离线脚本验证通过。
  - 真机（本机 `D:\AlecaFrame-ZH`，v1.2.0 包，OCR 前置已装）：替换脚本后重跑
    `Install-OcrPrerequisites.ps1`，全部组件「已存在，跳过」，不再执行 pip，5 秒完成
    （日志 23:19:14→23:19:19），自动清理 `.tools\pip-cache` 并打印运行期体积 1,016 MiB。
  - 首次全量下载（约 360 MiB）仍需联网机器复验：本会话沙箱不允许外网连接，未执行全量安装。

### 修复：铸造厂切换分类整窗卡死（属性写回未判等导致 MutationObserver 死循环）

- **现象**：铸造厂页面点击「主武器/副武器/全部/…」等分类后整个界面卡死、加载圈一直转；英文原版正常，
  补丁版必现（与仲裁界面汉化无关，其他含同名属性的页面也可能触发）。
- **根因**：词典里有 `Ax-52 -> AX-52`（上游物品名规范化）。翻译链的小写兜底让
  `translate("AX-52")` 返回**与原文相同**的 `"AX-52"`；DOM 层 `translateAttrs` 只要译文非 `null`
  就 `setAttribute`，而**把属性设置成相同值同样会产生 MutationObserver 的 attribute 记录**，
  于是 `translateAttrs → setAttribute → observer → translateAttrs` 无限循环，占死渲染进程主线程。
  铸造厂 AX-52 卡片带 `title="AX-52"`，切换分类渲染出该卡片时触发。
- **修复**：`src/runtime/dom/index.js` 增加 `nextAttributeValue(value, translate)`：只有译文存在
  且与当前属性值不同才写回；`translateAttrs` 统一走该函数。文本节点原本已有同样的判等。
- **回归**：`tests/runtime.test.mjs` 新增 “attribute translation never rewrites an identical value”
  用例；无头 Chrome + 真实 foundry 模板/mainFoundry.js/tippy 复现脚本：旧 bundle 注入 AX-52 后
  HANG >45s，修复后 0.9s 完成 12 次分类切换；本机真实 AlecaFrame（Overwolf 0.314.1.1 /
  AlecaFrame 3.0.6）诊断构建确认死循环调用栈为 `translateAttrs → MutationObserver`，
  修复后连续切换 主武器/副武器/全部/战甲 不卡死、渲染进程 CPU 空闲。

### 仲裁界面汉化补全（实时仲裁窗口 + 主窗口记录/日程）

- **实时仲裁窗口纳入注入**：`pages.json` 的 `arbitrationLive` 由「不注入」改为注入 `translate`，
  `arbitrationLive.html` 与主窗口仲裁记录共用同一词典/规则链；合成注入测试覆盖该页
  （注入标签、幂等、bundle 页面注册）。
- **新增运行时模块 `dom.canvas-text`（T1）**：包装 Canvas 2D `fillText/strokeText/measureText`，
  把 Chart.js 图例、tooltip、坐标轴与自定义画布文字接入 `translate()`；`measureText` 使用译文测量，
  避免中文图例/tooltip 与布局错位；无 canvas 环境安全 no-op；附模块 README 与单元测试。
- **词典**：仲裁相关新增 104 条人工词条（实时窗口 + 主窗口运行记录/历史/导入导出/备注/日程提醒页），
  保持 2 列 TSV、精确匹配、查重。
- **规则**：新增 76 条动态/拼接文本规则（45→121），覆盖 Vue 合并文本节点
  （`Waves completed`、`, Defense`、`Defense, Nov 4, 2026, 09:14 PM, Perspective unknown`、
  `5:42 full capture`、`— / capture min`）、日期时间/倒计时、run-chart Canvas 提示
  （`Total interval: 2:30`、`Drone spawn rate: 6 spawns/min`）、生成地图 `100 game units` 等；
  未知值/未知标签保持英文，不半翻。
- **复合文本**：`core.composite` 支持「状态词 + 节点名, 星球」（如 `Recording Lares, Mercury`
  → `录制中 Lares，水星`），节点名保持英文。
- **启动器快照升级路径**：注入清单新增页面后，旧 `state/official` 快照缺页时 `Restore` 会用当前
  官方原版补齐；无 opk 缓存且当前文件已注入时精确剥离注入标签兜底，并在还原后回写快照；
  `tools/test-inject.ps1` 增加合成注入/还原用例。
- **兼容性快照**：按本机实际更新为 AlecaFrame `3.0.6` / Overwolf `0.314.1.1`
  （原 `0.311.1.6` 已过期）。

### 源力石页面汉化修复

修复源力石页面（效果指南/详情/卡片摘要/融合配方/槽位提示）汉化不完整。

#### 修复

- **v-html 效果单元格整段匹配失败**：伤害图标前后的正文已包含图标英文名，旧逻辑无条件把
  `<img alt>` 再拼进整段，得到 `Toxin Toxin …`，所有单元格都查不到精确词条。改为
  `src/runtime/features/archon/text.js` 统一重建文本：只在正文缺词时补 alt。
- **写回译文时保留行内伤害图标**：按译文里的元素名（Toxin→毒素、Blast→爆炸…）把原 `<img>`
  锚回译文；锚点缺失时图标保留在原位，不丢弃。
- **战甲卡片效果摘要只翻了数字**：`3x Primary status chance` 被 `generic.multiplied-item`
  译成 `3 个 Primary status chance`；规则改为翻译效果名，未知名称保持英文不半翻。
- 补齐源力石动态规则：槽位提示「源力石名, 效果名」、`Empty slot N`、`N Stela`、
  复制战甲的 `Copy N, …` 前缀。

#### 验证

- `python tools\build.py`、`tools\check_contracts.py`、`tools\golden.py verify`、
  `dict.py check --strict`、Node/Python 测试通过；无头浏览器合成注入验证 27 行效果单元格全部中文、
  20 个行内图标保留。真机（Overwolf + AlecaFrame 3.0.6）待开发者按
  `docs/verification/REAL_MACHINE.md` 复验。
- 仲裁界面：构建/契约/golden/词典 strict/Node+Python 测试全过；`tools/test-inject.ps1`
  合成注入与还原场景全过（注入页面含 `arbitrationLive.html`）；无头浏览器（真实构建 bundle）
  验证合并文本节点 + Canvas 图例/tooltip/地图刻度 10 行全部中文，`arbitrationLive.html`
  注入后静态头部为中文。真机待按 `docs/verification/REAL_MACHINE.md` 第 4 节复验。

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
