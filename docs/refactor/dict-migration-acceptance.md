# 词典结构迁移验收脚本设计

> 状态：A 阶段设计稿，B 阶段实现。
> 目的：证明“词典从旧 `extra-*.tsv` 布局搬到新 `dict/` 布局”**没有改变任何行为**。
> 本文件只定义接口与算法；脚本 `tools/dict_verify.py`、`tests/dict_equivalence.test.mjs` 在 B 阶段创建。

## 1. 范围

### 必须证明等价

- 原始合并映射：`Map<english, chinese>` 键集合与值完全一致；
- 引擎可见映射：`norm` 空白折叠后的 first-wins map；
- 引擎的纯拉丁小写索引 `lowerMap` 的键集合与值一致；
- `translateValue()` 对全部键 + 固定语料的输出一致；
- 现有 search 测试全过（数量以测试文件/输出为准）、`scan_missing` 的 known 集合（或显式允许的差异清单）一致；
- 构建产物仍包含必需标记，生成路径不变。

### 不要求

- 文件路径/行号/层归属不变（这正是迁移要改的）；
- 层内顺序不变（只要最终值一致）；
- 生成物文件内容逐字节相同（JSON 键顺序可变，但必须解析后相等）；
- 本轮不修语义问题（Cold/Range、死条目、数字词条等属于 C 阶段）。

## 2. 两层模型

### 2.1 数据层（Python）

基线加载逻辑必须**复刻当前 `src/build.py`**：

```text
items.tsv -> mioeu-terms.tsv -> upstream/translations.zh-CN.json
-> fixes.tsv -> extra-*.tsv（数字升序）-> merged.update()
```

新布局加载逻辑：只读 `dict/manifest.tsv` 的 `order` 升序；未登记文件报错；不 glob。

比较项：

| 视图 | 定义 |
|---|---|
| `raw` | 按加载顺序 `dict[k] = v` 的最终 map |
| `normalized` | key 经 `norm`（`\s+ -> " "`, trim）后的 first-wins map；复刻 engine 行为 |
| `lower` | 纯拉丁 key 的 `lowerMap` first-wins map；复刻 engine 行为 |
| `counts` | 总键数、各层键数、重复键数、改值数、同值覆盖数 |

### 2.2 引擎层（Node）

把旧/新两个 `raw` map 分别注入 `window.__AFCN_DICT__`，在 VM 中加载当前 `src/engine.js`，调用 `window.__AFCN_TRANSLATE__`：

- 对**两边键的并集**逐键调用，比较输出；
- 对固定语料（`tests/golden/translation-corpus.json`，B 阶段创建）逐条比较；
- 记录第一处差异（输入、旧输出、新输出），后续差异最多打印 N 条；
- 任一差异 → 退出码 1。

VM 桩（与现有测试思路一致）：

```js
const sandbox = {
  window: {},
  document: { readyState: "loading", addEventListener() {}, body: null, documentElement: null },
  MutationObserver: function () { this.observe = function () {}; },
  NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
  console,
  setTimeout() {},
  requestAnimationFrame() {},
};
```

`engine.js` 在 `DOMContentLoaded` 时才 `start()`；桩的 `addEventListener` 不执行回调，因此只初始化索引与 `__AFCN_TRANSLATE__`，不碰 DOM。

### 2.3 搜索层

- `tests/search.test.mjs` 继续跑（数量以测试文件为准）；
- B 阶段额外加一个轻量对照：用旧/新 dict 分别构建 `search` 的反向索引，抽样 200 个中文查询，比较 `englishForChinese` 输出；
- 不要求合并后的 `search.js` 行为完全不变（结构迁移不应改 search 源码；若有改动，必须显式说明）。

## 3. CLI 设计

目标路径：`tools/dict_verify.py`（B 阶段实现，先只读写文件，不碰网络）。

```text
python tools/dict_verify.py snapshot --repo <repo> --out <baseline.json>
python tools/dict_verify.py verify   --repo <repo> --baseline <baseline.json> [--json-out <report.json>]
python tools/dict_verify.py compare-dicts --old <old.json> --new <new.json> [--json-out <report.json>]
```

### `snapshot`

- 在**迁移前**的干净 base commit 上运行；
- 按旧 `build.py` 逻辑加载，输出：

> 下面 JSON 里的 `18778` / `25310` / `25309` 只是示例值，不是验收期望；实际以脚本输出为准。

```json
{
  "schema": 1,
  "created_at": "...",
  "repo_commit": "...",
  "layers": [{"name": "items.tsv", "count": 18778}],
  "raw": {"english": "chinese"},
  "normalized": {"english_norm": "chinese"},
  "lower": {"english_lower": "chinese"},
  "counts": {"raw": 25310, "normalized": 25309, "lower": 0},
  "sha256": {"raw": "...", "normalized": "...", "lower": "..."}
}
```

