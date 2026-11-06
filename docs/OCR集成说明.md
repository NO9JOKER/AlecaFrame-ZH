# 中文遗物 / 裂罅 OCR 子系统 · 集成说明

> 交付物：WP3（MIOEU OCR 子系统移植）。本文是**给启动器/打包脚本的集成契约**，不是用户文档。
> 参考实现：`upstream/mioeu`（MIOEU/AlecaFrame-ZH，MIT）。只做移植、改名、路径与编码适配；
> **OCR 内部协议（端口 38147、端点名、`window.__ALECAFRAME_ZH_CN_*` 全局名）一律未改**，启动器必须按原协议注入和启动。
>
> 本机对照版本：AlecaFrame **3.0.6**（`%LOCALAPPDATA%\Overwolf\Extensions\afmcagbpgggkpdkokjhjkllpegnadmkignlonpjm\3.0.6`）。
> 文中所有锚点、argv 顺序、`afzh-items.js` 建表结果均已在本机实测（见第 12 节）。

---

## 1. 文件清单与职责

| 落地文件（本仓库） | 来源（MIOEU） | 运行位置 | 职责 |
|---|---|---|---|
| `bin/ocr/relic-ocr-server.js` | `alecaframe-relic-ocr-server.js` | Node 进程（**常驻**） | 本机 HTTP 服务 `127.0.0.1:38147`，做截图→OCR→中文名→英文名的解析与缓存 |
| `bin/ocr/relic-ocr-worker.ps1` | `Invoke-AlecaFrame-RelicChineseOcr.ps1` | `powershell.exe` 子进程（**每次识别起一个**） | 用 `Windows.Media.Ocr` 识别中文截图，输入 `-ImagePath/-TranslationsPath/-OutputPath` |
| `bin/ocr/capture-warframe-screen.ps1` | `Capture-AlecaFrame-WarframeScreen.ps1` | `powershell.exe` 子进程 | 前台窗口截图；前台不是 `Warframe.x64` 时返回 `success=false` |
| `bin/ocr/paddle-reward-worker.py` | `alecaframe-paddle-reward-worker.py` | Python 子进程（**常驻**） | PaddleOCR 常驻 worker，stdin/stdout 行 JSON 协议，首次启动加载中文模型 |
| `bin/ocr/afzh-relic-ocr.js` | `alecaframe-zh-cn-relic-ocr.js` | 注入 `background.html` | 遗物 OCR 桥：接管 Overwolf 截图、调 `/process*`、广播中文奖励结果 |
| `bin/ocr/afzh-riven-ocr.js` | `alecaframe-zh-cn-riven-ocr.js` | 注入 `background.html` | 裂罅 OCR 桥：调 `/process-riven`、驱动裂罅浮层 |
| `bin/ocr/afzh-riven-overlay.js` | `alecaframe-zh-cn-riven-overlay.js` | 注入 `rivenOverlay.html` | 裂罅浮层中文渲染 |
| `bin/ocr/afzh-relic-ducats.js` | `alecaframe-zh-cn-relic-ducats.js` | 注入 `relicOverlay.html` | 静态杜卡德表 `window.__ALECAFRAME_ZH_CN_REWARD_DUCATS__` |
| `bin/ocr/afzh-relic-overlay.js` | `alecaframe-zh-cn-relic-overlay.js` | 注入 `relicOverlay.html` | 遗物奖励浮层中文渲染（读 `/latest-reward`） |
| `bin/ocr/afzh-relic-recommendation.js` | `alecaframe-zh-cn-relic-recommendation.js` | 注入 `relicRecommendation.html` | 精炼推荐浮层中文渲染 |
| `bin/ocr/afzh-relic-planner-cache.js` | `alecaframe-zh-cn-relic-planner-cache.js` | 注入 `main.html` | 遗物规划器的会话缓存（localStorage） |
| `bin/ocr/afzh-inventory-price-sync.js` | `alecaframe-zh-cn-inventory-price-sync.js` | 注入 `main.html` | 仓库价格同步辅助 |
| `bin/ocr/afzh-inventory-images.js` | `alecaframe-zh-cn-inventory-images.js` | 注入 `main.html` | 仓库图标映射（内置静态表 + WFCD 图床 URL） |
| `scripts/Install-OcrPrerequisites.ps1` | `Install-AlecaFrame-ZH-OcrPrerequisites.ps1` | 用户手动/安装 cmd 调用 | 下载便携 Python/Node、pip 装 Paddle、预热中文模型 |
| `安装OCR前置组件.cmd` | 同名 | 包根 | 包装 `-Action InstallOcr` |
| `启用中文遗物OCR.cmd` | 同名 | 包根 | 包装 `-Action OcrOn` |
| `关闭中文遗物OCR.cmd` | 同名 | 包根 | 包装 `-Action OcrOff` |
| `bin/ocr/afzh-items.js` | `alecaframe-zh-cn-items.js`（替代） | **不注入页面**，只给 Node 用 | `window.__ALECAFRAME_ZH_CN_ITEMS__` 的英文→中文映射，**由 `python src/build.py` 生成**（`src/build.py` 里 `OCR_ITEMS`） |

> `afzh-items.js` 不在本 WP 的落地清单里，但它是 `relic-ocr-server.js` 的**必需**输入（argv[0]）。
> 未生成时启动器 `Test-OcrPrerequisites` 会报 `bin/ocr/afzh-items.js（请先运行 python src/build.py）`。
> 当前工作副本已生成：98.4 万字节 / 24033 条目。

---

## 2. 注入页面与 `<script src>` 映射

**机制**：`bin/ocr/<name>.js` → 复制到 `web/assets/js/<同名 basename>` → 在页面 `</body>` 前插入
`<script src="assets/js/<同名 basename>"></script>`。**不要改 basename**，否则复制/注入/还原三处都要改。

