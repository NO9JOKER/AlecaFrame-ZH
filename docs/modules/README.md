# 模块文档

> 每个模块一个目录：`docs/modules/<module-id>/README.md`。
> 模板固定标题；CI 在模块 README 存在后检查必要章节。不要为每个源码文件写长文档。

## 模板

```markdown
# <module-id>

## 职责
一句话 + 不负责什么。

## 边界
调用方/被调用方；允许依赖/禁止依赖；不变量。

## 输入输出
数据形状、全局名、宿主方法签名、页面锚点、manifest 字段。

## 契约与不变量
改坏会怎样；必须保持的外部契约。

## 修改指引
常见任务 → 文件 → 测试/验证。

## 测试
覆盖什么；未覆盖什么；命令（目标接口注明）。

## 失败模式
症状 → 日志/状态 → 处理。

## 关联文档
ADR/指南/页面卡/契约 schema。
```

## 计划模块

| module-id | 目标路径 | 状态 |
|---|---|---|
| `runtime-core` | `src/runtime/core/` | active（W2 基础） |
| `runtime-rules` | `src/runtime/rules/` | active（规则表） |
| `runtime-dom` | `src/runtime/dom/` | active（DOM 翻译） |
| `features-search` | `src/runtime/features/search/` | active（纯 API + 宿主 hook） |
| `runtime-rules` | `src/runtime/rules/` | planned |
| `runtime-dom` | `src/runtime/dom/` | planned |
| `runtime-features` | `src/runtime/features/` | planned |
| `runtime-adapters` | `src/runtime/adapters/` | planned |
| `launcher` | `src/launcher/` | planned |
| `ocr` | `src/ocr/` | boundary defined; implementation planned |
| `build-dict` | `tools/` + `dict/` | planned |
| `release-ci` | `.github/` + `tools/` | planned |

模块清单最终以 `src/runtime/modules.json` 与生成 `MODULE_MAP.md` 为准；本表只用于文档规划，不替代 manifest。
