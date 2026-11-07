# dict/AGENTS.md — 词典模块约定

> 就近规则：在 `dict/` 下工作的 AI 先读根 [AGENTS.md](../AGENTS.md)，再读本文件。
> 状态：A 阶段。B 阶段会迁移到 `manifest.tsv` + `generated/` + `entries/` + `overrides.tsv`；迁移完成前，旧 `extra-*.tsv` 仍是唯一事实源。

## 1. 职责

- 存放英文 → 简体中文的精确匹配词条，以及遗物奖励索引数据。
- 不负责：翻译规则（在 `src/runtime/rules` / `src/engine.js`）、DOM 处理、搜索钩子、页面注入。

## 2. 必须读

1. 根 [AGENTS.md](../AGENTS.md)；
2. 本文件；
3. [docs/contributing/task-router.md](../docs/contributing/task-router.md) 的「词典」行；
4. [docs/词典来源.md](../docs/词典来源.md)（分层/覆盖现状）；
5. 目标词条文件头部；
6. B 阶段后：`dict/README.md`、`docs/guides/dictionary.md`、`dict/manifest.tsv`。

## 3. 硬规则

- **一个英文键只有一个权威译文**；同值重定义禁止；跨层改值只能进 `overrides.tsv`（B 阶段后），并写 `scope`、`reason`、`source`。
- 优先级由 `manifest.tsv` 显式定义，**禁止 glob 自动加载**；未登记文件 = 失败；`*.bak`/副本不允许存在。
- 普通词条只允许 2 列：`英文<TAB>中文`；fixes/overrides 允许 5 列：`英文<TAB>中文<TAB>scope<TAB>reason<TAB>source`。不要发明 3/4 列。
- `generated/` 是脚本产物，禁止手改；改生成逻辑去改 `src/build_items.py` / `src/import_mioeu.py` / `src/build_relic_rewards.py`。
- `relic-rewards.tsv` 是搜索索引数据，不是普通词典；不要把它混进 `__AFCN_DICT__`。
- `gap-candidates.tsv` / `build-unmatched.txt` 是报告，不是词条；B 阶段后移入 `build/reports/`。
- 不按页面拆分词条；按「变更域」分：common / screens / overrides / keep-english。
- 行内禁止 tab/换行之外的控制字符、首尾空白、零宽字符；文件 UTF-8 无 BOM、LF。
- 不要用 Excel 编辑 TSV。
- 动态模板、数字/日期句属于规则，不要硬编成词条（例如 `+150 Health` 这类会随数值变化）。
- 保持英文的决定写进 `keep-english.tsv`（B 阶段后），不要靠“不写这个词条”默认保留。

## 4. 当前（A 阶段）的特殊说明

- 现在仍是 `items.tsv`、`mioeu-terms.tsv`、`vendor/translations.zh-CN.json`、`fixes.tsv` 和现有 `extra-*.tsv` 分层；`extra` 数字升序覆盖（数量/编号以实际文件为准）。
- B 阶段会一次性迁移到新布局；迁移要求 0 行为变化，见 [docs/refactor/dict-migration-acceptance.md](../docs/refactor/dict-migration-acceptance.md)。
- 迁移前加词条按现行约定（优先加编号最大的 extra），但要在 PR 中说明这是过渡写法。

## 5. 验证

当前：

```powershell
python src\build.py
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1
```

B 阶段后：

```powershell
python tools\dict.py lookup "<英文>"
python tools\dict.py check --strict
python tools\dict.py report --conflicts
python tools\build.py
```

- 加词条后必须确认：没有被更高优先级静默覆盖、没有改到别的语境、build 后 `merged` 数正确。
- 真机：`Refresh-Chinese.cmd`，到受影响界面截图；T0 不需要完整 Start/Restore。

## 6. 不要做

- 不要手改 `bin/alecaframe-zh-cn.js` 或 `bin/ocr/afzh-items.js`。
- 不要在 `dict/` 里写 engine/search 代码。
- 不要把词条按页面建文件夹。
- 不要为了“让词条生效”而添加宽泛规则（规则属于 runtime，且有测试要求）。
- 不要提交 `build-unmatched.txt`、`build/reports/`、`gap-candidates` 报告。