| 页面 | 注入的 OCR 脚本（按插入顺序） | 说明 |
|---|---|---|
| `background.html` | `afzh-relic-ocr.js` → `afzh-riven-ocr.js` | 两个桥都跑在 background，全局在 background 的 window 上 |
| `rivenOverlay.html` | `afzh-riven-overlay.js` | 另需 Vue 模板 `:key` 补丁，见 §10.2 |
| `relicOverlay.html` | **`afzh-relic-ducats.js` → `afzh-relic-overlay.js`** | **顺序不可换**：overlay 在 IIFE 开头就取 `window.__ALECAFRAME_ZH_CN_REWARD_DUCATS__` |
| `relicRecommendation.html` | `afzh-relic-recommendation.js` | |
| `main.html` | `afzh-relic-planner-cache.js` → `afzh-inventory-price-sync.js` → `afzh-inventory-images.js` | |
| 其余 5 个页面 | 仅基础汉化 `alecaframe-zh-cn.js` | `AFBuilds.html` / `InGameNotification.html` / `SquadMakingMain.html` / `SquadMakingSquad.html` / `tradeFinishedNotification.html` |

补充约定：

1. 10 个目标页面**都会**注入基础汉化 `assets/js/alecaframe-zh-cn.js`。该 bundle 由 `src/build.py` 生成，开头包含
   `window.__ALECAFRAME_ZH_CN_ITEMS__ = window.__AFCN_DICT__;` 兼容 shim —— 这是 OCR 叠加层在页面里拿到物品表的唯一来源。
2. `afzh-relic-ducats.js` / `afzh-relic-overlay.js` / `afzh-relic-recommendation.js` / `afzh-relic-planner-cache.js` /
   `afzh-inventory-price-sync.js` / `afzh-inventory-images.js` 与 OCR 服务**无强依赖**（服务没起时 `fetch` 静默失败、
   浮层退化为不显示）。上游 MIOEU 对它们**不区分 OCR 开关**，只要有汉化就注入。
   本仓库当前实现（`bin/AlecaFrame-ZH.ps1` 的 `$script:OcrInjections`）是**统一在 OCR 开启时一并注入**，二者都自洽，
   但注意：**只要开了 OCR，就必须注入全部 9 个脚本 + 基础 bundle**，否则 `afzh-relic-overlay.js` 会因缺 `__ALECAFRAME_ZH_CN_REWARD_DUCATS__` 退化。
3. 还原（Restore-English / 关 OCR）时，页面标签由「还原官方页面文件」一并清除；`web/assets/js/<basename>` 需要显式删除
   （启动器 `Remove-OcrArtifacts` 已做）。

---

## 3. 启动 OCR helper：完整命令与参数顺序（**最容易错的地方**）

### 3.1 权威依据：源码实际 argv 解析

`bin/ocr/relic-ocr-server.js` 第 9 行：

```js
const [translationsPath, ocrScriptPath, outputDirectory, captureScriptPath, paddlePythonPath, paddleWorkerPath, requestedPort] = process.argv.slice(2);
```

即 `process.argv` 是 `[node.exe, <server.js 自身>, 下面 6~7 个]`，`slice(2)` 才是业务参数。**顺序如下，不可调整**：

| argv 下标 | 名称 | 本项目取值 | 说明 |
|---|---|---|---|
| 0 | `translationsPath` | `<包根>\bin\ocr\afzh-items.js` | 用 `vm.runInNewContext` 加载，读取 `window.__ALECAFRAME_ZH_CN_ITEMS__` |
| 1 | `ocrScriptPath` | `<包根>\bin\ocr\relic-ocr-worker.ps1` | 每次本地 OCR 用 `powershell -File` 调它 |
| 2 | `outputDirectory` | `<包根>\state\RelicChineseOcr` | 审计日志、`latest-reward.json`、`latest-riven.json`、诊断截图 |
| 3 | `captureScriptPath` | `<包根>\bin\ocr\capture-warframe-screen.ps1` | 前台截图 |
| 4 | `paddlePythonPath` | `<包根>\bin\ocr\.tools\python311-portable\python.exe` | Paddle 用的 Python |
| 5 | `paddleWorkerPath` | `<包根>\bin\ocr\paddle-reward-worker.py` | Paddle 常驻 worker |
| 6（可选） | `requestedPort` | 不传即 **38147** | `Number(requestedPort \|\| 38147)` |

> ⚠️ 任务书里写的 `itemTranslationsPath, paddleWorkerPath, stateRoot, capturePath, paddlePython, rewardWorker`
> **与源码不符**。以上表（源码 `slice(2)`）为准；`bin/AlecaFrame-ZH.ps1` 的 `Start-OcrHelper` 已按正确顺序实现并实测通过。
>
> ⚠️ **`.tools` 相对关系**：server 给 Python 子进程注入
> `HOME/USERPROFILE/PADDLE_HOME = path.join(path.dirname(paddleWorkerPath), ".tools", "paddleocr-home")`
> （源码 ~361-368 行）。因此 `paddleWorkerPath` 必须落在 `bin\ocr\`，`.tools` 必须是 `bin\ocr\.tools`，
> 否则模型缓存路径与安装脚本装的位置不一致，Paddle 会去重新下载/找不到模型。

### 3.2 可直接抄的启动片段（与 `bin/AlecaFrame-ZH.ps1` 现状一致）

```powershell
$PkgRoot   = Split-Path -Parent $PSScriptRoot        # $PSScriptRoot = <包根>\bin
$OcrDir    = Join-Path $PkgRoot 'bin\ocr'
$StateDir  = Join-Path $PkgRoot 'state'
$OcrState  = Join-Path $StateDir 'RelicChineseOcr'
$NodeExe   = Join-Path $OcrDir '.tools\node\node.exe'  # 不存在时回退 Get-Command node
$PaddlePy  = Join-Path $OcrDir '.tools\python311-portable\python.exe'

