# 页面卡

> 页面清单的唯一来源是根 [pages.json](../../pages.json)；页面卡只写“为什么/怎么验证”，不复制完整清单。
> 生成矩阵：`docs/PAGE_MATRIX.md`（实现后由 `pages.json` + OCR manifest 生成）。

## 模板

```markdown
# <page-id>

## 职责
页面在 AlecaFrame 中承载什么功能。

## 注入与 features
是否注入；需要哪些 features；bundle 注入位置/脚本标签。

## 适配器
是否需要 adapter；DOM 选择器/上下文；不需要就写“无”。

## OCR
注入哪些页面脚本；顺序；失败回退。

## 宿主补丁
是否原地修改官方文件；文件/锚点；恢复方式。

## 已知坑
文本被 v-html/图标拆分、Vue 重渲染、布局变长、窗口差异等。

## 验证
真机步骤（REAL）；截图/日志；未验证项。

## 关联
ADR/指南/模块 README。
```

## 规则

- 页面 id 必须存在于 `pages.json`。
- 新页面/页面改名只改 `pages.json`；页面卡随之更新。
- 未注入页面必须写 reason，不得留空。
- 页面卡不得写会变的版本/数量；以 `pages.json`/命令输出为准。
