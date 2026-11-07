# 架构总览

> 一页地图：运行时、页面、词典、启动器、OCR 的边界与数据流。决策理由见 [ADR 0001](decisions/0001-capability-first-architecture.md)、[ADR 0002](decisions/0002-contribution-and-review-model.md)。

## 1. 运行链路

```text
pages.json ──> launcher（注入范围/页面清单）
dict/manifest.tsv ──> build ──> bin/alecaframe-zh-cn.js ──> launcher 复制 + 注入
src/runtime/modules.json ──> build（模块顺序/依赖校验）
src/ocr/manifest.json ──> launcher（OCR 脚本复制/注入/启停）
```

- 一个 bundle 注入多个页面；页面差异由 `pages.json` + `adapters/` 表达。
- 构建产物只生成到 `bin/`；源码不在 `bin/` 里。
- OCR 是独立可选子系统，只通过 manifest 与 launcher 交互。

## 2. 模块边界

| 模块 | 职责 | 不负责 |
|---|---|---|
| `src/runtime/core` | 规范化、词典索引、翻译决策链 | DOM、宿主 hook、页面名 |
| `src/runtime/rules` | 动态文本规则（每条可测） | 词条、DOM 遍历 |
| `src/runtime/dom` | 遍历/属性/观察器/上下文判定 | 搜索索引、页面清单 |
| `src/runtime/features` | 搜索、源石、遗物奖励等能力 | 页面名、launcher |
| `src/runtime/adapters` | 页面/DOM 特判 | 全局规则、词典 |
| `src/launcher` | 快照/还原/启动/注入/OCR 生命周期 | 翻译/搜索逻辑 |
| `src/ocr` | 可选 OCR 识别与页面脚本 | 主翻译/搜索链路 |
| `tools` | 构建、校验、词典工具、索引生成 | 运行时逻辑 |
| `dict` | 词条、覆盖、白名单、索引数据 | 规则、DOM |

依赖规则见 [AGENTS.md](../AGENTS.md) §4：`core` 无上层依赖；`rules/dom/features` 只依赖 `core`；`adapters/entry` 可依赖前三者；不得反向依赖；`dict` 只通过 build 进入 bundle。

## 3. 页面矩阵

- 数据：根 [pages.json](../pages.json)；schema：[schemas/pages.schema.json](../schemas/pages.schema.json)。
- 生成：`docs/PAGE_MATRIX.md`（页面 → 注入 → features → 适配器 → OCR → 宿主补丁）。
- 规则：页面名只出现在 `pages.json`/`adapters`；features 不知道页面名；未注入页面必须写 reason。

## 4. 词典

```text
dict/
  manifest.tsv          唯一加载顺序（禁止 glob）
  generated/            脚本产物；SHA256SUMS
  upstream/             上游词库
  fixes.tsv             上游修正
  entries/common|screens 人工词条
  overrides.tsv         唯一允许改值（scope/reason/source）
  keep-english.tsv      不译白名单
```

- 构建验收：[项目/词典验收设计](project/dictionary-acceptance.md)。
- 人类指南：`docs/guides/dictionary.md`（实现后创建）。

## 5. OCR

```text
src/ocr/
  manifest.json          页面脚本/server/worker/端口/全局名
  CONTRACT.md            硬契约
  page-scripts/<page>/   按页面组织的注入脚本
  server/                Node 服务 + worker + 截屏
```

- 端口/协议/全局名/官方补丁点不可改；逻辑变更另立项目。
- 部署后脚本名保持 `assets/js/afzh-*.js`。

## 6. 启动器

```text
src/launcher/
  AlecaFrame-ZH.ps1      入口/Action 分派
  lib/{Logging,Overwolf,Snapshot,Patch,Ocr,State,Cli}.psm1
```

- 页面清单来自 `pages.json`；OCR 清单来自 `src/ocr/manifest.json`。
- 任何官方文件改动前必须快照；`Restore` 必须可还原。

## 7. 文档与契约

| 入口 | 内容 |
|---|---|
| [AGENTS.md](../AGENTS.md) | AI 操作契约、目标接口、事实来源 |
| [docs/README.md](README.md) | 文档索引 |
| [docs/modules/README.md](modules/README.md) | 模块 README 模板与清单 |
| [docs/pages/README.md](pages/README.md) | 页面卡模板 |
| [schemas/README.md](../schemas/README.md) | 契约 schema 与校验 |
| [项目计划](project/v1.2.0-plan.md) | 工作流/里程碑/验收 |
| [词典验收](project/dictionary-acceptance.md) | golden 基准与构建校验 |

## 8. 不变量

- 单 bundle、单 `<script>`；全局名不改。
- 运行时无网络/文件系统/secrets；翻译精确匹配；规则全串锚定 + 防循环。
- PowerShell 5.1 + UTF-8 BOM；快照/还原幂等；官方签名/DLL 不改。
- 页面名只在 `pages.json`/`adapters`；OCR 契约稳定。
- 生成物不入库；可变事实以命令/生成报告为准。
