# ADR 0001：能力优先的运行时架构与页面矩阵

- 状态：Proposed（随首次架构实现合入 main 后生效）
- 日期：2026-11-08
- 决策者：项目维护者
- 相关：`docs/decisions/0002-contribution-and-review-model.md`、`docs/project/v1.2.0-plan.md`、`docs/project/dictionary-acceptance.md`

## 背景

AlecaFrame-ZH 是一个运行时注入补丁：启动器绕过 Overwolf 扩展校验，把**一个** JS bundle 注入需要汉化的页面；bundle 绝大部分是词典数据，只有少量翻译/搜索代码。项目按“能力 + 数据 + 页面适配”来设计，而不是按 AlecaFrame 的 HTML 页面来分割。

页面不适合做主结构的原因：

- 一个 bundle 注入多个页面，页面目录会暗示不存在的隔离；页面数量、官方窗口数、未覆盖关系会随宿主版本变化。
- 注入页面中多数没有页面专属代码；`search` 的相当一部分逻辑只服务主窗口和后台窗口，其他页面用不到。
- `main.html` 不是单一功能页，内部有多个功能屏（库存、铸造、市场、裂罅、源石、统计、仲裁、资源等）。
- 词典绝大多数是全局物品/UI 名，只有少量功能专属条目；大量词条没有 HTML 锚点，按页面切分没有运行时意义。
- OCR 是独立可选子系统，天然按页面注入；它的页面归属真实，可以单独按页面组织。

## 决策

采用**能力优先 + 页面矩阵 + 数据/代码分离 + OCR 独立边界**的架构。

### 1. 代码按能力/变更域分模块

```text
src/
  runtime/                 # 构建时拼成一个 bundle
    modules.json           # 装配顺序/依赖/风险，唯一装配事实源
    core/                  # 纯函数：normalize、dict-index、translate
    rules/                 # 规则按域拆，每条可测
    dom/                   # walk/attrs/observer/context
    features/              # search/、archon/、relic-rewards/
    adapters/              # 唯一允许出现页面名的代码层
    entry.js
  launcher/                # PowerShell 模块：Snapshot/Patch/Overwolf/Ocr/Cli
  ocr/                     # OCR 边界：manifest/page-scripts/server/worker
```

依赖方向（禁止反向依赖）：

- `core` 不依赖任何上层；
- `rules`、`dom`、`features` 只能依赖 `core`，features 内部可按需依赖 rules/dom；
- `adapters`、`entry` 可以依赖 core/rules/dom/features，不得被它们反向依赖；
- `dict` 数据只通过 build 进入 bundle，运行时不得直接读词典文件；
- `launcher`/`tools`/`tests` 可以读所有层，但不能被运行时依赖。

### 2. 页面作为注册表 + 文档矩阵，不作为代码主目录

- `pages.json`：页面 id、文件、是否注入、窗口类型（main/background/overlay）、需要的 features、适配器、OCR 映射、验证版本、未覆盖理由。**页面名只允许出现在这里和 `adapters/`。**
- 生成 `docs/PAGE_MATRIX.md`：页面 → 注入 → 适配器 → OCR → 词典覆盖 → 回归项。
- 代码里的页面差异只放在 `src/runtime/adapters/`，且只在真正需要 DOM 特判时创建；多数页面没有适配器。
- OCR 是唯一可以按页面建源码目录的子系统：`src/ocr/page-scripts/<page>/`。

### 3. 单 bundle 不变

- 仍是一个 `assets/js/alecaframe-zh-cn.js`，一个 `<script>` 标签，所有注入页面共用。
- 不拆按页面加载的多 bundle，不新增第二条注入契约。
- 模块化是源码组织与测试边界；产物仍是单文件。`modules.json` 控制拼接顺序与依赖合法性。

### 4. 词典是一等公民

- 词典按「变更域」分文件，不按页面：`manifest.tsv`、`generated/`、`upstream/`、`fixes.tsv`、`entries/common`、`entries/screens`、`overrides.tsv`、`keep-english.tsv`。
- 优先级由 `dict/manifest.tsv` 显式决定，禁止 glob 自动加载；未登记文件直接失败。
- 同一英文键只有一个权威译文；任何跨层改值只能进 `overrides.tsv`，必须写 scope/reason/source。
- 词典构建验收见 `docs/project/dictionary-acceptance.md`；语义修正单独提交，不和数据结构变更混合。

### 5. 文档分层，可推导事实由脚本生成

- 根 `AGENTS.md` 是 AI 入口；`docs/contributing/` 是贡献者入口；`docs/review/` 是维护者复核入口。
- 每个模块一篇 README（固定标题），每个文件头写 `AFZH:FILE ...` 契约；每个页面卡一张。
- `MODULE_MAP.md`、`PAGE_MATRIX.md`、`DICT_REPORT.md` 由脚本生成，`--check` 防漂移。
- 可推导的事实（行数、条数、页面清单、钩子表）不写进散文。

## 不变量

- 注入入口路径、脚本标签、单 bundle 契约不变。
- 下列全局名不改：`__AFCN__`、`__AFCN_DICT__`、`__AFCN_RELIC_REWARDS__`、`__AFCN_TRANSLATE__`、`__AFZH_SEARCH__`、`__AFZH_SEARCH_API__`、`__AFZH_SEARCH_TEST__`、`__ALECAFRAME_ZH_CN_ITEMS__`，以及 `src/ocr/CONTRACT.md` 列出的 OCR 全局名。
- 运行时不得联网/读文件/写 secrets；翻译精确匹配；规则全串锚定且有防循环守卫。
- PowerShell 5.1 + UTF-8 BOM；快照/还原幂等；官方签名/DLL 不改。
- 页面名只在 `pages.json`；OCR 端口/协议/官方补丁点不改。

## 考虑过的替代方案

| 方案 | 不采纳原因 |
|---|---|
| 按页面建主/子目录 | 页面≠功能；多数页面无专属代码；词典全局；页面名随宿主变化；与单 bundle 装配不符 |
| 按页面拆多个 bundle | 改注入契约；共享词典重复加载；收益只有隔离 |
| 重写为 TypeScript/引入 bundler | 增加工具链和用户端构建成本；单 bundle 拼接已够用；当前瓶颈不是语言 |
| 词典改为 JSON/数据库 | 丢失逐行 diff 和人类可编辑性；当前 TSV 是资产 |
| 一次性重写全部模块 | 无法证明行为等价；出问题无法定位；应按工作流分模块落地 |

## 后果

正面：模块边界与单 bundle 一致；页面信息集中；词典可审；文档可生成；OCR 有独立演进空间；AI 可按任务只读少量文件。

负面：首次实现需要同时建立模块、数据、文档和门禁；`modules.json`/`pages.json` 若没有真正驱动全部消费方，会变成新的同步点；launcher 和 OCR 的真机验证成本最高。

缓解：按 `docs/project/v1.2.0-plan.md` 的工作流实现；每步行为等价/显式 diff；生成索引 + CI 检查；OCR 只建立边界；launcher 最后做并保留回滚点。

## 参考

- `docs/project/v1.2.0-plan.md`
- `docs/project/dictionary-acceptance.md`
- `docs/decisions/0002-contribution-and-review-model.md`
