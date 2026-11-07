# dict/manifest.tsv 规范

`dict/manifest.tsv` 是词典加载顺序的唯一事实源；加载器禁止 glob。

## 列

| 列 | 必填 | 说明 |
|---|---|---|
| `order` | 是 | 非负整数，升序加载；越小优先级越低；禁止重复 |
| `path` | 是 | 相对仓库根目录的 TSV/JSON 路径；禁止绝对路径/`..` |
| `kind` | 是 | `generated` / `upstream` / `manual` / `override` / `policy` / `index` |
| `scope` | 是 | `global` / `shared` / `screen:<id>` / `-` |
| `schema` | 是 | `2` / `3` / `5` 列格式；见下 |
| `note` | 否 | 人类可读说明；不得写本机路径/时间戳 |

## 文件格式

- `generated`：脚本产物，禁止手改；文件头标记 `generated`；带 `SHA256SUMS`。
- `upstream`：上游词库原样；只整体更新。
- `manual`：2 列 `英文<TAB>中文`。
- `override`：5 列 `英文<TAB>中文<TAB>scope<TAB>reason<TAB>source`；唯一允许改值。
- `policy`：3 列 `英文<TAB>理由<TAB>证据`；保持英文的白名单。
- `index`：不进 `__AFCN_DICT__` 的索引数据（如遗物奖励）；格式由消费方定义并在 note 说明。

## 约束

- 同一 `order` 出现两次 → 失败；
- manifest 中未登记的文件存在 → `check` 报错；
- 同一英文键跨层出现且值不同 → 必须进 `override`，否则失败；
- 同值重定义 → 失败；
- `path` 必须存在（`generated` 由构建生成时可在 `--allow-missing-generated` 下跳过）；
- 生成物与手写文件不得混在同一文件；
- 行内禁止 tab/换行之外的控制字符、首尾空白、零宽字符；文件 UTF-8 无 BOM、LF。
