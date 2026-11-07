# dict/

词典目标目录规范。**`manifest.tsv` 是唯一加载清单**，加载器禁止 glob。

```text
dict/
  manifest.tsv          # order / path / kind / scope / schema / note
  generated/            # 脚本产物；禁止手改；带 SHA256SUMS
  upstream/             # 上游词库原样
  fixes.tsv             # 上游修正（5 列）
  entries/common/*.tsv  # 通用词条（2 列）
  entries/screens/*.tsv # 按功能屏分组（2 列）
  overrides.tsv         # 唯一允许改值（5 列）
  keep-english.tsv      # 不译白名单（3 列）
```

## 加词条

1. `python tools\dict.py lookup "<英文>"` 查是否已存在；
2. 在 `entries/common` 或 `entries/screens` 选目标文件（跨屏 → common；功能专属 → screens）；
3. 追加 `英文<TAB>中文`；确保与界面文本逐字符一致；
4. `python tools\dict.py check`（初始数据有大小写/no-CJK 告警；W1b 清理后再用 `--strict`）；
5. `python tools\build.py`；真机 `Refresh-Chinese.cmd` 截图。

## 改已有译文

只能写 `overrides.tsv`：

```text
英文<TAB>新译文<TAB>scope<TAB>理由（>=8 字）<TAB>来源
```

`source` 例如 `game:<文件>`、`screenshot:<相对路径>`、官方 wiki URL；禁止只写“官方/机翻”。

## 保持英文

写入 `keep-english.tsv`：

```text
英文<TAB>理由<TAB>证据
```

不要靠“不写这个词条”隐式保留。

## 格式

- 2 列：`英文<TAB>中文`；
- 5 列：`英文<TAB>中文<TAB>scope<TAB>reason<TAB>source`；
- 3 列：`英文<TAB>理由<TAB>证据`；
- UTF-8 无 BOM、LF；禁止行首尾空白、零宽字符、控制字符；
- 不要用 Excel 编辑 TSV。

## 详细指南

见 [docs/guides/dictionary.md](../docs/guides/dictionary.md)。manifest 规范见 [schemas/dict-manifest.spec.md](../schemas/dict-manifest.spec.md)。
