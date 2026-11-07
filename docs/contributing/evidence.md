# 真机证据规范（开发者填写）

> 适用：向 `main` 提交 PR 的外部贡献者。维护者用这份证据判断“用户可见行为是否被验证”，而不是替代真机。
> 原则：**开发者对 REAL 验证负责；AI 可以采集/整理，但不能替开发者声明“我看过了”。**

## 1. 证据等级

| 等级 | 含义 | 谁提供 |
|---|---|---|
| `SIM` | 可用命令/CI 复现的检查：build、verify、测试、hash 对比 | 开发者或维护者 |
| `HOST` | 本机合成注入/日志：test-inject、launcher 日志、bundle hash | 开发者 |
| `REAL` | 真实 Overwolf + 游戏画面：Start/Restore、页面截图、OCR 叠加层 | **开发者本人** |

T0 通常只需 `SIM` + 截图；T1 至少 `SIM` + 受影响页面 `REAL`；T2 必须 `REAL` 全流程。

## 2. 必填字段（PR 模板里有对应栏位）

> 下面的版本号/数量只是示例，不是当前事实；实际填写以本机环境、`VERSION`、命令输出为准。把尖括号占位符替换为实际值。命令是架构目标命令；工具未落地时填写实际执行的等价命令。

```yaml
environment:
  os: Windows <版本>
  alecaframe: <本机实际版本>
  overwolf: <本机实际版本>
  repo_commit: <head SHA>
  version: <VERSION 或待发布版本>
  bundle_sha256: <bin/alecaframe-zh-cn.js 的前 16 位或完整值>
  ocr_enabled: <true/false>
commands:
  - cmd: python tools\build.py
    exit: 0
    output_tail: "merged=... / wrote ..."
  - cmd: powershell -ExecutionPolicy Bypass -File tools\verify.ps1
    exit: 0
    output_tail: "结果：通过 (PASS=...)"
real_machine:
  - action: Start
    result: pass
    logs: logs/launcher.log (时间戳 ...)
    screenshots: shots/start-main.png
  - action: 库存中文搜索「死亡」
    result: pass
    screenshots: shots/inventory-search.png
unverified:
  - "没测 OCR（本机未安装前置组件）"
attestation: "以上 REAL 项由我在本机实际执行；未验证项已列出。"
```

## 3. 按 Tier 的最少要求

| Tier | 必须提供 |
|---|---|
| T0 | build/check 输出、受影响界面截图、词条来源 |
| T1 | T0 + 单元/golden 测试输出 + 受影响界面 REAL 截图/日志 + 至少一个反例检查 |
| T2 | T1 + Start/Restore/Refresh/Toggle/Status 全部结果 + 快照/还原证据 + 失败回滚验证 + 版本/hash |

## 4. 证据文件与命名

- 截图放在 PR 附件或以 `shots/<scope>-<action>.png` 命名；不要提交进仓库。
- 日志只贴关键片段（时间戳 + 关键行），完整日志放 PR 附件或说明获取方式。
- 每个证据必须能对应到：commit、版本、操作步骤、预期结果、实际结果。
- 不要把整段日志/截图无说明地丢进 PR。

## 5. 不合格证据（会被打回）

- 只有“我测过了”“看起来正常”，没有截图/日志/命令输出。
- 截图与声明的页面/词条不一致，或没有版本/时间戳。
- 用过期 commit/bundle 的证据。
- T1/T2 没有真机证据，只跑了 CI。
- 把维护者/开发者的本机绝对路径、用户名、token 写进 PR。
- 把“未验证”藏起来，或把 AI 的推断写成 REAL。

## 6. 隐私与安全

- 证据里不要出现：GitHub token、WM 账号、游戏账号、完整用户名路径。
- 诊断包可能含用户名，回传前先检查；只贴必要片段。
- 截图如有好友列表/聊天，先打码。

## 7. 维护者复核 AI 会怎么用这份证据

- 检查证据字段是否完整、是否与 diff/版本一致；
- 检查截图/日志是否覆盖了声明的变更；
- 标出“无法从证据判断”的项（视觉布局、实际 OCR 识别等）；
- 不会把“证据看起来合理”写成“已验证”。最终由维护者抽检/决定。
