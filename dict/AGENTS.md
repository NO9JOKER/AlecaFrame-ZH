# dict/AGENTS.md — 词典模块约定

> 就近规则：在 `dict/` 下工作的 AI 先读根 [AGENTS.md](../AGENTS.md)，再读本文件。
> 本目录按新架构实现；以 `dict/manifest.tsv` 为唯一加载清单。当前词典工具已可运行；初始数据存在大小写/no-CJK 告警，W1b 清理后再启用 `--strict`。

## 1. 职责

- 存放英文 → 简体中文的精确匹配词条、人工覆盖/白名单，以及遗物奖励索引数据。
- 不负责：翻译规则（`src/runtime/rules`）、DOM 处理、搜索钩子、页面注入。

## 2. 必须读

1. 根 [AGENTS.md](../AGENTS.md)；
2. 本文件；
3. [docs/contributing/task-router.md](../docs/contributing/task-router.md) 的「词典」行；
4. `dict/manifest.tsv` 的目标文件行；
5. 目标词条文件头部；
6. `docs/guides/dictionary.md`。

## 3. 硬规则

- **一个英文键只有一个权威译文**；同值重定义禁止；跨层改值只能进 `overrides.tsv`，并写 `scope`、`reason`、`source`。
- 优先级由 `manifest.tsv` 显式定义，**禁止 glob 自动加载**；未登记文件不应存在，强制检查在 W1b 启用；`*.bak`/副本不允许存在。
- 普通词条只允许 2 列：`英文<TAB>中文`；fixes/overrides 允许 5 列：`英文<TAB>中文<TAB>scope<TAB>reason<TAB>source`。不要发明 3/4 列。
- `generated/` 是脚本产物，禁止手改；改生成逻辑去改生成脚本。
- `relic-rewards` 是搜索索引数据，不是普通词典；不要把它混进 `__AFCN_DICT__`。
- 报告（unmatched/coverage/conflicts）归 `build/reports/`，不是词条。
- 不按页面拆分词条；按「变更域」分：common / screens / overrides / keep-english。
- 行内禁止 tab/换行之外的控制字符、首尾空白、零宽字符；文件 UTF-8 无 BOM、LF。
- 不要用 Excel 编辑 TSV。
- 动态模板、数字/日期句属于规则，不要硬编成词条（例如 `+150 Health` 这类会随数值变化）。
- 保持英文的决定写进 `keep-english.tsv`，不要靠“不写这个词条”默认保留。

## 4. 目录规范

```text
dict/
  manifest.tsv          # 唯一加载清单：order / path / kind / scope / schema / note
  generated/            # 脚本产物，禁止手改；SHA256SUMS
  upstream/             # 上游词库原样
  fixes.tsv             # 上游修正（5 列）
  entries/common/*.tsv  # 通用词条（2 列）
  entries/screens/*.tsv # 按功能屏分组（2 列）
  overrides.tsv         # 唯一允许改值（5 列）
  keep-english.tsv      # 不译白名单（3 列）
```

## 5. 验证

```powershell
python tools\dict.py lookup "<英文>"
python tools\dict.py check
python tools\dict.py report
python tools\build.py
```

- 加词条后必须确认：没有被更高优先级静默覆盖、没有改到别的语境、build 后 merged 数正确。
- 真机：`Refresh-Chinese.cmd`，到受影响界面截图；T0 不需要完整 Start/Restore。
- 构建验收见 [docs/project/dictionary-acceptance.md](../docs/project/dictionary-acceptance.md)。

## 6. 不要做

- 不要手改 `bin/alecaframe-zh-cn.js` 或 `bin/ocr/afzh-items.js`。
- 不要在 `dict/` 里写 engine/search 代码。
- 不要把词条按页面建文件夹。
- 不要为了“让词条生效”而添加宽泛规则（规则属于 runtime，且有测试要求）。
- 不要提交生成物、报告或本机路径。
