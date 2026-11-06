# NOTICE / 第三方声明

本项目（AlecaFrame-ZH）是非官方汉化补丁，与以下各方均无关联。

## 1. AlecaFrame

- 版权：© Alejandro Cabrerizo，All rights reserved。
- 本项目**不包含、不重新分发** AlecaFrame 的任何源码、安装包或资源文件。
- 补丁运行时会读取用户本机已安装的 AlecaFrame，并在其前端页面上注入本项目自己的翻译脚本；这是对用户本地文件的修改，不是对 AlecaFrame 的再分发。

## 2. 上游中文词库与代码

上游两个社区项目均为 **MIT License**：

- [191086215333/AlecaFrame-ZH-](https://github.com/191086215333/AlecaFrame-ZH-)（原版）
- [MIOEU/AlecaFrame-ZH](https://github.com/MIOEU/AlecaFrame-ZH)（原版的二次开发分支）

本项目对它们的使用范围：

| 本项目的部分 | 来源 | 说明 |
|---|---|---|
| `src/vendor/translations.zh-CN.json` | MIOEU（与其仓库文件字节一致） | UI 文案词库 1,104 条 |
| `dict/mioeu-terms.tsv` | MIOEU `alecaframe-zh-cn-items.js` | 术语/物品名补缺，只在与我们词库不冲突时并入 |
| `src/search.js` | MIOEU `alecaframe-zh-cn.js` 的中文搜索部分 | 移植为独立模块，改为基于本项目词典做反向索引 |
| `bin/ocr/` 整个目录 | MIOEU 的遗物/裂罅中文 OCR 子系统 | 仅做路径与命名适配；OCR 协议、端口与 `window.__ALECAFRAME_ZH_CN_*` 全局名保持不变 |
| `src/relic-reward-fallback.js` | MIOEU 启动器内嵌的奖励回退代码 | 抽出为独立源文件，便于审阅与版本化 |
| Overwolf 0.311 兼容参数 | [MIOEU/AlecaFrame-ZH#3](https://github.com/MIOEU/AlecaFrame-ZH/pull/3)（ZeroClad） | `--ow-enable-features=force-validation-report-only` 的来源 |

原始项目版权归其作者所有；本项目对其中的机翻条目做了修订（见 `dict/fixes.tsv`），并对移植代码做了路径适配与工程化改造（构建、测试、文档）。

## 3. Warframe 游戏数据

- Warframe、物品名称与官方本地化文本 © Digital Extremes。
- `dict/items.tsv` 由用户本机 AlecaFrame 缓存的游戏数据 + 官方 `lang.json` 生成，仅用于在第三方工具中显示中文名称；本项目与 Digital Extremes 无关联。

## 4. 第三方 OCR 运行时

`安装OCR前置组件.cmd` 会按需下载并在**本项目目录内**（`bin/ocr/.tools`）安装：

- Node.js（官方发行版，MIT）
- Python 3.11 便携版（PSF License）
- PaddlePaddle / PaddleOCR 及其中文模型（Apache-2.0）

这些组件不修改系统全局环境，也不随本项目仓库分发，版权归各自项目所有。

## 5. Overwolf

- Overwolf 平台条款（Platform Terms of Use）7.2(ii) 禁止规避/禁用安全相关特性，7.2(iii) 禁止派生作品。
- 本项目的启动方式会关闭 Overwolf 的扩展完整性校验，**这可能违反上述条款**。使用者需自行承担风险；本项目不建议公开分发或商业使用。

## 6. 截图

`docs/images/` 中的截图来自用户本机界面，截图中的用户名等个人信息已做模糊处理。
