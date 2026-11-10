# 真机验证（Windows + Overwolf + AlecaFrame）

> 目的：验证 1.2.0 新架构的启动器、bundle、页面注入和还原流程。
> 风险：T2。会重启 Overwolf 并临时改写官方页面文件；只能由开发者本人在测试机执行。
> 当前状态：新运行时只有 SIM 证据，**尚无 REAL 证据**；本清单用于补 REAL。

> 当前证据状态（2026-11-08）：
> - Start/Status/Refresh/Toggle/Restore 已由开发者反馈正常；截图/日志证据待归档。
> - OCR 前置安装完成；`/health` 返回 `ready=true`，server 已停止；遗物价格与紫卡词条实际识别成功。
> - 新运行时其余部分只有 SIM/HOST 证据。
> - 源力石效果指南/详情修复（2026-11-08）：SIM + 无头浏览器合成注入通过（27 行单元格全中文、
>   20 个行内图标保留、卡片摘要/融合配方/槽位提示中文），**待本清单第 4 节 REAL 复验**。
> - 仲裁界面汉化（2026-11-08）：`pages.json` 启用 `arbitrationLive` 注入 + 词典/规则 +
>   `dom.canvas-text`（Canvas 图例/tooltip/坐标轴）；SIM（构建/契约/golden/单元测试/合成注入与
>   还原）+ HOST（无头浏览器真实 bundle：合并文本节点与 Canvas 10 行全中文、真实
>   `arbitrationLive.html` 注入后静态头部中文）通过，**待本清单第 4 节 REAL 复验**。
> - 铸造厂切换分类卡死修复（2026-11-08）：HOST 复现（无头 Chrome + 真实 foundry 模板/
>   mainFoundry.js/tippy：旧 bundle 注入 `AX-52` 物品名后 HANG >45s，修复后 0.9s 完成 12 次分类
>   切换）；本机真实 AlecaFrame（Overwolf 0.314.1.1 / AlecaFrame 3.0.6，诊断构建）确认死循环栈为
>   `translateAttrs → MutationObserver`，修复后连续切换 主武器/副武器/全部/战甲 不卡死、
>   renderer CPU 空闲。**待开发者常规操作复验**。

## 0. 前置

- Windows 10/11；
- Overwolf 已安装，AlecaFrame 已安装并至少打开过一次；
- 关闭正在进行的游戏任务/交易等不可中断操作（Start/Restore 会重启 Overwolf）；
- PowerShell 5.1；
- 仓库工作树干净，记录：

```powershell
git rev-parse HEAD
python tools\build.py
python tools\package.py
```

