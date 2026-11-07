# runtime-dom

## 职责

DOM 翻译层：文本节点、属性、MutationObserver、裂罅上下文判定。接收 `translate()`，不改业务逻辑。

不负责：词典索引/规则内容、搜索 hook、页面清单、OCR。

## 边界

- 调用方：`entry`（组合根）。
- 依赖：`core.normalize`（空白归一）；`translate` 由参数注入。
- 禁止：直接读取 `__AFCN_DICT__`、写全局搜索状态、页面名硬编码（例外：当前 `entry` 的 archon 跳过选择器，后续移到 feature/adapter）。

## 输入输出

- `dom.create({ translate, entries, skipSelector }) -> { start, walk, scanAll, stats }`
- `start()`：遍历 body、安装 MutationObserver、延迟补扫；
- `walk(node)`：翻译子树；
- `translateAttrs(element)`：placeholder/title/aria-label/data-tooltip/data-tippy-content；
- 跳过 SCRIPT/STYLE/TEXTAREA/CODE/PRE/NOSCRIPT/OPTION；文本 > 400 字符不翻。

## 契约与不变量

- 纯 DOM 读写；不得联网/读文件/写 secrets；
- 翻译失败（null）保持原文；
- 保留原文本首尾空白；
- 裂罅上下文使用祖先 class 启发式；命中后对伤害标签补“伤害”；
- MutationObserver 只处理新增/字符/属性变化，避免重复写入；
- 初始化失败不得抛异常打断页面。

## 修改指引

- DOM 行为变更 → 本文件 + `tests/runtime.test.mjs`（纯函数部分）；
- 页面专属 DOM 差异 → `src/runtime/adapters/`，不要扩大全局选择器；
- 源力石整段/OCR 页面差异 → 对应 feature，不进 dom。

## 测试

```powershell
node tests\runtime.test.mjs
```

当前覆盖：归一等纯函数；DOM 层本身无 jsdom 测试，依赖真机/集成验证（未验证项必须写明）。

## 失败模式

- 选择器过宽 → 误翻工具栏/代码；
- Vue 重渲染覆盖 → MutationObserver 补翻（闪烁正常）；
- `v-html`/图标拆句 → 逐节点无法匹配，需要 feature 整段处理；
- observer 回调异常 → 捕获，不影响其他节点。

## 关联

- [src/runtime/AGENTS.md](../../../src/runtime/AGENTS.md)
- [ADR 0001](../../decisions/0001-capability-first-architecture.md)
