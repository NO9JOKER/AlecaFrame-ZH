# ADR 0001：能力优先的运行时架构与页面矩阵

- 状态：Proposed（随 `refactor/architecture` 合入 main 后生效）
- 日期：2026-11-08
- 决策者：项目维护者
- 相关：`docs/decisions/0002-contribution-and-review-model.md`、`docs/refactor/v1.2.0-report.md`、`docs/refactor/dict-migration-acceptance.md`

## 背景

AlecaFrame-ZH 是一个运行时注入补丁：启动器绕过 Overwolf 扩展校验，把**一个** JS bundle 注入 10 个页面；bundle 里约 95% 是词典数据，只有约 5% 是翻译/搜索代码。当前实际状态：

- 官方 manifest 有 14 个窗口，launcher 只注入 10 个；4 个窗口未覆盖。
- 10 个注入页面中，5 个没有任何页面专属代码；`search` 的 602/1,138 行只服务 `main` 和 `background`；另外 7 个页面用不到 search。
- `main.html` 不是单一功能页，内部有十几个功能屏（库存、铸造、市场、裂罅、源石、统计、仲裁、资源等）。
- 词典 25,310 键，按内容只有约 224 条（裂罅/WFM/源石）是功能专属；其余 25,086 条是全局物品/UI 名。extra-8 的 1,113 条中 78.3% 在任何 HTML 里都不出现。
- OCR 是独立可选子系统，约 6,100 行，天然按页面注入（9 个脚本 → 5 个页面）。

曾讨论过“按 AlecaFrame 各页面建主/子文件夹”的目录方案。该方案在 OCR 子系统和少量 DOM 适配器上成立，但作为整个项目的主结构会误导：

1. 注入单元是一个 bundle，不是多个页面包；页面文件夹会暗示不存在的隔离，AI 可能误判改动爆炸半径。
2. 页面 ≠ 功能；main 一个页面装十几个屏，页面轴下还要再长功能轴。
3. 5/10 页面零专属代码，4/14 窗口未覆盖，按页面会制造空目录和结构性噪音。
4. 页面名是上游资产，随 AlecaFrame/Overwolf 版本变化；能力轴更稳定。
5. 词典和优先级是全局的，页面文件夹对运行时零影响；78% 的 extra-8 词条没有 HTML 锚点。
6. 页面名当前散落在至少 14 个文件里，按页面建目录只会增加同步点。

## 决策

采用**能力优先 + 页面矩阵 + 数据/代码分离 + OCR 独立边界**的架构。

### 1. 代码按能力/变更域分模块

```text
src/
  runtime/                 # 构建时拼成一个 bundle
    modules.json           # 装配顺序/依赖/风险，唯一装配事实源
    core/                  # 纯函数：normalize、dict-index、translate
    rules/                 # 规则按域拆（shard/riven/stats/market/generic…），每条可测
    dom/                   # walk/attrs/observer/context
    features/              # search/、archon/、relic-rewards/
    adapters/              # 唯一允许出现页面名的代码层
    entry.js
  launcher/                # PowerShell 模块：Snapshot/Patch/Overwolf/Ocr/Cli
  ocr/                     # OCR 边界：manifest/page-scripts/server/worker（逻辑本轮不重写）
```

依赖方向只允许：`core → rules/dom/features → adapters/entry`；`dict(data) → build → bundle`；launcher/tools/tests 可以读所有层，但不能被运行时依赖。

### 2. 页面作为注册表 + 文档矩阵，不作为代码主目录

- 新增 `pages.json`：页面 id、文件、是否注入、窗口类型（main/background/overlay）、需要的 features、适配器、OCR 映射、验证版本、未覆盖理由。**页面名只允许出现在这里。**
- 生成 `docs/PAGE_MATRIX.md`：页面 → 注入 → 适配器 → OCR → 词典覆盖 → 回归项。
- 代码里的页面差异只放在 `src/runtime/adapters/`，且只在真正需要 DOM 特判时创建；大多数页面没有适配器。
- OCR 是唯一可以按页面建源码目录的子系统：`src/ocr/page-scripts/<page>/`。

### 3. 单 bundle 不变

