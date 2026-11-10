# runtime-canvas-text

## 职责

Canvas 2D 文本翻译层：包装 2D context 的 `fillText` / `strokeText` / `measureText`，让 Chart.js 图例、tooltip、坐标轴刻度/标题以及自定义 canvas 文字走现有 `translate()` 链。

不负责：DOM 文本/属性（`runtime-dom`）、词典词条与动态规则内容（`dict/`、`runtime-rules`）、Chart.js 配置或页面业务逻辑。

## 边界

- 调用方：`entry`（组合根，translator 建好后、DOM 启动分支前调用 `install()`）；测试可注入假 target。
- 依赖：仅 `core.normalize`（模块加载顺序）；`translate()` 由参数注入。
- 禁止：直接读取 `__AFCN_DICT__`、联网/读文件/写 secrets、定时器/轮询、页面名、修改 Chart.js 或宿主业务对象；只包装 context 方法。
- 默认只包装浏览器全局 `CanvasRenderingContext2D.prototype`；`OffscreenCanvasRenderingContext2D`、WebGL 文本不在覆盖范围。

## 输入输出

- `runtime.canvasText.create({ translate, target }) -> { install(), translateText(text) }`
  - `target` 省略时取 `globalThis.CanvasRenderingContext2D.prototype`；环境不存在时为 `null`；
  - `target` 可注入假对象（含 `fillText` / `strokeText` / `measureText`），Node 测试不依赖真实 canvas；
  - `install() -> boolean`：首次成功包装 `true`；重复调用或无 target 时 `false`；不重复包装；自身不抛异常；
  - `translateText(text) -> string`：非字符串、未命中（`null`）、译文与原文相同都返回原文；命中返回译文；`translate()` 抛异常返回原文。
- 包装后的方法签名不变：`this`、其余参数、参数个数、返回值全部保留；`measureText` 用译文测量，保证图例/tooltip 布局与绘制一致。
- 覆盖的文本：Chart.js 图例 label、tooltip title/body、坐标轴 tick/标题；手写 canvas 文字（如地图刻度 `N game units`）。
- 翻译是整串精确匹配：含数字/单位的组合句需要 `rules` 规则或整句词条，否则保持英文。

## 契约与不变量

- 只处理字符串首参；非字符串原样透传。
- 每次绘制/测量最多一次 `translate()`；不做缓存、不加定时器、不联网/读文件。
- `translate()` 返回 `null` 或与原文相同 → 原样绘制；任何翻译异常都不得影响宿主绘制（回退原文）。
- `install()` 幂等；环境无 `CanvasRenderingContext2D` 时安全 no-op，不抛异常。
- 不改变宿主 canvas 状态（font/fillStyle/transform/对齐等），不改变原有返回值。
- 包装失败（prototype 只读等）保持宿主原方法，不半包装后继续抛错。

## 修改指引

- 新增/修改包装方法 → `src/runtime/dom/canvas-text.js` + `tests/runtime.test.mjs`；
- 新增 canvas 文本译法 → 先查 `dict/entries`（`tools/dict.py lookup "<英文>"`）；数字句/整句走 `src/runtime/rules/index.js`，不要硬编码进本模块；
- 组合根装配 → `src/runtime/entry.js`；模块清单 → `src/runtime/modules.json`（本模块在 `dom.index` 之后、`features` 之前）。

## 测试

```powershell
node tests\runtime.test.mjs
```

覆盖：假 target 下命中词条翻译、未命中/纯数字/纯中文/非字符串原样、`measureText` 用译文且返回值不变、`this`/参数/返回值保留、重复 `install` 幂等、无 canvas 环境 no-op、`translate()` 抛异常回退原文。

未覆盖：真实浏览器 / Chart.js / Overwolf 渲染进程（需真机 `4-重启补丁.cmd` 后看图表图例、tooltip、坐标轴与地图 `game units`）；`OffscreenCanvasRenderingContext2D`。

## 失败模式

- 图表/画布仍为英文 → 该整串未被词典或规则覆盖（如 `Drone spawn rate: 0 spawns/min` 这类组合文本需要规则）；用 `tools\dict.py lookup` 与 rules 测试核对；
- 图例/tooltip 宽度或换行错位 → `measureText` 未包装，或 Chart.js 在 `install()` 之前已完成首次布局；确认装配发生在 Chart.js 首次绘制前；
- 单个图表仍英文 → 该图表来自 OffscreenCanvas 或非同源 2D prototype；
- 页面报错 → 本模块 `install()` 自身不抛异常；检查 `__AFCN_RUNTIME__.canvasText` 是否存在、`entry` 是否在 `typeof document` 分支前装配。

## 关联文档

- [runtime-dom](../runtime-dom/README.md)
- [src/runtime/AGENTS.md](../../../src/runtime/AGENTS.md)
- [src/runtime/modules.json](../../../src/runtime/modules.json)
- [ADR 0001](../../decisions/0001-capability-first-architecture.md)
