# AlecaFrame-ZH

非官方 AlecaFrame 简体中文补丁：启动器注入一个 JS bundle，提供词典翻译、动态规则和中文搜索；OCR 是可选子系统。

- 目标版本：`1.2.0`（见 [VERSION](VERSION)）
- 兼容性快照：AlecaFrame `3.0.6` / Overwolf `0.311.1.6`，核对日期 `2026-11-08`
- 不是 AlecaFrame 源码分支；不包含/不重新分发 AlecaFrame 安装包

## 能做什么

- 主窗口/覆盖层 UI 静态文案翻译；
- 裂罅、源力石、日期/数字等动态文本规则；
- 库存/铸造/市场/裂罅/遗物规划器等页面的中文搜索；
- 可选 OCR：遗物奖励、裂罅识别与叠加层；
- 可逆：`Start` 前快照官方文件，`Restore` 还原。

## 快速开始

开发/构建：

```powershell
python tools\build.py
python tools\package.py --version 1.2.0 --name AlecaFrame-ZH-1.2.0 --out dist --zip
```

生成：

```text
dist/AlecaFrame-ZH-1.2.0/
dist/AlecaFrame-ZH-1.2.0.zip
```

双击测试包里的 `启动-中文补丁.cmd` 启动；`版本信息.cmd` 查看状态；`还原-官方英文.cmd` 恢复。详细步骤见 [真机验证指南](docs/verification/REAL_MACHINE.md)。

> 测试包是 development-test，不是 release tag；发布前必须走 verify/真机/合并流程。

## 开发命令

```powershell
python tools\build.py
python tools\check_contracts.py
python tools\dict.py check --strict
node tests\runtime.test.mjs
node tests\rules.test.mjs
node tests\search-feature.test.mjs
powershell -ExecutionPolicy Bypass -File tools\verify.ps1 -Package
```

CI：`.github/workflows/build.yml`；发布：`.github/workflows/release.yml`。

## 目录

```text
pages.json            页面注册表（页面/注入/features/host patches）
dict/                 词典数据：manifest / generated / upstream / entries / overrides / keep-english
src/runtime/          单 bundle：core / rules / dom / features / adapters / entry
src/launcher/         启动器：入口 + lib 模块；构建生成到 bin/
src/ocr/              OCR 边界：manifest / page-scripts / server / worker / host-patches
schemas/              pages / modules / OCR manifest / dict manifest 契约
tools/                build / dict / verify / package / check_contracts
tests/                Python/Node 测试与 fixtures
docs/                 架构、指南、贡献者、复核、ADR、项目计划
bin/                  生成物（不入库）
```

## 修改入口

- 词典：读 [dict/README.md](dict/README.md) 与 [docs/guides/dictionary.md](docs/guides/dictionary.md)；
- 引擎/规则/搜索：读 [src/runtime/AGENTS.md](src/runtime/AGENTS.md) 与模块 README；
- 启动器：读 [src/launcher/AGENTS.md](src/launcher/AGENTS.md)，T2，需真机证据；
- OCR：读 [src/ocr/README.md](src/ocr/README.md) 与 [src/ocr/CONTRACT.md](src/ocr/CONTRACT.md)；
- 贡献/复核：读 [CONTRIBUTING.md](CONTRIBUTING.md)、[AGENTS.md](AGENTS.md)。

## 验证与风险

- 所有可机器验证项进 `tools/verify.ps1`/CI；真机项由开发者执行并留证据；
- 启动器会临时修改用户本机 AlecaFrame 前端文件，必须保留 `state/official` 快照；
- 发布前需 `VERSION`/`CHANGELOG`/真机清单/verify 全过；见 [项目计划](docs/project/v1.2.0-plan.md)。

## 授权

MIT；第三方来源与 Overwolf 平台风险见 [NOTICE.md](NOTICE.md)。