New-Item -ItemType Directory -Force -Path $OcrState, (Join-Path $OcrDir '.tools\paddleocr-home') | Out-Null

# 每个路径单独加引号，再交给 Start-Process；见 §3.3 的实测说明
$nodeArgs = @(
    ('"' + (Join-Path $OcrDir 'relic-ocr-server.js')           + '"'),  # node 的第 1 个参数：脚本自身
    ('"' + (Join-Path $OcrDir 'afzh-items.js')                 + '"'),  # argv[0] translationsPath
    ('"' + (Join-Path $OcrDir 'relic-ocr-worker.ps1')          + '"'),  # argv[1] ocrScriptPath
    ('"' + $OcrState                                           + '"'),  # argv[2] outputDirectory
    ('"' + (Join-Path $OcrDir 'capture-warframe-screen.ps1')   + '"'),  # argv[3] captureScriptPath
    ('"' + $PaddlePy                                           + '"'),  # argv[4] paddlePythonPath
    ('"' + (Join-Path $OcrDir 'paddle-reward-worker.py')       + '"')   # argv[5] paddleWorkerPath
)

$oldPaddleHome = $env:PADDLE_HOME; $oldXdg = $env:XDG_CACHE_HOME
$oldHome = $env:HOME; $oldUserProfile = $env:USERPROFILE
try {
    # Paddle 2.x 用 XDG_CACHE_HOME/HOME 定位模型缓存，必须限制在包内，避免写用户目录
    $env:PADDLE_HOME     = Join-Path $OcrDir '.tools\paddleocr-home'
    $env:XDG_CACHE_HOME  = $env:PADDLE_HOME
    $env:HOME            = (Join-Path $OcrDir '.tools')
    $env:USERPROFILE     = (Join-Path $OcrDir '.tools')
    Start-Process -FilePath $NodeExe -ArgumentList $nodeArgs -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $OcrState 'helper.out.log') `
        -RedirectStandardError  (Join-Path $OcrState 'helper.err.log') | Out-Null
}
finally {
    $env:PADDLE_HOME = $oldPaddleHome; $env:XDG_CACHE_HOME = $oldXdg
    $env:HOME = $oldHome; $env:USERPROFILE = $oldUserProfile
}
```

启动前必须做的检查（顺序即依赖）：

1. `$NodeExe` 或 PATH 上的 `node` 存在 → 否则 `throw "未找到 Node.js，请先运行 安装OCR前置组件.cmd"`。
2. `relic-ocr-server.js`、`relic-ocr-worker.ps1`、`capture-warframe-screen.ps1`、`paddle-reward-worker.py`、`afzh-items.js`、`$PaddlePy` 六个文件都存在。
3. **先清理 38147 上的旧实例**：`Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 38147 -State Listen`，
   查 `Win32_Process` 确认 `Name -eq node.exe` 且 `CommandLine -like *relic-ocr-server.js*` 才 `Stop-Process`；
   被别的程序占用时**只告警、不要杀**。
4. 起进程后轮询 `GET http://127.0.0.1:38147/health`（40 × 250 ms，最多 10 s）。`/health` 只要 HTTP 层起来就返回
   `200 {"ready":true}`，**不代表 Paddle 模型已就绪**（Paddle 冷启动最长等 120 s，日志见 `helper.err.log`）。就绪失败不要阻塞启动。

### 3.3 参数引号：必须逐项加引号（实测结论）

`Start-Process -ArgumentList` 传**数组**时，PowerShell 只是用空格把元素拼起来，**不会**自动处理空格。
本机实测（同一 node 可执行文件、同一参数形态）：

- 未加引号：`C:\...\dir with space\nested\file one.js` → 被拆成 4 个 argv。
- 逐项加引号（如上）：6 个参数完整还原，且 `process.argv.slice(2)` 顺序与 §3.1 完全一致（实测输出见 §12.6）。

结论：**启动器必须用「元素已带双引号」的数组**（或自己拼一个带引号的单字符串）。
包路径含空格（例如装在 `C:\Program Files\...`）时，不加引号 100% 起不来。

---

## 4. HTTP 协议（**不得修改**：端口、端点、CORS）

- 监听：`server.listen(port, "127.0.0.1")`，默认 **38147**，仅本机回环。
- 启动成功时 stdout 输出：`AlecaFrame Chinese relic OCR listening on 38147`（启动器把它重定向到 `helper.out.log`）。
- 所有响应 JSON；统一带 `Access-Control-Allow-Origin: *`，`OPTIONS` 预检返回 204。

| 方法 | 路径 | 调用方 | 用途 |
|---|---|---|---|
| GET | `/health` | 启动器 | `{ready:true}` 存活探测 |
| GET | `/latest-reward` | `afzh-relic-overlay.js` | 最近 30 s 内识别到的奖励；过期/无数据返回 404 |
| GET | `/latest-riven` | （诊断用，当前前端未调用） | 最近裂罅诊断结果 |
| POST | `/audit` | `afzh-relic-ocr.js`、`afzh-riven-ocr.js`、`afzh-relic-overlay.js`、`afzh-relic-planner-cache.js` | 前端事件写入 `bridge-audit.log` |
| POST | `/audit-riven-native` | `afzh-riven-overlay.js` | 原生裂罅诊断 |
| POST | `/capture` | `afzh-relic-ocr.js` | 前台截图→本地 OCR |
| POST | `/capture-reward` | 官方 `relicOverlay/main.js` 补丁（兜底路径） | 请求奖励截图 |
| POST | `/capture-riven` | （诊断用） | 裂罅截图 |
| POST | `/process` | `afzh-relic-ocr.js` | 通用：截图→识别遗物页/奖励页 |
| POST | `/process-reward` | `afzh-relic-ocr.js` | 奖励页识别（Paddle，标题裁剪） |
| POST | `/process-refinement` | `afzh-relic-ocr.js` | 精炼推荐页识别 |
| POST | `/process-riven` | `afzh-riven-ocr.js` | 裂罅卡片识别 |
| POST | `/clear-reward` | `afzh-relic-ocr.js` | 清空奖励缓存 |
| POST | `/clear-riven` | （诊断用） | 清空裂罅缓存 |
| POST | `/publish-reward` | `afzh-relic-ocr.js` | 前端把识别结果回写服务端缓存 |
| POST | `/debug-process-reward` | （调试用） | 指定图片走奖励识别 |
| OPTIONS | 任意 | 浏览器 | CORS 预检 |

