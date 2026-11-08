# src/launcher/AGENTS.md — 启动器模块约定

> 就近规则：在 `src/launcher/` 下工作的 AI 先读根 [AGENTS.md](../../AGENTS.md)，再读本文件。
> Tier：T2。改这里必须有真机 Start/Restore 证据。命令是目标接口；工具未落地时以仓库实际文件为准，不要执行不存在的路径。

## 1. 职责

- 定位 Overwolf/AlecaFrame 安装目录；停止 Overwolf；从官方源/快照还原页面；带校验绕过参数启动；注入 bundle；重载渲染进程；快照/还原；OCR 生命周期；状态/日志/诊断。
- 不负责：翻译/搜索逻辑、词典内容、OCR 识别实现。

## 2. 目标结构

```text
src/launcher/
  AlecaFrame-ZH.ps1     # 入口：参数解析 + pages.json 加载 + Action 分派
  lib/
    Logging.ps1
    Overwolf.ps1        # 路径/进程/flag/加载等待
    Snapshot.ps1        # 官方文件快照/还原/pristine
    Patch.ps1           # 页面注入/脚本标签/幂等
    Ocr.ps1             # OCR 生命周期（只调用 src/ocr/manifest）
    State.ps1           # settings / last-session / 诊断
    Cli.ps1             # Action 实现
```

- lib 模块由入口 dot-source，共享入口的 `$script:` 配置；不要改成 Import-Module（会丢共享状态）。
- 页面清单来自 `pages.json`；OCR 注入清单来自 `src/ocr/manifest.json`；不要再新增第三份清单。
- `bin/` 只放生成物；源码不要放这里。

## 3. 硬规则

- **Windows PowerShell 5.1 兼容**；所有 `.ps1`/`.psm1` 必须 UTF-8 with BOM（中文提示必需）。
- 任何对官方文件的改动之前必须先快照；`Restore` 必须能恢复；注入必须幂等。
- 不修改官方签名/DLL；唯一允许的官方文件原地补丁是 OCR 相关文件，且必须可还原。
- 不要硬编码用户路径；使用 `$env:LOCALAPPDATA`/注册表探测；路径含中文/空格要正确处理。
- 不要静默吞异常：失败要写 `logs/launcher.log` 并自动还原（Start 失败时）。
- 状态文件加 `schemaVersion`；读取时能处理无版本/缺省值，否则给出明确错误。
- 不要内嵌翻译/搜索逻辑；不要改 `bin/alecaframe-zh-cn.js`。
- OCR 逻辑不在这里；只通过 manifest 复制/注入/启停，协议/端口/全局名不改。
- 改 CI/verify/package 的 PS 脚本属于 T2，不得弱化检查。

## 4. 验证

```powershell
powershell -ExecutionPolicy Bypass -File tools\test-inject.ps1
powershell -ExecutionPolicy Bypass -File tools\verify.ps1
```

必须真机：

```powershell
启动-中文补丁.cmd
版本信息.cmd
重启补丁.cmd
中英切换.cmd
还原-官方英文.cmd
```

- 记录：`logs/launcher.log`、`state/last-session.json`、注入页面数、bundle hash、快照/还原前后 hash。
- 任何 T2 PR 都要附真机证据；维护者建议再抽检一次 Start/Restore。

## 5. 不要做

- 不要在没备份的情况下对真实安装做破坏性测试。
- 不要改官方文件后不还原。
- 不要把 OCR 逻辑搬进 launcher；OCR 只走 manifest。
- 不要为了过测试而删 `test-inject` 检查或 `verify` 段。
- 不要提交 `state/`、`logs/`、临时目录。