`package.py` 会在 `dist\AlecaFrame-ZH-<version>\` 生成**测试包**；它不是 release 包。

## 1. 记录基线

```powershell
$pkg = (Get-ChildItem dist -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
Get-Content (Join-Path $pkg 'PACKAGE-INFO.json')
```

记录：

- `PACKAGE-INFO.json` 的 `bundle.sha256`；
- 当前 `VERSION`；
- Overwolf / AlecaFrame 版本（Status 会显示）。

## 2. Status（只读）

```powershell
& (Join-Path $pkg '4-版本信息.cmd')
```

检查：

- Overwolf/AlecaFrame 版本能识别；
- “当前文件已汉化”初始为 `False`（或与机器现状一致）；
- OCR 开关/前置/服务状态可读；
- 不修改官方文件。

## 3. 冷启动 Start

```powershell
& (Join-Path $pkg '1-启动-中文补丁.cmd')
```

等待 Overwolf 与 AlecaFrame 自动启动完成，然后检查：

- `logs\launcher.log`：出现页面注入、bundle、加载等待日志；
- `state\last-session.json`：存在且有 `schemaVersion`/版本/时间；
- 再次 `4-版本信息.cmd`：“当前文件已汉化=True”“本次会话已带校验绕过参数=True”。

## 4. 页面与功能检查

主窗口至少逐项看：

- 库存 / 铸造 / 市场 / 裂罅 / 源力石 / 统计；
- 中文静态文本；
- 中文搜索：库存、铸造里输入中文（例如 `膛线`、`死亡`），确认列表过滤；
- 市场建议：输入中文，确认候选列表与点击后仍能查到；
- 裂罅卡片/叠加层：属性、伤害标签、`+109.9% Critical Damage` 这类动态文本；
- 源力石/Archon 页面：
  - 效果指南四种颜色（深红/琥珀/蔚蓝/翡翠/黄玉/紫晶）的普通与 TAU 列均为中文，伤害图标仍在原位；
  - 战甲卡片效果摘要为「N 个 效果名」，不再出现 `3 个 Primary status chance` 这类半翻；
  - 融合配方的 `N Stela`、`N possible now`、`N regular, N Tauforged` 为中文；
  - 槽位悬停提示为「源力石名，效果名」，空槽位为「空槽位 N」；
  - 打开战甲详情，槽位效果描述为中文且图标保留；
- 通知/世界状态/计时器；
- 仲裁界面（本次修复重点，主窗口 + 实时仲裁窗口）：
  - 主窗口「仲裁 → 运行记录」：记录详情的任务/日期/视角行（`Defense, Nov 4, 2026, 09:14 PM, Perspective unknown`）、
    统计卡片（Observed duration / Wave span、`N / capture min`、`N full capture`、No complete boundaries）、
    波次节奏（Wave pace/Rotation pace、Faster/Slower）、间隔分析（Canvas 图例 Total interval/Active/Intermission 及脚注）、
    生成地图（Spawns & map、`N game units`）、详情/备注/导入导出按钮均为中文；
  - 打开实时仲裁窗口（Arbitration Live）：标题、状态、指标卡（Preparing/Mission time/Since last drone/Expected VE）、
    图表下拉（Last 1/5/10 minutes）、图表 Canvas 图例/tooltip（`Drone spawn rate: N spawns/min`）、
    波次回顾、完成摘要均为中文；
  - 两窗口 DevTools（如可开）：`__AFCN_PAGE__` 的 `id` 分别为 `main` 与 `arbitrationLive`，features 含 `translate`；
    图表坐标轴/图例文字为中文，且图表布局不重叠、tooltip 不截断。
- 控制台（如可开 DevTools）：
  - `__AFCN_PAGE__` 的 `id`/`features` 与当前页面一致；
  - `__AFZH_SEARCH__` 有 `started`、`hooks`、`hits`；
  - `__AFZH_SEARCH_API__.englishForChinese("...")` 可查。

背景窗口（background）检查：

- 插件 hook 是否安装（`__AFZH_SEARCH__.hooks`）；
- 库存/铸造的中文查询能否命中；
- `__AFZH_SEARCH__` 无未捕获异常。

OCR（如已启用）：

- 遗物奖励叠加层中文显示；
- 裂罅 OCR 叠加层不崩；
- 若 OCR 未装齐，记录缺失项，不把它当运行时失败。

## 5. Refresh / Toggle

```powershell
& (Join-Path $pkg '3-重启补丁.cmd')
& (Join-Path $pkg '2-中英切换.cmd')
```

检查：

- Refresh：不重启 Overwolf，重新注入后中文仍生效，`last-session` 更新；
- Toggle：中/英界面切换，页面不崩；再切回中文仍可搜索。

## 6. Restore

```powershell
& (Join-Path $pkg '7-还原-官方英文.cmd')
```

检查：

- Overwolf 重启后 AlecaFrame 为英文；
- `4-版本信息.cmd`：“当前文件已汉化=False”；
- `state\official\<版本>\web` 快照仍在；
- 抽样对比官方页面文件（可记录 hash）与备份一致。

## 7. 证据（必须附在 PR/报告）

- `git rev-parse HEAD`；
- `PACKAGE-INFO.json`（bundle sha256）；
- `4-版本信息.cmd` 输出截图/文本（Start 前后、Restore 后）；
- `logs\launcher.log` 尾部；
- `state\last-session.json`；
- 受影响页面截图（至少主窗口 + background 搜索结果 + 一个动态规则页面）；
- 失败时：报错文本、页面、是否自动还原、是否手跑 Restore；
- 证据等级按 [docs/contributing/evidence.md](../contributing/evidence.md) 写 `REAL`。

## 8. 注意

- 测试包版本号当前来自 `VERSION`；不要把它当 1.2.0 release。
- 若要测试最新源码，重跑 `build.py` + `package.py`；`Refresh` 只重注入**当前测试包**内的 bundle。
- 如果 Start 失败：先看日志，再运行同包 `7-还原-官方英文.cmd`；不要手工删除 `state/`。
- 首次测试前确认没有其他程序占用 Overwolf 安装目录；路径含中文/空格时不要手动改脚本。