> 除 `/health` 外均为「页面 → 本机服务」调用。改端点名会同时破坏 4 个前端脚本 + 官方 `main.js` 补丁，**不要动**。

---

## 5. `settings.json`：位置、字段、默认值

- 路径：**`<包根>\AlecaFrame-ZH.settings.json`**（与 `Start-Chinese.cmd`、`bin/`、`src/` 同级；**刻意不放在
  `state/`**，这样清空 `state/` 不会丢用户选择）。
- 字段与默认值：

| JSON 路径 | 类型 | 默认 | 语义 |
|---|---|---|---|
| `relicOcr` | object | 缺省视为开启 | OCR 增强总开关的容器 |
| `relicOcr.enabled` | bool | **`true`** | `true` 注入 OCR 脚本并拉起 helper；`false` 不注入、不拉起（界面汉化保留） |

示例：

```json
{
  "relicOcr": {
    "enabled": true
  }
}
```

读取规则（启动器 `Get-OcrEnabled`，与上游一致）：

- 文件不存在 → **`true`**（装好前置即默认开启，兼容老用户）。
- 文件存在但解析失败 → 记日志后 **`true`**。
- `relicOcr.enabled` 明确为 `false` → 关闭。

写入规则：`启用/关闭中文遗物OCR.cmd` → 启动器 `Set-OcrEnabled`，**整文件重写**为上面结构，
编码 **UTF-8 无 BOM**（`New-Object System.Text.UTF8Encoding($false)`）。目前除 `relicOcr.enabled` 之外没有别的字段，
如果以后要加字段，需要同时改 `Set-OcrEnabled`（现在是全量覆盖，不是 merge）。

---

## 6. 三个根级 cmd 与开关语义

三个 `.cmd` 都是薄包装（`@echo off` + `chcp 65001` + `powershell -NoProfile -ExecutionPolicy Bypass -File ...`），
统一转发到启动器已实现的三个 action，**开关逻辑只有一处**（`bin/AlecaFrame-ZH.ps1`），cmd 里不重复写 JSON：

```bat
:: 安装OCR前置组件.cmd
@echo off
chcp 65001 >nul
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bin\AlecaFrame-ZH.ps1" -Action InstallOcr
echo.
pause
exit /b
```

```bat
:: 启用中文遗物OCR.cmd          :: 关闭中文遗物OCR.cmd
@echo off                        @echo off
chcp 65001 >nul                  chcp 65001 >nul
setlocal                         setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bin\AlecaFrame-ZH.ps1" -Action OcrOn
if errorlevel 1 pause            if errorlevel 1 pause
exit /b                          exit /b          :: 关闭版为 -Action OcrOff
```

语义：

| 命令 | 启动器 action | 行为 |
|---|---|---|
| `安装OCR前置组件.cmd` | `InstallOcr` | 以独立可见窗口执行 `scripts\Install-OcrPrerequisites.ps1`（下载 Python/Node、pip 装 Paddle、预热模型），完成后弹框提示"用 Start-Chinese.cmd 启动"。**幂等**：已装好的版本会跳过下载；加 `-Force` 才会重装 |
| `启用中文遗物OCR.cmd` | `OcrOn` | ① 写 `settings.json` `enabled=true`；② 前置齐全时：若当前是带校验绕过参数的中文会话 → 立即起 helper + 注入 + 重载渲染进程（本次生效）；否则只提示"下次 Start-Chinese.cmd 生效" |
| `关闭中文遗物OCR.cmd` | `OcrOff` | ① 写 `enabled=false`；② 停 38147 上的 node helper；③ 中文会话内 → 还原官方文件 + 重新只注入基础汉化 + 重载（本次生效） |

> 上游的 `Set-AlecaFrame-ZH-OcrMode.ps1` **未移植**：它的职责（写 `relicOcr.enabled`）已由启动器
> `Set-OcrEnabled` 承担，开关入口改为这三个 cmd。
> 若不经过启动器、想直接调安装脚本，等价命令是：
> `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\Install-OcrPrerequisites.ps1`。

---

## 7. `bin\ocr\.tools` 目录结构与安装内容

