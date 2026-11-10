# 任务路由（贡献者 AI 专用）

> 用途：按任务类型给出**最少必读文件**、可改位置、验证命令。不要通读整个仓库。
> 目标路径按新架构设计；尚未实现的模块以仓库实际文件为准，在 PR 中说明实际命令/路径。**不要执行不存在的路径。**
> 若任务不在表里：停下来，在 PR/Issue 里问，不要猜。

## 0. 通用规则

- 先读 [AGENTS.md](../../AGENTS.md)，再读本表对应行。
- 必读文件之外，只在需要时打开目标文件及其测试；不要打开 `bin/`、`dist/`、`state/`、`logs/`。
- 上下文预算：T0 最多 6 个文件，T1 最多 10 个，T2 最多 12 个。超过就拆任务或补文档，不要硬读。
- 一个 PR 只做一个主题；混合主题按最高 Tier 处理，并可能被打回拆分。

## 1. 词典：新增词条

| 项 | 内容 |
|---|---|
| Tier | T0 |
| 必读 | [AGENTS.md](../../AGENTS.md) → 本表 → `dict/AGENTS.md` → `dict/manifest.tsv` 对应行 → 目标词条文件头部 |
| 可改 | `dict/entries/common/*.tsv` 或 `dict/entries/screens/*.tsv`；不得改 `dict/generated/**` || 不要改 | `bin/**`、生成报告、`dict/upstream/**` |
| 验证 | `python tools\dict.py lookup/check` → `python tools\build.py` → `4-重启补丁.cmd`；受影响界面截图 || 证据 | SIM 命令输出 + T0 截图；不需要 REAL |

## 2. 词典：改已有译文 / override

| 项 | 内容 |
|---|---|
| Tier | T0，若改变用户可见译文需说明 |
| 必读 | `dict/AGENTS.md` → `dict/manifest.tsv` → `dict/overrides.tsv` 规则 |
| 可改 | 只能写 `dict/overrides.tsv`；必须写 scope/reason/source |
| 验证 | `python tools\dict.py lookup` 显示“最终值来自 override”；build + Refresh + 截图 |
| 注意 | 同值重定义、大小写变体、跨层静默覆盖都可能让改动“没生效”；先 lookup 再改 |

## 3. 词典语义修正（Cold/Range 等 scope）

| 项 | 内容 |
|---|---|
| Tier | T1（若改 engine 上下文则 T2） |
| 必读 | [docs/guides/dictionary.md](../guides/dictionary.md) → 目标 scope 定义 → `src/runtime/AGENTS.md` → 相关 engine 规则/测试 |
| 可改 | 词典 scope 数据 + engine 的 context/translate 模块 + 测试 |
| 验证 | golden 显式 diff；规则/engine 单测；受影响页面 REAL 截图（至少裂罅/天气/通用三组） |
| 注意 | 不要和词典数据结构变更混在一个 PR；不要靠大小写模拟 scope |

## 4. 翻译规则

| 项 | 内容 |
|---|---|
| Tier | T1 |
| 必读 | `src/runtime/AGENTS.md` → `src/runtime/rules/README.md` → 目标规则文件 → 规则测试/golden |
| 可改 | `src/runtime/rules/<id>.js` + 对应测试 |
| 规则要求 | 全串锚定、数字格式兼容、防循环守卫、至少 2 正例 + 2 反例；禁止 `^(\d+) (.+)$` 这类宽规则 |
| 验证 | 规则测试、`node tests\runtime.test.mjs
node tests\rules.test.mjs
node tests\search-feature.test.mjs`、`tools\verify.ps1`；受影响界面截图 |

## 5. 中文搜索 / hook

