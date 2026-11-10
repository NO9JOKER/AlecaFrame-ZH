# NOTICE / 第三方声明

本项目（AlecaFrame-ZH）是非官方汉化补丁，与以下各方均无关联。

## 1. AlecaFrame

- 版权：© Alejandro Cabrerizo，All rights reserved。
- 本项目不包含、不重新分发 AlecaFrame 的源码、安装包或资源文件。
- 补丁在用户本机读取已安装的 AlecaFrame，并在前端页面注入本项目自己的翻译脚本；这是对用户本地文件的修改，不是对 AlecaFrame 的再分发。

## 2. 社区词库与代码来源

两个社区项目均为 **MIT License**：

- [191086215333/AlecaFrame-ZH-](https://github.com/191086215333/AlecaFrame-ZH-)
- [MIOEU/AlecaFrame-ZH](https://github.com/MIOEU/AlecaFrame-ZH)

本项目使用范围：

| 本项目部分 | 来源 | 说明 |
|---|---|---|
| `dict/upstream/translations.zh-CN.json` | MIOEU | 上游 UI 文案词库 |
| `dict/generated/mioeu-terms.tsv` | MIOEU `alecaframe-zh-cn-items.js` | 术语/物品名补缺 |
| `src/runtime/features/search/` | MIOEU 中文搜索实现 | 改写为运行时 feature，基于本项目词典做索引 |
| `src/ocr/` | MIOEU 遗物/裂罅中文 OCR 子系统 | 路径/命名适配；协议、端口、`window.__ALECAFRAME_ZH_CN_*` 全局名保持 |
| `src/ocr/host-patches/relic-reward-fallback.js` | MIOEU 启动器奖励回退代码 | 独立源文件，可审阅/还原 |
| Overwolf 0.311 兼容参数 | [MIOEU/AlecaFrame-ZH#3](https://github.com/MIOEU/AlecaFrame-ZH/pull/3)（ZeroClad） | `--ow-enable-features=force-validation-report-only` 来源 |

原始项目版权归其作者所有；本项目对其中机翻条目做了修订，并对代码做了路径适配/工程化改造。

## 3. Warframe 游戏数据

- Warframe、物品名称与官方本地化文本 © Digital Extremes。
- `dict/generated/items.tsv` 由用户本机 AlecaFrame 缓存的游戏数据 + 官方 `lang.json` 生成，仅用于第三方工具显示中文名称；本项目与 Digital Extremes 无关联。

## 4. 第三方 OCR 运行时

`6-安装OCR前置组件.cmd` 会按需在本项目目录 `bin/ocr/.tools` 内安装：

- Node.js（官方发行版，MIT）
- Python 3.11 便携版（PSF License）
- PaddlePaddle / PaddleOCR 及中文模型（Apache-2.0）

这些组件不修改系统全局环境，也不随仓库分发。

## 5. Overwolf

- Overwolf 平台条款 7.2(ii) 禁止规避/禁用安全相关特性，7.2(iii) 禁止派生作品。
- 本项目启动方式会关闭 Overwolf 扩展完整性校验，**可能违反上述条款**。使用者自行承担风险；不建议公开分发或商业使用。

## 6. 截图

`docs/images/` 中截图来自用户本机界面，个人信息已模糊处理。