这是**唯一**存放 OCR 运行时（Python/Node/模型）的位置。安装脚本 `$toolsRoot = <包根>\bin\ocr\.tools`
（`$pkgRoot = Split-Path -Parent $PSScriptRoot`，脚本在 `scripts\` 下）。

```
<包根>\bin\ocr\.tools\
├─ python311-portable\          Python 3.11.9 embed-amd64
│  ├─ python.exe
│  ├─ python311._pth            python311.zip / . / Lib\site-packages / import site
│  └─ Lib\site-packages\        paddlepaddle==2.6.2, paddleocr==2.9.1, numpy==1.26.4, pillow==12.3.0
├─ node\                        Node.js v20.18.0 win-x64
│  └─ node.exe
├─ paddleocr-home\              Paddle 模型缓存根（PADDLE_HOME / XDG_CACHE_HOME / HOME / USERPROFILE 都指这里或其父）
│  └─ .paddleocr\whl\
│     ├─ det\ch\ch_PP-OCRv4_det_infer\{inference.pdmodel,inference.pdiparams}
│     ├─ rec\ch\ch_PP-OCRv4_rec_infer\{inference.pdmodel,inference.pdiparams}
│     └─ cls\ch_ppocr_mobile_v2.0_cls_infer\{inference.pdmodel,inference.pdiparams}
└─ downloads\                   python/node zip、get-pip.py（复用，避免重复下载）
```

安装脚本行为要点（改脚本时别破坏这些约束）：

- 下载源（面向国内网络）：Python `mirrors.huaweicloud.com`；Node `npmmirror.com`；`get-pip.py` 与 PyPI 用
  `mirrors.aliyun.com`；PaddlePaddle 用 `www.paddlepaddle.org.cn/packages/stable/cpu/`。
- 版本断言（`Test-PythonPackages`）：`paddle 2.6.2` / `paddleocr 2.9.1` / `numpy 1.26.4` / `PIL 12.3.0`，
  任一不符就重装；`-Force` 强制重装。
- 模型完整性：6 个文件（det/rec/cls 各 pdmodel+pdiparams）齐全才跳过初始化；缺失时执行
  `PaddleOCR(lang='ch', use_angle_cls=True, show_log=False, use_mkldnn=False)` 触发下载。
- 安装期间会临时把 `PADDLE_HOME/XDG_CACHE_HOME` 指到 `paddleocr-home`、把 `HOME/USERPROFILE` 指到 `.tools`，
  确保 pip/Paddle 不往用户目录写东西。
- 便携 Node **不要求**系统装 Node；但启动器 `Get-LocalNode` 允许回退到 PATH 上的 `node`（只要版本能跑 server 即可）。

---

## 8. 状态目录与运行期产物（**不得写 `%LOCALAPPDATA%\AlecaFrame-ZH-Patch`**）

### 8.1 `state\`（argv[2] `outputDirectory`）

```
<包根>\state\RelicChineseOcr\
├─ bridge-audit.log    审计日志（>5 MiB 时截断为最近 2 MiB）
├─ latest-reward.json  最近奖励 { rewards:[英文名...], updatedAt }
├─ latest-riven.json   最近裂罅诊断结果（诊断专用）
├─ helper.out.log      启动器重定向的 server stdout
├─ helper.err.log      启动器重定向的 server stderr（Paddle/进程错误看这里）
└─ *.png               诊断截图，按命名分组、每组只保留最近 20 张：
                       riven-raw-* / refinement-paddle-* / refinement-zh-* /
                       refinement-* / capture-* / relic-zh-* / foreground-*
