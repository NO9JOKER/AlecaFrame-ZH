# 词典贡献指南

> 这个项目的词典是**精确匹配的英→中映射**：界面文本必须逐字符一致才生效。
> 先读 [AGENTS.md](../../AGENTS.md)、[dict/README.md](../../dict/README.md)；词典布局/优先级以 `dict/manifest.tsv` 为准。

## 1. 先判断你要改什么

| 情况 | 去向 |
|---|---|
| 界面上的普通静态英文 | `dict/entries/common` 或 `dict/entries/screens` |
| 游戏实体名（物品/部件/遗物等） | 由生成脚本产出的 `generated/`，不手改 |
| 上游机翻错误 | `dict/fixes.tsv`（5 列） |
| 已有译文要改 | `dict/overrides.tsv`（唯一允许改值） |
| 某个词应保持英文 | `dict/keep-english.tsv` |
| 数字/日期/数量模板 | 规则，不是词条（`src/runtime/rules`） |

## 2. 选文件

- 跨屏通用（按钮、表头、单位、通用提示）→ `entries/common/ui.tsv`；
- 错误/重试 → `entries/common/errors.tsv`；
- toast/更新日志/通知 → `entries/common/notifications.tsv`；
- 功能专属 → `entries/screens/<feature>.tsv`（库存/铸造/市场/裂罅/遗物/源石/统计/世界状态/新手导览等）；
- 不确定归属时先放 common，并在 PR 说明；不要按页面建目录。

## 3. 查重与加入

```powershell
python tools\dict.py lookup "No preferences set"
python tools\dict.py lookup "No preferences set" --json
```

- 已有同值：不需要再加；
- 已有不同值：不要直接改 lower 层，写 override；
- 新词条：追加到目标 TSV，`英文<TAB>中文`。

加完：

```powershell
python tools\dict.py check --strict
python tools\build.py
```

真机：`Refresh-Chinese.cmd`，到受影响界面截图；T0 不需要完整 Start/Restore。

## 4. 写对格式

- 英文必须与界面文本完全一致：大小写、标点、空格、弯引号 `’` vs 直引号 `'` 都算不同；
- 不要翻译纯数字/纯符号/URL/类名/代码串；
- 不要添加宽泛的短词（如单个 `To`），除非确认全局安全；
- 长句可以加，但只对该整串生效；文本被 `v-html`/图标拆开时，词条命中不了，需要规则或整段处理；
- 不要用 Excel 编辑 TSV（会改编码/加引号）。

## 5. override 纪律

`overrides.tsv` 是唯一允许覆盖已有值的地方，5 列都必须填：

```text
英文<TAB>新译文<TAB>scope<TAB>理由（>=8 字）<TAB>来源
```

- `scope`：`global` / `screen:<id>`；
- 理由写“为什么改”，不要写“修复”两个字；
- 来源写游戏数据文件、截图路径、官方 wiki URL 等可核验依据；
- 同值重定义、未授权 shadow 会被 `check` 拒绝。

## 6. keep-english

```text
英文<TAB>理由<TAB>证据
```

用于品牌、官方保留英文的专名、外部枚举等。不要因为“懒得翻”而加入；加入后 `check` 不允许它同时出现在翻译层。

## 7. 词典 vs 规则

- 词条只做**整串精确匹配**；
- 数字/日期/数量前缀/模板用规则；规则必须全串锚定、正反例、防循环；
- 出现“新数值就不生效”的硬编码词条（如 `+150 Health`）应改成“属性词 + 规则”。

## 8. 失败排查

| 现象 | 检查 |
|---|---|
| 加了没变化 | 键是否逐字符一致？是否被更高 order 层覆盖？build/Refresh 是否执行？ |
| 只有半句翻译 | 文本被节点/图标拆开；查 DOM/加规则 |
| 长文本不翻 | 运行时文本长度上限；拆词条或加规则 |
| 翻完又变回英文 | Vue 重渲染；正常闪烁，持续则用整段替换/规则 |
| 数字句不翻 | 规则缺口；不要硬编码数值 |
| 改了另一个页面也变 | 该键是全局的；改用 scope/override，不要靠大小写 |

## 9. 评审清单（AI 复核用）

1. 键是否唯一/是否已登记 override？
2. 是否与现有键仅差大小写/空白/弯引号/归一？
3. 同英文多义是否有 scope？
4. 是否把数字/模板硬编成词条？
5. 是否命中 keep-english 却被翻译？
6. `source` 是否可核验？
7. 是否覆盖了 generated 官方名而无更强证据？
8. 术语一致性、标点风格是否与既有层一致？
9. `check --strict` 是否通过？
10. PR 是否包含“改了什么/对应界面/如何验证/为什么不是直译”？

## 10. 数据边界

- `generated/` 只由生成脚本产出；不要手工编辑。
- 人工词条只写 `entries/`/`fixes.tsv`/`overrides.tsv`/`keep-english.tsv`。
- 路径/命令问题以 `AGENTS.md` 与仓库实际文件为准；`dict.py` 的输入错误会明确报缺文件，不要伪造数据。