- `raw` 可能较大（约 1 MB）；只写本地 `build/reports/`，不提交。

### `verify`

- 读新布局（manifest）→ 构造 `raw/normalized/lower`；
- 与 baseline 比较；
- 调用 Node 引擎对比（或输出中间文件交给 `tests/dict_equivalence.test.mjs`）；
- 输出报告并返回退出码。

### `compare-dicts`

- 只比较两个 `raw` JSON，供 C 阶段语义修正使用；
- 输出新增/删除/改值键的完整清单（分类：新增、删除、改值、大小写、归一冲突）。

### 退出码

| 码 | 含义 |
|---|---|
| 0 | 等价（或只存在显式允许的差异） |
| 1 | 存在差异 |
| 2 | 输入/配置错误（manifest 缺失、文件不存在、schema 不符） |

## 4. 报告格式（`build/reports/dict-verify.json`）

```json
{
  "schema": 1,
  "mode": "structural",
  "baseline": {"commit": "...", "sha256": {"raw": "..."}},
  "current": {"manifest": "dict/manifest.tsv", "sha256": {"raw": "..."}},
  "counts": {
    "old_raw": 25310, "new_raw": 25310,
    "old_normalized": 25309, "new_normalized": 25309,
    "old_lower": 0, "new_lower": 0
  },
  "diff": {
    "raw_missing": [], "raw_extra": [], "raw_value_changed": [],
    "normalized_missing": [], "normalized_value_changed": [],
    "lower_missing": [], "lower_value_changed": []
  },
  "engine": {
    "checked": 0, "mismatches": 0, "first_mismatch": null
  },
  "search_tests": "pass",
  "scan_missing_known": "same",
  "result": "pass"
}
```

> 以上 `counts` 是示例值；实际以 `snapshot`/`verify` 输出为准。

## 5. 验收标准

结构迁移 PR（B）必须全部满足：

1. `raw` 的键集合与值完全相等；
2. `normalized` 的键集合与值完全相等；
3. `lower` 的键集合与值完全相等；
4. `translate()` 对全部键 + 语料输出一致；
5. 现有 search 测试全过（数量以测试文件为准）；
6. `scan_missing` 的 known 集合一致，或差异逐条列出并说明（不可静默变）；
7. `python src/build.py` 成功；产物含 `__AFCN_DICT__` / `__ALECAFRAME_ZH_CN_ITEMS__`；
8. 构建两次，合并 dict 的 sha256 一致；
9. 真机 `Refresh` 后 `entries=` 与旧值一致（允许归一差异 1 条时需说明）；5 屏抽查。

语义修正 PR（C）允许差异，但必须：

- 用 `compare-dicts` 输出完整差异清单；
- 每条差异有原因/来源/预期；
- 更新 `tests/golden/translation-corpus.json`，diff 在 PR 中可见；
- 受影响页面有 REAL 证据；
- 不把“结构搬家”的 diff 混进语义 PR。

## 6. 边界与易错点

- **不要比较文件行号/顺序**；只比较映射与行为。
- **不要 normalize 后再比 raw**：raw 必须逐键相等；normalized/lower 是额外视图。
- `norm` 只用 `\s+ -> " "` + trim；不要额外做 Unicode NFC、大小写折叠（那会掩盖行为变化）。
- 旧 `build.py` 跳过 `#` 注释行；新 manifest 解析必须与之一致。
- 读取编码：统一 UTF-8；注意旧工具混用 `utf-8` / `utf-8-sig`，快照脚本要显式。
- 大 map 比较用排序后的元组或哈希；不要依赖 JSON 键顺序。
- 迁移前先证明工具能复现旧逻辑（`snapshot` → `verify` 对同一布局应 0 diff）。
- 生成物/报告写 `build/reports/`，不提交。
- 若 baseline 来自不同 commit，报告必须记录 commit 与 VERSION。

## 7. 实施顺序（B 阶段）

1. `build.py` 增加 `--dump-merged <json>`（不改默认行为）；
2. 实现 `snapshot`，对现有布局跑一次，冻结 baseline；
3. 实现 `verify` + Node 引擎对比 + 报告；
4. 新建 `dict/manifest.tsv`，先让 `build.py` 读 manifest，再 `verify` 证明 0 diff；
5. 移动/拆分文件，每步 `verify`；
6. 删除旧 extra；更新文档/AGENTS；
7. 把 `verify --baseline` 接入迁移 PR 的 CI（仅迁移 PR 需要 baseline；合并后保留 golden 语料测试）。

## 8. 非目标

- 不验证翻译“翻得对不对”（那是 C 阶段和人工审核）；
- 不验证运行时 DOM 翻译（真机负责）；
- 不保证新旧 bundle 字节相同（模块拆分后允许结构差异，但词典/行为必须等价）。