```

### 8.2 包内其它生成物（**不落 `state\`，注意别误删**）

- `bin\ocr\item-translations.normalized.runtime.json`
  —— server 在每次调用本地 OCR worker 前**重写**它（`ensureTranslationsFile()`），内容 =
  `afzh-items.js` 中 `__ALECAFRAME_ZH_CN_ITEMS__` 的 `Object.entries()` JSON。
  **放在 worker 同目录是上游刻意设计**：launcher 清理/重建 `state\` 时不能把这个 OCR 输入一起删掉，
  否则识别会失败。它属于「可再生缓存」，可随时删除、下一次 OCR 自动重建。
- `logs\launcher.log`（启动器日志，非本子系统）。

### 8.3 `LOCALAPPDATA` 使用边界

- 本子系统**只读**一处：`%LOCALAPPDATA%\AlecaFrame\cachedData\json`（官方 AlecaFrame 的裂罅武器缓存，
  `relic-ocr-server.js` 用它把裂罅武器英文名对上号）。
- **不再有任何** `%LOCALAPPDATA%\AlecaFrame-ZH-Patch` 的读写。全仓库已 grep 确认：`bin/ocr/`、
  `scripts/Install-OcrPrerequisites.ps1`、三个 cmd 中 `AlecaFrame-ZH-Patch` 命中数为 0。

---

## 9. 依赖的 `window` 全局与浏览器存储

### 9.1 `window.__ALECAFRAME_ZH_CN_*` 清单

| 全局名 | 定义方 | 消费方 | 说明 |
|---|---|---|---|
| `__ALECAFRAME_ZH_CN_ITEMS__` | **基础 bundle** `alecaframe-zh-cn.js`（`= __AFCN_DICT__` shim）；服务器侧同名数据在 `bin/ocr/afzh-items.js` | `afzh-relic-overlay.js`（页面内）、`relic-ocr-server.js`（vm 里）、`src/relic-reward-fallback.js`（官方 main.js 补丁内） | **最关键依赖**。页面里必须由基础 bundle 提供；服务器里由 argv[0] 提供。缺失时：页面奖励名不翻译；server 启动即抛错 |
| `__ALECAFRAME_ZH_CN_REWARD_DUCATS__` | `afzh-relic-ducats.js` | `afzh-relic-overlay.js` | 静态杜卡德表，**必须比 overlay 先加载** |
| `__ALECAFRAME_ZH_CN_RELIC_OCR__` | `afzh-relic-ocr.js` | 自身（幂等守卫） | 防重复注入 |
| `__ALECAFRAME_ZH_CN_RIVEN_OCR__` | `afzh-riven-ocr.js` | 自身（幂等守卫） | |
| `__ALECAFRAME_ZH_CN_RELIC_OVERLAY__` | `afzh-relic-overlay.js` | 自身（幂等守卫） | |
| `__ALECAFRAME_ZH_CN_RIVEN_OVERLAY__` | `afzh-riven-overlay.js` | 自身（幂等守卫） | |
| `__ALECAFRAME_ZH_CN_RELIC_PLANNER_CACHE__` | `afzh-relic-planner-cache.js` | 自身（幂等守卫） | |
| `__ALECAFRAME_ZH_CN_CAPTURE_REWARD__` | `afzh-relic-ocr.js`（**background 页**） | `afzh-relic-overlay.js`（通过 `overwolf.windows.getMainWindow()` 拿 background 的 window）、官方 `main.js` 补丁 | 用 Overwolf 原生 `takeWindowsScreenshotByName` 抓游戏窗口 |
| `__ALECAFRAME_ZH_CN_OPEN_RIVEN_OVERLAY__` | `afzh-riven-ocr.js`（background） | 自身 | 打开裂罅浮层 |
| `__ALECAFRAME_ZH_CN_RIVEN_RESULT__` / `__ALECAFRAME_ZH_CN_RIVEN_ACTIVE_AT__` | `afzh-riven-ocr.js`（background） | `afzh-riven-overlay.js`（跨页读 main window） | 裂罅识别结果 + 时间戳 |
| `__ALECAFRAME_ZH_CN_RIVEN_CHAT_RESULT__` / `__ALECAFRAME_ZH_CN_RIVEN_CHAT_ACTIVE_AT__` | 同上 | 同上 | 聊天链接裂罅结果 |

### 9.2 `localStorage` 键（同页/跨页缓存，页面间不共享 localStorage，才配合上面的跨页全局）

| 键 | 写入方 | 读取方 |
|---|---|---|
| `__alecaframeZhCnRewardOverlayResult` | `afzh-relic-ocr.js` | `afzh-relic-ocr.js`、官方 `main.js` 补丁 |
| `__alecaframeZhCnRelicRecommendationContext` | `afzh-relic-ocr.js` | `afzh-relic-recommendation.js`、`afzh-relic-ocr.js` |
| `__alecaframeZhCnRelicPlannerCache` | `afzh-relic-planner-cache.js`、`afzh-relic-ocr.js` | 同名 + `afzh-relic-recommendation.js` |
| `__alecaframeZhCnRelicPlannerSession` | 同上 | 同上 |
| `__alecaframeZhCnRelicPlannerStarted` | 同上 | 同上 |
| `__alecaframeZhCnRelicRecommendation` | `afzh-relic-recommendation.js`（旧版兼容读取） | 自身 |
| `__alecaframeZhCnRivenOverlayResult` / `...Active` | `afzh-riven-ocr.js` | `afzh-riven-ocr.js`、`afzh-riven-overlay.js` |
| `__alecaframeZhCnRivenChatOverlayResult` / `...Active` | 同上 | 同上 |

### 9.3 依赖的 Overwolf / 插件原生能力（注入页面必须是 Overwolf 扩展页，否则脚本静默不工作）

- `window.plugin.get()`：`afzh-relic-ocr.js`、`afzh-relic-overlay.js`、`afzh-riven-overlay.js`、
  `afzh-relic-planner-cache.js`、`afzh-relic-recommendation.js`、`afzh-inventory-price-sync.js`
  （价格/仓库/native 截图等具体接口如 `getHugePriceList`）。
- `overwolf.media.takeWindowsScreenshotByName`：`afzh-relic-ocr.js`、`afzh-riven-ocr.js`
  （拿不到时 `installBridge()` 返回 false，遗物桥退化为不可用）。
- `overwolf.games.getRunningGameInfo`：`afzh-relic-ocr.js`、`afzh-riven-ocr.js`。
- `overwolf.windows.getMainWindow`：`afzh-relic-overlay.js`、`afzh-riven-overlay.js`
  （**同步返回**，不要再包 `.then()` —— 上游曾踩过这个坑）。

---

## 10. 官方 AlecaFrame 文件的原位补丁（除注入脚本外的两处）

### 10.1 `web/assets/js/relicOverlay/main.js`（奖励窗口中文回退，**必需**）

- 补丁源码在仓库里独立维护：`src/relic-reward-fallback.js`（112 行），由启动器 `Patch-RelicOverlayMain` 读入并插入。
- 幂等标记：`// ALECAFRAME_ZH_CN_REWARD_FALLBACK`（存在即跳过）。
- 插入锚点 1（在 `var relicWindowInitialized = false;` 之前插入整个 helper）。
- 插入锚点 2（正则，**只有一处**）：把英文失败分支改成先调 `alecaFrameZhCnStartRewardFallback()`，
  匹配式 `(?ms)^\s*console\.log\("Failed to get relic data: " \+ data\);\s*relicsApp\.error = true;\s*relicsApp\.errorMessage = data;`。
- 初始化加速：`setTimeout(() => {\n        sendPage("relic");\n    }, 2500);` → 立即启动回退 + `300 ms` 后 `sendPage("relic")`。
- 奖励截图优先走 background 的 `window.__ALECAFRAME_ZH_CN_CAPTURE_REWARD__`，兜底才 `POST /capture-reward`。
- 该文件被**原地改写**，所以必须在 `$script:ExtraOfficialFiles` 里登记，还原英文/关 OCR 时一起还原，
  否则官方页面会长期带着我们的补丁。
- 锚点在 **3.0.6 实测全部存在**（`test-inject.ps1` 第 [5] 步只读校验通过）。官方升级后若锚点缺失，启动器只告警、跳过补丁（OCR 奖励浮层会退化，但不会崩）。

### 10.2 `web/rivenOverlay.html` 的 Vue `:key` 补丁