- 仍是一个 `assets/js/alecaframe-zh-cn.js`，一个 `<script>` 标签，10 个页面共用。
- 不拆按页面加载的多 bundle，不新增第二条注入契约。
- 模块化是源码组织与测试边界；产物仍是单文件。`modules.json` 控制拼接顺序与依赖合法性。

### 4. 词典是一等公民

- 词典按「变更域」分文件，不按页面：`generated/`、`upstream/`、`fixes.tsv`、`entries/common`、`entries/screens`、`overrides.tsv`、`keep-english.tsv`。
- 优先级由 `dict/manifest.tsv` 显式决定，禁止 glob 自动加载；未登记文件直接失败。
- 同一英文键只有一个权威译文；任何跨层改值只能进 `overrides.tsv`，必须写 scope/reason/source。
- 结构迁移必须做行为等价验收；语义修正（含 Cold/Range 的 scope）单独提交，不能混在搬家里。详见 `docs/refactor/dict-migration-acceptance.md`。

### 5. 文档分层，可推导事实由脚本生成

- 根 `AGENTS.md` 是 AI 入口；`docs/contributing/` 是贡献者入口；`docs/review/` 是维护者复核入口。
- 每个模块一篇 README（固定标题），每个文件头写 `AFZH:FILE ...` 契约；每个页面卡一张。
- `MODULE_MAP.md`、`PAGE_MATRIX.md`、`DICT_REPORT.md` 由脚本生成，`--check` 防漂移。
- 可推导的事实（行数、条数、页面清单、钩子表）不再写进散文；旧 771 行架构文档归档到 `docs/reference/`。

### 6. 迁移顺序

1. A：流程/文档/基线（本阶段）。
2. B：词典结构迁移，行为 0 变化。
3. C：词典语义修正（keep-english、死条目、数字词条→规则、Cold/Range scope）。
4. D：运行时测试 + 模块拆分。
5. E：launcher 模块化 + `pages.json` + OCR 搬家。
6. F：生成索引、归档旧文档、v1.2.0。

## 不变量

- 注入入口路径、脚本标签、单 bundle 契约不变。
- 下列全局名不改：`__AFCN__`、`__AFCN_DICT__`、`__AFCN_RELIC_REWARDS__`、`__AFCN_TRANSLATE__`、`__AFZH_SEARCH__`、`__AFZH_SEARCH_API__`、`__AFZH_SEARCH_TEST__`、`__ALECAFRAME_ZH_CN_ITEMS__`，以及 `docs/OCR集成说明.md` 列出的 OCR 全局名。
- 运行时不得联网/读文件/写 secrets；翻译精确匹配；规则全串锚定且有防循环守卫。
- PowerShell 5.1 + UTF-8 BOM；快照/还原幂等；官方签名/DLL 不改。
- 页面名只在 `pages.json`；OCR 端口/协议/官方补丁点不改。

## 考虑过的替代方案

| 方案 | 不采纳原因 |
|---|---|
| 按页面建主/子目录 | 页面≠功能；5/10 页面无专属代码；词典全局；页面名上游漂移；与单 bundle 装配不符 |
| 按页面拆多个 bundle | 改注入契约；共享词典重复加载；收益只有隔离 |
| 重写为 TypeScript/引入 bundler | 增加工具链和用户端构建成本；单 bundle 拼接已够用；当前瓶颈不是语言 |
| 词典改为 JSON/数据库 | 丢失逐行 diff 和人类可编辑性；当前 TSV 是资产 |
| 一次性大爆炸重写 | 无法证明行为等价；出问题无法 bisect |

## 后果

正面：模块边界与单 bundle 一致；页面信息集中；词典可审；文档可生成；OCR 有独立演进空间；AI 可按任务只读少量文件。

负面：需要一次性完成大量迁移；`modules.json`/`pages.json` 若没有真正驱动全部消费方，会变成新的同步点；launcher 拆分和 OCR 搬家的真机验证成本最高。

缓解：按 A–F 阶段提交；每阶段行为等价/显式 diff；生成索引 + CI 检查；OCR 只做机械搬家；launcher 最后做并保留回滚点。

## 参考

- `docs/refactor/v1.2.0-report.md`
- `docs/refactor/dict-migration-acceptance.md`
- `docs/decisions/0002-contribution-and-review-model.md`
- `docs/项目架构与实现说明.md`（历史参考，逐步归档）
