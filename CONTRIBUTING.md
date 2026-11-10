# 贡献指南

感谢你愿意帮忙完善 AlecaFrame-ZH。开始前请先读 [AGENTS.md](AGENTS.md)、[docs/README.md](docs/README.md) 与 [docs/contributing/workflow.md](docs/contributing/workflow.md)。

## 可以贡献什么

- **词典词条**：界面文案、物品/部件/遗物等精确匹配词条；
- **翻译规则**：数字/日期/模板类动态文本；
- **中文搜索 / hook**：宿主方法包装、本地过滤、诊断；
- **启动器 / 注入**：PowerShell 模块、页面注册表、快照/还原；
- **OCR 边界**：manifest/路径/文档（OCR 逻辑变更另立项目）；
- **文档与测试**：指南、模块说明、真机回归记录。

## 贡献流程

1. Fork 仓库，从 `main` 切 `feature/<scope>` 或 `fix/<scope>`；
2. 按 [docs/contributing/task-router.md](docs/contributing/task-router.md) 找到必读文件与可改位置；
3. 本地构建、检查、按 Tier 做真机验证；
4. 向 `main` 开 PR，填写 [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) 并附证据；
5. 维护者复核并手动合并。

贡献者不要直接推 `main`，不要自行合并 PR。

## 本地检查

以下命令均可在当前仓库执行；以实际文件为准，并在 PR 中记录实际运行的命令与结果。

```powershell
python tools\build.py
powershell -ExecutionPolicy Bypass -File tools\verify.ps1
node tests\runtime.test.mjs
node tests\rules.test.mjs
node tests\search-feature.test.mjs
```

真机操作：

```powershell
1-启动-中文补丁.cmd
4-重启补丁.cmd
2-还原-官方英文.cmd
5-版本信息.cmd
```

## 词典

- 词典目录、manifest、override 规则见 `dict/AGENTS.md`；
- 一个英文键只有一个权威译文；改值只能写 `overrides.tsv` 并附 scope/reason/source；
- 不要用 Excel 编辑 TSV；不要提交生成物。

## 提交与 PR

- 提交信息：`feat|fix|refactor|docs|test|chore(scope): 中文描述`；
- 一个 PR 一个主题；Tier 按 [AGENTS.md](AGENTS.md) §8 标注；
- 证据等级（SIM/HOST/REAL）与未验证项见 [docs/contributing/evidence.md](docs/contributing/evidence.md)；
- 不要提交 `bin/`、`dist/`、`state/`、`logs/`、报告文件。

## 发布

维护者负责合并、`VERSION`/`CHANGELOG`、tag 与 GitHub Release；流程见 [docs/分支与发布流程.md](docs/分支与发布流程.md)。