- 正则：`(<div class="rivenDetailsStat (?:positive|negative)" v-for="stat in [^"]+")` → 追加 `:key="stat.description"`。
- 目的：OCR 短帧下属性行数变化时避免 Vue 复用旧 DOM 残留截断行。
- 详见 `bin/AlecaFrame-ZH.ps1` 的 `Patch-RivenOverlayHtml`。

---

## 11. 编码与行尾规范（**改文件前先看这一节**）

| 类型 | 编码 | 行尾 | 原因 |
|---|---|---|---|
| `*.ps1` | **UTF-8 with BOM** | CRLF | Windows PowerShell 5.1 对无 BOM 的 UTF-8 按 ANSI 解码，中文直接乱码/解析失败 |
| `*.js` | UTF-8 **无** BOM | LF | 注入浏览器；`node --check` 无 BOM 要求 |
| `*.py` | UTF-8 **无** BOM | LF | Python 3 默认 UTF-8 |
| `*.cmd` | UTF-8 **无** BOM | CRLF | `chcp 65001` 后按 UTF-8 读；BOM 在某些 cmd 版本会出现在第一行 |
| `*.json` / `*.md` | UTF-8 无 BOM | LF | 与 `.gitattributes` 一致 |

与 `.gitattributes` 对应：`*.ps1`/`*.cmd` → `eol=crlf`，`*.js`/`*.py`/`*.md`/`*.json` → `eol=lf`。

写文件的标准写法：

```powershell
# .ps1
[IO.File]::WriteAllText($path, $text, [Text.UTF8Encoding]::new($true))
# .js/.py
[IO.File]::WriteAllText($path, $text, [Text.UTF8Encoding]::new($false))
```

> 实测教训：本次移植过程中，一个**无 BOM 的 UTF-8 `.ps1`** 在 5.1 下被执行时，
> 中文串被当成 ANSI 解码后直接造成 `Unexpected token` 解析失败。这正是要求 `.ps1` 必须带 BOM 的原因。
> 注意：上游 MIOEU 的 `Invoke-AlecaFrame-RelicChineseOcr.ps1` 与 `Capture-AlecaFrame-WarframeScreen.ps1`
> 原本**没有** BOM，移植时已统一补成 BOM。

---

## 12. 语法与契约校验（已全部真跑，可复现）

运行环境：Windows PowerShell 5.1.26100、Node（`C:\Users\Power\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`）、
Python（`...\dependencies\python\python.exe`）。**没有**启动 OCR 服务、没有下载 Paddle 模型、没有启动 Overwolf。

### 12.1 `node --check`（11 个文件，全部 exit=0）

```powershell
Get-ChildItem repo\bin\ocr -Filter *.js | ForEach-Object { & $node --check $_.FullName; "exit=$LASTEXITCODE" }
```
| 文件 | exit |
|---|---|
| `relic-ocr-server.js` | 0 |
| `afzh-relic-ocr.js` / `afzh-riven-ocr.js` | 0 / 0 |
| `afzh-relic-overlay.js` / `afzh-riven-overlay.js` | 0 / 0 |
| `afzh-relic-ducats.js` / `afzh-relic-recommendation.js` | 0 / 0 |
| `afzh-relic-planner-cache.js` / `afzh-inventory-price-sync.js` / `afzh-inventory-images.js` | 0 / 0 / 0 |
| `afzh-items.js`（生成物） | 0 |

### 12.2 PowerShell 语法解析（3 个 `.ps1`，parseErrors=0）

```powershell
$errs = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$null, [ref]$errs)
$errs.Count   # 必须为 0
```
| 文件 | parseErrors |
|---|---|
| `bin\ocr\relic-ocr-worker.ps1` | 0 |
| `bin\ocr\capture-warframe-screen.ps1` | 0 |
| `scripts\Install-OcrPrerequisites.ps1` | 0 |

### 12.3 `python -m py_compile`（1 个 `.py`）

```powershell
& $python -m py_compile repo\bin\ocr\paddle-reward-worker.py   # exit=0（已删除生成的 __pycache__）
```

### 12.4 三个 `.cmd`：用 stub `powershell` 验证语法与实参传递（不产生副作用）

做法：把 `powershell.cmd` 桩放进临时 PATH，`cmd /c "<cmd> < nul"`，桩把 `%*` 写到文件。
| cmd | exit | 传递到 powershell 的实参 |
|---|---|---|
| `安装OCR前置组件.cmd` | 0 | `-NoProfile -ExecutionPolicy Bypass -File "<包根>\bin\AlecaFrame-ZH.ps1" -Action InstallOcr` |
| `启用中文遗物OCR.cmd` | 0 | `... -Action OcrOn` |
| `关闭中文遗物OCR.cmd` | 0 | `... -Action OcrOff` |