| 项 | 内容 |
|---|---|
| Tier | T1 |
| 必读 | `src/runtime/AGENTS.md` → `src/runtime/features/search/README.md` → `docs/guides/hooks.md`（实现后）→ 目标 hook 文件 → 对应页面卡 |
| 可改 | `src/runtime/features/search/` 或其 hooks 子模块 |
| 注意 | 插件级 hook 只在 background 有效、应用级只在 main；参数形态不同；失败只能 debugOnce，不能抛异常 |
| 验证 | 现有搜索测试全过（数量以测试输出为准）、hook 安装计数、真机仓库/铸造厂/赋能/遗物规划器/裂罅等界面 |

## 6. 页面适配器

| 项 | 内容 |
|---|---|
| Tier | T1（改注入/launcher 则 T2） |
| 必读 | `pages.json` → `docs/PAGE_MATRIX.md`（生成）→ 目标页面卡（`docs/pages/<page>.md`）→ `src/runtime/AGENTS.md` |
| 可改 | `src/runtime/adapters/<page>/`；只有真正 DOM 特判才建适配器 |
| 不要做 | 按页面建主目录、按页面拆 bundle、在 features 里写页面名 |
| 验证 | 受影响页面 REAL 截图；若改注入清单，必须跑 launcher 真机 Start/Restore |

## 7. launcher / 注入

| 项 | 内容 |
|---|---|
| Tier | T2 |
| 必读 | `src/launcher/AGENTS.md` → `src/launcher/README.md` → `pages.json` → `tools/test-inject.ps1` |
| 可改 | `src/launcher/` 模块；`pages.json` 仅维护者或 T2 同意后改 |
| 必须验证 | `Start / Restore / Refresh / Toggle / Status`；快照/还原 hash；官方文件未被永久改动；失败自动还原 |
| 证据 | REAL：日志、截图、`state/last-session.json`、bundle hash、回滚验证 |

## 8. OCR 边界

| 项 | 内容 |
|---|---|
| Tier | T2（只改路径/manifest）；逻辑改动另立项目 |
| 必读 | `src/ocr/AGENTS.md` → `src/ocr/README.md` → `src/ocr/CONTRACT.md` → `src/ocr/manifest.json` |
| 可改 | 仅 manifest/路径/文档；OCR 逻辑、端口、全局名、官方补丁点禁改 |
| 验证 | 静态检查 + 合成注入全过（脚本清单以 manifest 为准）+ server 启动冒烟 + （可选）真实 OCR 识别 |
| 注意 | 部署后的脚本名/flat 路径保持 `assets/js/afzh-*.js`，不要改注入契约 |

## 9. 构建 / CI / 发布

| 项 | 内容 |
|---|---|
| Tier | T2 |
| 必读 | [AGENTS.md](../../AGENTS.md) §5–§7、`docs/分支与发布流程.md`、`.github/workflows/` |
| 可改 | `tools/`、`scripts/`、`.github/`；不得弱化检查；改动本身要维护者同意 |
| 验证 | `tools/verify.ps1`、构建两次 hash 一致、生成物未跟踪、release tag 校验 dry-run |
| 注意 | 不要用 `continue-on-error` 掩盖失败；不要把 WARN 当 PASS；不要提交 secrets |

## 10. 文档 / 索引

| 项 | 内容 |
|---|---|
| Tier | T0 |
| 必读 | [AGENTS.md](../../AGENTS.md) → [docs/README.md](../README.md) → 目标文档 |
| 可改 | 对应文档；生成式索引不要手改，改生成器/源数据 |
| 验证 | 链接检查、`gen_index --check`、文档中不写会变的数字 |
| 注意 | 新文档必须同 PR 更新 `docs/README.md` 与 `AGENTS.md` 的入口链接 |

## 11. 明确不要接的任务

- 把项目改成按页面拆 bundle/目录的主结构；
- 把词典改成 JSON/数据库/Excel；
- 重写 OCR 逻辑（独立项目）；
- 改评审规则/CI 以绕过门禁；
- 没有真机条件却宣称 REAL 验证；
- 一个 PR 同时做词典数据结构、语义修正和运行时逻辑变更。
