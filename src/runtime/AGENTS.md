# src/runtime/AGENTS.md — 注入运行时模块约定

> 就近规则：在 `src/runtime/` 下工作的 AI 先读根 [AGENTS.md](../../AGENTS.md)，再读本文件。
> 状态：A 阶段。C/D 阶段会把现有 `src/engine.js`、`src/search.js` 拆到本目录；拆分前仍以现行文件为准。

## 1. 职责

- 构建时拼成唯一注入 bundle：词典索引、翻译决策链、规则、DOM 遍历/观察器、中文搜索、插件/应用 hooks、页面适配器。
- 不负责：词典数据本身（在 `dict/`）、启动器/注入（`src/launcher`）、OCR（`src/ocr`）、构建工具（`tools/`）。

## 2. 目标结构

```text
src/runtime/
  modules.json          # 装配顺序/依赖/风险；唯一装配事实源
  core/                 # 纯函数：normalize、dict-index、translate
  rules/                # 规则按域拆，每条可单测
  dom/                  # walk/attrs/observer/context
  features/             # search/、archon/、relic-rewards/
  adapters/             # 唯一允许出现页面名的代码层
  entry.js
```

依赖方向：`core → rules/dom/features → adapters/entry`；features 不得知道页面名；adapters 不得被 core 反向依赖。

## 3. 硬规则

- **单 bundle**：仍然只生成一个 `bin/alecaframe-zh-cn.js`，一个 `<script>` 标签；不按页面拆 bundle。
- **全局契约不改名**：`__AFCN__`、`__AFCN_DICT__`、`__AFCN_RELIC_REWARDS__`、`__AFCN_TRANSLATE__`、`__AFZH_SEARCH__`、`__AFZH_SEARCH_API__`、`__AFZH_SEARCH_TEST__`、`__ALECAFRAME_ZH_CN_ITEMS__`。
- 翻译是**精确匹配**：不做模糊/词形变化；规则必须全串锚定、防循环，禁止宽泛正则。
- 运行时不得联网、读文件系统、写 secrets；不要引入 npm 依赖；不要要求用户端构建工具链。
- hooks 必须 feature-detect，宿主不存在只 `debugOnce`，绝不抛异常；插件级/应用级窗口差异要注释清楚。
- 页面名只能出现在 `adapters/` 和 `pages.json`；features 里不要写页面名/页面选择器。
- 修改 DOM 翻译/搜索行为必须同 PR 更新测试与模块 README；没有测试的行为变更不接受。
- 不要直接改 `bin/`；构建产物由 `build.py` 生成。
- 性能：MutationObserver 是热路径；新增扫描/匹配要考虑全树 walk、400 字符上限、防抖；不要引入无界轮询。

## 4. 当前（A 阶段）说明

- 现有实现：[src/engine.js](../../src/engine.js)、[src/search.js](../../src/search.js)、[src/relic-reward-fallback.js](../../src/relic-reward-fallback.js)。
- C/D 阶段先补测试，再拆分；拆分顺序：engine 纯函数/规则 → search index/query/filters → hooks → adapters。
- 现有测试：`tests/search.test.mjs`（49 项）；engine 规则目前无测试，拆分前必须补 golden/单测。
- 页面注册表 `pages.json` 在 E 阶段创建，launcher 读取它。当前页面清单仍在 launcher 常量中。

## 5. 验证

当前：

```powershell
node tests\search.test.mjs
python src\build.py
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1
```

C/D 阶段后：

```powershell
node tests\rules.test.mjs
node tests\runtime.test.mjs
python tools\build.py
powershell -ExecutionPolicy Bypass -File tools\verify.ps1
```

真机：`Refresh-Chinese.cmd` 后看日志 `[AlecaFrame-ZH] loaded translated=...`；受影响页面截图；涉及 hook 时检查 `__AFZH_SEARCH__` 状态。

## 6. 不要做

- 不要把 engine/search 改成按页面加载。
- 不要在 features 里硬编码 `main.html`/`background.html` 等页面名。
- 不要为了修一个页面引入全局宽规则；先考虑 adapter/context。
- 不要把 OCR 逻辑写进 runtime（OCR 独立边界）。
- 不要绕过 `verify` 或删除测试来让 PR 通过。