### 12.5 端到端注入/还原回归：`scripts\test-inject.ps1` → **全部通过（27 项 PASS）**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File repo\scripts\test-inject.ps1
```
覆盖：10 页面基础注入、幂等、9 个 OCR 脚本复制与页面注入、`relicOverlay/main.js` 回退补丁、
`rivenOverlay.html :key`、官方快照/还原、以及**真实 3.0.6 安装的只读锚点校验**。零 FAIL。

### 12.6 参数顺序实测（用真实路径 + 真实引号方式）

把 server 脚本换成 `dump.js`（只打印 `process.argv.slice(2)`），其余参数与 §3.2 完全一致，实测：

```
argv[0] translationsPath  = <包根>\bin\ocr\afzh-items.js
argv[1] ocrScriptPath     = <包根>\bin\ocr\relic-ocr-worker.ps1
argv[2] outputDirectory   = <包根>\state\RelicChineseOcr
argv[3] captureScriptPath = <包根>\bin\ocr\capture-warframe-screen.ps1
argv[4] paddlePythonPath  = <包根>\bin\ocr\.tools\python311-portable\python.exe
argv[5] paddleWorkerPath  = <包根>\bin\ocr\paddle-reward-worker.py
```
与 `relic-ocr-server.js` 第 9 行解构**逐项一致**。

### 12.7 服务端建表逻辑实测（vm 加载 `afzh-items.js`）

复刻 server 第 143-149 行（`fs.readFileSync` → `vm.runInNewContext({window:{}})`）后：

- `__ALECAFRAME_ZH_CN_ITEMS__` 存在，**24033** 条英文→中文映射；
- 抽样：`Forma Blueprint → "Forma 蓝图"`、`Ash Prime Neuroptics Blueprint → "Ash Prime 头部神经光元蓝图"`、
  `Maiming Strike → "致残突击"`、`Serration → "膛线"`。

---

## 13. 遗留风险与待办（给 Lead）

1. **`afzh-items.js` 是构建物**：发布前必须 `python src/build.py` 生成，否则 OCR 无法启动。
   建议把 `bin/ocr/afzh-items.js` 与 `bin/alecaframe-zh-cn.js` 同等对待（同为 build.py 产物）。
2. **`.gitignore` 建议补两条**（本 WP 写作用域不含 `.gitignore`，请 Lead 决定）：
   `bin/ocr/.tools/`（体积大、本机运行时）与 `bin/ocr/item-translations.normalized.runtime.json`（可再生缓存）。
3. **`scripts/package.py`**：`EXCLUDE_DIRS` 已含 `.tools`，但 `EXCLUDE_FILES` 只排除了 `build-unmatched.txt`；
   打包时会把 `item-translations.normalized.runtime.json` 一起塞进 zip（无害但脏），建议加入 `EXCLUDE_FILES`。
4. **路径含空格**：启动器必须保持 §3.2 的「逐项加引号」写法；回归时用含空格路径实测一次。
5. **Paddle 冷启动慢**：`/health` 只代表 HTTP 层就绪；Paddle 模型加载最长 120 s（`paddleStartupTimeoutMs`）。
   首次奖励识别可能超时失败一次，之后正常；排查看 `state\RelicChineseOcr\helper.err.log`。
6. **首次安装要联网**（Python/Node/Paddle 模型，数百 MB），镜像已面向国内；离线环境无法完成安装。
7. **官方版本升级风险**：`relicOverlay/main.js` 的 2 个锚点 + `rivenOverlay.html` 的模板正则强依赖 3.0.6。
   升级 AlecaFrame 后先跑 `scripts\test-inject.ps1`（只读检查真实安装锚点），再发版。
8. **`.tools` 与 `afzh-items.js` 缺失时是「静默降级」**：启动器会记日志并跳过 OCR，但界面汉化正常。
   用户侧表现为"没有中文奖励/裂罅"，排查顺序：`安装OCR前置组件.cmd` → `python src/build.py` → `Status.cmd` 看缺失项。
9. **未移植（非本 WP 范围，确认无引用）**：`Invoke-AlecaFrame-RivenChineseOcrDiagnosis.ps1`（裂罅诊断 CLI）、
   `Get-AlecaFrame-ZH-CompatibilityReport.ps1`、`Export-AlecaFrame-ZH-DiagnosticBundle.ps1`、
   `Test-AlecaFrame-NativeDllMutation.ps1`、`Set-AlecaFrame-ZH-OcrMode.ps1`。服务端的 `/latest-riven`、
   `/capture-riven`、`/clear-riven`、`/debug-process-reward` 因此暂无前端/CLI 调用方，但**保留**（诊断协议的一部分）。
10. **`afzh-relic-recommendation.js` / `afzh-riven-overlay.js` 内部各有一个 DOM 元素 id 仍是
    `alecaframe-zh-cn-*`**（`alecaframe-zh-cn-relic-recommendation-layout`、`alecaframe-zh-cn-riven-four-stat-style`）。
    它们是脚本自建样式节点的幂等守卫 id、文件内自洽，未改以保持与上游一致；全仓库无其他引用，不影响功能。
11. **LOCALAPPDATA 读取**：`relic-ocr-server.js` 仍读 `%LOCALAPPDATA%\AlecaFrame\cachedData\json`（官方缓存，只读）。
    这是上游设计，属"读取官方数据"而非"写补丁状态"，如后续要彻底移除 LOCALAPPDATA 依赖需单独评估裂罅武器名匹配。
12. **开关语义差异**：上游改设置后只在下一次启动生效；本项目 `OcrOn/OcrOff` 在「已带校验绕过参数的中文会话」里会
    即时重载渲染进程。文档/客服话术要统一：多数情况是"下次启动生效"，活动会话内是"立即生效"。

---

### 附：移植时的改动审计（与原文件的全部差异）

1. `bin/ocr/*.js`、`*.py`、`*.ps1`：**仅**在文件头加 2 行出处/路径注释；逻辑、协议、全局名、端点、端口一字未改。
2. `scripts/Install-OcrPrerequisites.ps1`：
   - `$toolsRoot = Join-Path $PSScriptRoot ".tools"` → `$pkgRoot = Split-Path -Parent $PSScriptRoot; $toolsRoot = Join-Path $pkgRoot "bin\ocr\.tools"`；
   - 收尾提示 `运行 Install.cmd 创建快捷方式` → `运行 Start-Chinese.cmd 启动中文界面`；
   - 补 UTF-8 BOM。
3. 文件改名：14 个源文件 → §1 表中的新名字（去掉 `alecaframe-zh-cn-` 前缀 / `AlecaFrame` 前缀）。
4. 新增：3 个根级 `.cmd`、本文件。
5. **未改**：`bin/AlecaFrame-ZH.ps1`、`src/`、`dict/`、`README`、`.gitattributes`、`.gitignore`、`scripts/package.py`。
