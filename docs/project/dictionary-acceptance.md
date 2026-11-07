# 词典构建验收与 golden 基准设计

> 目的：保证新词典架构的构建结果**可复现、可审查、可回归**；以 golden 基准检查构建结果，不比较其他布局。
> 实现文件：`tools/dict_verify.py`、`tests/dict_equivalence.test.mjs`、`tests/golden/`。

## 1. 范围

### 必须保证

- 词典源数据只通过 `dict/manifest.tsv` 加载；未登记文件/重复 order 失败；
- 合并结果确定：同一输入两次构建的 merged map 逐键相等；
- golden 基准：已批准的词典输出（raw、engine 可见、lowerMap、抽样语料）可被重放比较；
- 引擎 `translateValue()` 对全部键 + 固定语料输出符合 golden；
- 搜索测试、词典 schema、冲突/覆盖报告通过；
- 生成物/报告不进入仓库；构建不依赖网络/本机游戏数据。

### 非目标

- 不验证译文的文学质量（由词典 reviewer/人工负责）；
- 不验证 DOM 运行时行为（由真机/集成测试负责）；
- 不要求 bundle 字节固定（允许注释/模块顺序变化，但词典与行为要可比较）。

## 2. 数据模型

### 2.1 词典源

```text
dict/
  manifest.tsv          # order / path / kind / scope / schema / note
  generated/            # 脚本产物，禁止手改；带 SHA256SUMS
  upstream/             # 上游词库原样
  fixes.tsv             # 上游修正（5 列）
  entries/common/*.tsv  # 人工通用词条（2 列）
  entries/screens/*.tsv # 人工按功能屏分组（2 列）
  overrides.tsv         # 唯一允许改值（5 列）
  keep-english.tsv      # 不译白名单（3 列）
```

规则：

- 普通词条 2 列；fixes/overrides 5 列（en/zh/scope/reason/source）；keep-english 3 列（en/reason/evidence）。
- 同一英文键只有一个权威译文；同值重定义禁止；跨层改值只能进 overrides。
- `generated/` 由脚本生成；`relic-rewards` 是索引数据，不进 `__AFCN_DICT__`。
- 报告（unmatched/coverage/conflicts）写 `build/reports/`，不提交。

### 2.2 比较视图

| 视图 | 定义 |
|---|---|
| `raw` | 按 manifest order 合并后的 `Map<english, chinese>` |
| `normalized` | key 经 `norm`（空白折叠 + trim）后的 first-wins map，复刻 engine 行为 |
| `lower` | 纯拉丁 key 的 `lowerMap` first-wins map，复刻 engine 行为 |
| `engine` | `translateValue()` 对键集合 + golden 语料的输出 |

## 3. CLI 设计

```text
python tools/dict_verify.py snapshot --repo <repo> --out build/golden/dictionary.json
python tools/dict_verify.py verify   --repo <repo> --golden build/golden/dictionary.json [--json-out build/reports/dict-verify.json]
python tools/dict_verify.py compare  --old <golden.json> --new <candidate.json> [--json-out build/reports/dict-diff.json]
```

### `snapshot`

- 从当前构建结果生成 golden 文件（获批后提交到 `tests/golden/`，不含本机路径/时间戳）；
- 内容：raw/normalized/lower/engine 抽样、层计数、schema 版本、数据 hash。

### `verify`

- 读当前 manifest/源数据，重建 raw/normalized/lower；
- 与 golden 比较；调用 Node 引擎对比 `translateValue()`；
- 检查 schema/重复键/覆盖/keep-english/生成物 hash；
- 输出报告并返回退出码。

### `compare`

- 对“有意的词典变更”输出完整差异：新增、删除、改值、大小写、归一冲突；
- 每条差异必须能对应到 PR 中的理由/来源。

### 退出码

| 码 | 含义 |
|---|---|
| 0 | 通过（或只存在显式允许的差异） |
| 1 | 存在未允许差异 |
| 2 | 输入/配置错误（manifest 缺失、schema 不符、文件不存在） |

## 4. 报告格式（`build/reports/dict-verify.json`）

```json
{
  "schema": 1,
  "mode": "verify",
  "golden": {"version": "1.2.0", "sha256": {"raw": "...", "normalized": "...", "engine": "..."}},
  "current": {"manifest": "dict/manifest.tsv", "sha256": {"raw": "...", "normalized": "...", "engine": "..."}},
  "counts": {"raw": 0, "normalized": 0, "lower": 0},
  "diff": {
    "raw_missing": [], "raw_extra": [], "raw_value_changed": [],
    "normalized_missing": [], "normalized_value_changed": [],
    "lower_missing": [], "lower_value_changed": []
  },
  "engine": {"checked": 0, "mismatches": 0, "first_mismatch": null},
  "schema_check": "pass",
  "search_tests": "pass",
  "result": "pass"
}
```

> 示例中的 `0` 是占位；真实计数由脚本输出决定，不写死。

## 5. 验收标准

1. `dict/manifest.tsv` 完整；未登记文件/重复 order 失败；
2. schema/列数/重复键/大小写/归一同键/零宽字符/排序检查通过；
3. 同一输入两次构建的 `raw` 逐键相等；
4. `raw`/`normalized`/`lower`/`engine` 与 golden 一致（或差异有显式批准记录）；
5. `tools/dict.py check --strict` 通过；
6. 现有 search 测试全过（数量以测试文件为准）；
7. 构建产物含 `__AFCN_DICT__` / `__ALECAFRAME_ZH_CN_ITEMS__`；
8. 真机 `Refresh` 后 `entries=` 与 golden 记录一致（归一差异需说明）；
9. 5 屏抽查通过。

## 6. 有意的词典变更

- 语义修正/新增词条单独 PR，不和数据布局变更混在一起；
- 必须用 `compare` 输出完整差异；
- 每条差异有原因/来源/scope；
- golden 更新在 PR 中可见，reviewer 逐条核对；
- 受影响页面有 REAL 证据（或明确未验证）。

## 7. 实施顺序

1. 实现 manifest 解析与 `snapshot`，生成第一版 golden；
2. 实现 `verify` + Node 引擎对比；
3. 接入 `tools/build.py` 与 CI；
4. 实现 `tools/dict.py check/report`；
5. 实现 `compare`（供词典变更 PR）；
6. 补 `tests/golden/` 语料（Cold/Range/引号/空格/大小写/数字模板等高风险键）。

## 8. 易错点

- 比较前不要 normalize raw；raw 必须逐键相等。
- `norm` 仅空白折叠 + trim；不要额外 Unicode NFC/大小写折叠，否则会掩盖差异。
- 统一 UTF-8 读取；不要依赖 JSON 键顺序。
- 大 map 比较用排序元组或哈希；差异输出要可定位。
- `build/reports/`、`build/golden/` 的写路径不能混入本机绝对路径/时间戳到提交文件。
- 没有安装游戏数据时，构建不能依赖 cachedData；生成物由脚本提供。
