#requires -Version 5.1
<#
  AlecaFrame-ZH 诊断包导出
  把「出问题机器」上的日志、环境、状态打包成一个 zip，方便回传排查。

  用法：
    powershell -ExecutionPolicy Bypass -File scripts\Export-Diagnostics.ps1
    powershell -ExecutionPolicy Bypass -File scripts\Export-Diagnostics.ps1 -OutputPath "D:\diag.zip"

  默认输出：桌面\AlecaFrame-ZH-Diagnostics-<时间>.zip
#>
[CmdletBinding()]
param(
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Continue"
$PkgRoot = Split-Path -Parent $PSScriptRoot
$AppId = "afmcagbpgggkpdkokjhjkllpegnadmkignlonpjm"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not $OutputPath) {
    $desktop = [Environment]::GetFolderPath("Desktop")
    if (-not $desktop) { $desktop = $PkgRoot }
    $OutputPath = Join-Path $desktop "AlecaFrame-ZH-Diagnostics-$stamp.zip"
}

$work = Join-Path $env:TEMP "afzh-diag-$stamp"
New-Item -ItemType Directory -Force -Path $work | Out-Null
$notes = New-Object System.Collections.Generic.List[string]

function Add-Note {
    param([string]$Text)
    $notes.Add($Text)
    Write-Host $Text
}

function Add-TextFile {
    param([string]$Name, [string]$Content)
    $p = Join-Path $work $Name
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $p) | Out-Null
    [System.IO.File]::WriteAllText($p, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function Add-TailFile {
    param([string]$Source, [string]$Name, [int]$Lines = 400)
    if (-not (Test-Path -LiteralPath $Source)) { return $false }
    try {
        $tail = @(Get-Content -LiteralPath $Source -Tail $Lines -Encoding UTF8 -ErrorAction Stop)
        $dst = Join-Path $work $Name
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
        # 粗粒度脱敏：令牌/密码/邮箱
        $scrubbed = $tail | ForEach-Object {
            $_ -replace '(?i)(token|password|passwd|authorization|secret|email)\s*[=:]\s*\S+', '$1=<redacted>'
        }
        [System.IO.File]::WriteAllLines($dst, $scrubbed, (New-Object System.Text.UTF8Encoding($false)))
        return $true
    } catch { return $false }
}

function Get-CmdOutput {
    param([string]$FilePath, [string[]]$Arguments)
    try {
        $out = & $FilePath @Arguments 2>&1 | Out-String
        return $out.Trim()
    } catch { return "ERROR: $($_.Exception.Message)" }
}

# ---------------- 1. 环境信息 ----------------
Write-Host "[1/5] 收集环境信息 ..."
$envLines = New-Object System.Collections.Generic.List[string]
$envLines.Add("生成时间: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz"))
$envLines.Add("VERSION: " + $(if (Test-Path (Join-Path $PkgRoot "VERSION")) { (Get-Content (Join-Path $PkgRoot "VERSION") -Raw).Trim() } else { "unknown" }))
$envLines.Add("包目录: $PkgRoot")
$envLines.Add("系统: " + [System.Environment]::OSVersion.VersionString)
$envLines.Add("PowerShell: " + $PSVersionTable.PSVersion.ToString())
$envLines.Add("区域/语言: " + (Get-Culture).Name + " / " + (Get-UICulture).Name)
$envLines.Add("64位进程: " + [Environment]::Is64BitProcess)
$envLines.Add("")

# git（如果是 clone）
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd -and (Test-Path (Join-Path $PkgRoot ".git"))) {
    $envLines.Add("git HEAD: " + (Get-CmdOutput $gitCmd.Source @("-C", $PkgRoot, "log", "-1", "--pretty=%H %s")))
    $envLines.Add("git status: " + ((Get-CmdOutput $gitCmd.Source @("-C", $PkgRoot, "status", "--porcelain")) -replace "`r?`n", " | "))
} else {
    # 没装 git 时也能读到版本：直接读 .git 里的引用
    $gitDir = Join-Path $PkgRoot ".git"
    if (Test-Path $gitDir) {
        try {
            $head = (Get-Content (Join-Path $gitDir "HEAD") -Raw -Encoding UTF8).Trim()
            if ($head -match '^ref:\s*(.+)$') {
                $refFile = Join-Path $gitDir ($Matches[1] -replace "/", "\")
                if (Test-Path $refFile) { $envLines.Add("git HEAD: " + (Get-Content $refFile -Raw).Trim() + " (from " + $Matches[1] + ")") }
                else { $envLines.Add("git HEAD: " + $head) }
            } else {
                $envLines.Add("git HEAD: " + $head)
            }
        } catch { $envLines.Add("git HEAD: 读取失败") }
    } else {
        $envLines.Add("git HEAD: 非 git 工作副本")
    }
}
$envLines.Add("")

# Overwolf / AlecaFrame 版本
$owRoot = $null
foreach ($k in @("HKLM:\SOFTWARE\WOW6432Node\Overwolf", "HKCU:\Software\Overwolf", "HKLM:\SOFTWARE\Overwolf")) {
    try { $v = (Get-ItemProperty -LiteralPath $k -ErrorAction Stop).InstallFolder; if ($v) { $owRoot = $v.TrimEnd("\"); break } } catch { }
}
$envLines.Add("Overwolf 安装目录(注册表): " + $(if ($owRoot) { $owRoot } else { "未找到" }))
if ($owRoot -and (Test-Path $owRoot)) {
    $vers = Get-ChildItem -LiteralPath $owRoot -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^\d+\.\d+' } | Select-Object -ExpandProperty Name
    $envLines.Add("Overwolf 版本目录: " + ($vers -join ", "))
}
$extRoot = Join-Path $env:LOCALAPPDATA "Overwolf\Extensions\$AppId"
if (Test-Path $extRoot) {
    $appVers = Get-ChildItem -LiteralPath $extRoot -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
    $envLines.Add("AlecaFrame 扩展版本: " + ($appVers -join ", "))
    foreach ($av in $appVers) {
        $mf = Join-Path $extRoot "$av\manifest.json"
        if (Test-Path $mf) {
            try { $envLines.Add("  $av manifest.version: " + (Get-Content $mf -Raw -Encoding UTF8 | ConvertFrom-Json).meta.version) } catch { }
        }
    }
} else {
    $envLines.Add("AlecaFrame 扩展目录不存在: $extRoot")
}
$opk = Join-Path $env:LOCALAPPDATA "Overwolf\PackagesCache\$AppId"
if (Test-Path $opk) {
    $opks = Get-ChildItem -LiteralPath $opk -Recurse -Filter "app.opk" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
    $envLines.Add("app.opk 缓存: " + $(if ($opks) { $opks -join "; " } else { "无（依赖本地快照）" }))
} else {
    $envLines.Add("app.opk 缓存: 无")
}
$envLines.Add("")

# 构建产物
$bundle = Join-Path $PkgRoot "bin\alecaframe-zh-cn.js"
if (Test-Path $bundle) {
    $envLines.Add("bundle: " + (Get-Item $bundle).Length + " bytes  sha256=" + (Get-FileHash $bundle -Algorithm SHA256).Hash.Substring(0, 16))
} else {
    $envLines.Add("bundle: 缺失！(bin\alecaframe-zh-cn.js)")
}
$itemsJs = Join-Path $PkgRoot "bin\ocr\afzh-items.js"
$envLines.Add("ocr items: " + $(if (Test-Path $itemsJs) { (Get-Item $itemsJs).Length.ToString() + " bytes" } else { "缺失" }))
$envLines.Add("")

# 注入状态
$verDir = $null
if (Test-Path $extRoot) {
    $verDir = (Get-ChildItem -LiteralPath $extRoot -Directory | Where-Object { Test-Path (Join-Path $_.FullName "manifest.json") } |
        Sort-Object { try { [version]$_.Name } catch { [version]"0.0" } } -Descending | Select-Object -First 1)
}
if ($verDir) {
    $envLines.Add("当前 AlecaFrame 目录: " + $verDir.FullName)
    foreach ($page in @("main.html", "background.html", "relicOverlay.html", "rivenOverlay.html")) {
        $f = Join-Path $verDir.FullName "web\$page"
        if (Test-Path $f) {
            $c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
            $envLines.Add(("  {0,-24} 已注入={1} charset={2}" -f $page, $c.Contains("alecaframe-zh-cn.js"), ($c -match "(?i)charset\s*=")))
        }
    }
    $relicMain = Join-Path $verDir.FullName "web\assets\js\relicOverlay\main.js"
    $envLines.Add("  relicOverlay/main.js 奖励回退补丁: " + $(if ((Test-Path $relicMain) -and ([System.IO.File]::ReadAllText($relicMain, [System.Text.Encoding]::UTF8)).Contains("ALECAFRAME_ZH_CN_REWARD_FALLBACK")) { "已应用" } else { "未应用" }))
} else {
    $envLines.Add("未找到已安装的 AlecaFrame 扩展目录")
}
$envLines.Add("")

# 设置
$settings = Join-Path $PkgRoot "AlecaFrame-ZH.settings.json"
$envLines.Add("OCR 设置: " + $(if (Test-Path $settings) { (Get-Content $settings -Raw -Encoding UTF8) } else { "文件不存在（默认开启）" }))
$envLines.Add("")

# OCR 运行时
$tools = Join-Path $PkgRoot "bin\ocr\.tools"
$envLines.Add("OCR 工具目录存在: " + (Test-Path $tools))
$nodeExe = Join-Path $tools "node\node.exe"
$pyExe = Join-Path $tools "python311-portable\python.exe"
$envLines.Add("便携 Node: " + $(if (Test-Path $nodeExe) { (Get-CmdOutput $nodeExe @("--version")) } else { "未安装" }))
$envLines.Add("便携 Python: " + $(if (Test-Path $pyExe) { (Get-CmdOutput $pyExe @("--version")) } else { "未安装" }))
if (Test-Path $pyExe) {
    $envLines.Add("PaddleOCR 版本: " + (Get-CmdOutput $pyExe @("-c", "import paddle,paddleocr;print(paddle.__version__, paddleocr.__version__)")))
}
$models = @(
    ".paddleocr\whl\det\ch\ch_PP-OCRv4_det_infer\inference.pdmodel",
    ".paddleocr\whl\rec\ch\ch_PP-OCRv4_rec_infer\inference.pdmodel",
    ".paddleocr\whl\cls\ch_ppocr_mobile_v2.0_cls_infer\inference.pdmodel"
)
foreach ($root in @($tools, (Join-Path $tools "paddleocr-home"))) {
    $found = @($models | Where-Object { Test-Path (Join-Path $root $_) }).Count
    $envLines.Add("模型目录 $root : $found/3")
}
$portConn = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort 38147 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
$envLines.Add("OCR 服务(38147): " + $(if ($portConn) { "运行中 pid=" + $portConn.OwningProcess } else { "未运行" }))
$envLines.Add("")

# 快捷方式
$wsh = New-Object -ComObject WScript.Shell
$desktopDir = [Environment]::GetFolderPath("Desktop")
$envLines.Add("桌面快捷方式:")
Get-ChildItem -LiteralPath $desktopDir -Filter "AlecaFrame*.lnk" -ErrorAction SilentlyContinue | ForEach-Object {
    $s = $wsh.CreateShortcut($_.FullName)
    $envLines.Add("  " + $_.Name + " -> " + $s.TargetPath)
}

Add-TextFile "env.txt" ($envLines -join "`r`n")

# ---------------- 2. 启动器状态 ----------------
Write-Host "[2/5] 收集启动器状态 ..."
$launcher = Join-Path $PkgRoot "bin\AlecaFrame-ZH.ps1"
if (Test-Path $launcher) {
    $statusOut = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $launcher -Action Status -NoGui 2>&1 | Out-String
    Add-TextFile "status.txt" $statusOut.Trim()
}

# ---------------- 3. 日志 ----------------
Write-Host "[3/5] 收集日志 ..."
$logDir = Join-Path $PkgRoot "logs"
$collected = 0
if (Add-TailFile (Join-Path $logDir "launcher.log") "logs\launcher.log" 800) { $collected++ }
if (Add-TailFile (Join-Path $logDir "ocr-install.log") "logs\ocr-install.log" 600) { $collected++ }

$ocrState = Join-Path $PkgRoot "state\RelicChineseOcr"
foreach ($f in @("helper.out.log", "helper.err.log", "bridge-audit.log")) {
    if (Add-TailFile (Join-Path $ocrState $f) ("logs\RelicChineseOcr\" + $f) 600) { $collected++ }
}
foreach ($f in @("latest-reward.json", "latest-riven.json")) {
    $src = Join-Path $ocrState $f
    if (Test-Path $src) { try { Copy-Item $src (Join-Path $work "logs\RelicChineseOcr\$f") -Force -ErrorAction SilentlyContinue; $collected++ } catch { } }
}
$session = Join-Path $PkgRoot "state\last-session.json"
if (Test-Path $session) { try { Copy-Item $session (Join-Path $work "logs\last-session.json") -Force; $collected++ } catch { } }

# Overwolf 自身日志（每个窗口取最近一次会话的尾部）
$owLogs = Join-Path $env:LOCALAPPDATA "Overwolf\Log\Apps\AlecaFrame"
if (Test-Path $owLogs) {
    foreach ($name in @("BackGround.html.log", "MainWindow.html.log", "RelicOverlay.html.log", "RivenOverlay.html.log", "RelicRecommendation.html.log", "TradeFinishedNotification.html.log", "InGameNotification.html.log")) {
        if (Add-TailFile (Join-Path $owLogs $name) ("overwolf\" + $name) 500) { $collected++ }
    }
    # trace 日志里含扩展加载/校验结果
    $trace = Get-ChildItem (Join-Path $env:LOCALAPPDATA "Overwolf\Log") -Filter "Trace_*.log" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($trace -and (Add-TailFile $trace.FullName ("overwolf\" + $trace.Name) 500)) { $collected++ }
}
Add-Note "日志文件收集数: $collected"

# ---------------- 4. 页面清单 ----------------
Write-Host "[4/5] 收集页面注入清单 ..."
if ($verDir) {
    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($page in @("main.html", "AFBuilds.html", "InGameNotification.html", "relicOverlay.html", "relicRecommendation.html", "rivenOverlay.html", "SquadMakingMain.html", "SquadMakingSquad.html", "tradeFinishedNotification.html", "background.html")) {
        $f = Join-Path $verDir.FullName "web\$page"
        if (-not (Test-Path $f)) { $lines.Add("$page`t缺失"); continue }
        $c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
        $tags = ([regex]::Matches($c, 'assets/js/([a-z0-9\-]+\.js)')) | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
        $lines.Add(("{0}`tcharset={1}`t注入脚本={2}" -f $page, ($c -match "(?i)charset\s*="), ($tags -join ",")))
    }
    Add-TextFile "injection.txt" ($lines -join "`r`n")
}

# ---------------- 5. 打包 ----------------
Write-Host "[5/5] 打包 ..."
Add-TextFile "README.txt" @"
AlecaFrame-ZH 诊断包
生成时间: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
包目录: $PkgRoot

内容说明:
  env.txt            环境信息（系统 / Overwolf / AlecaFrame 版本 / 注入状态 / OCR 组件 / 快捷方式）
  status.txt         启动器 Status 的输出
  injection.txt      10 个页面的注入清单（是否注入、charset、注入了哪些脚本）
  logs\              本项目日志（launcher.log / ocr-install.log / OCR 运行日志 / Overwolf 窗口日志）
  overwolf\          Overwolf 自己的窗口日志尾部（含扩展加载与校验信息）

注意: 日志里可能包含 Warframe 用户名、Warframe.Market 用户名等；已对 token/password/email 做粗粒度脱敏。
      如仍有敏感内容，回传前请自行检查。
"@

$zip = $OutputPath
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path (Join-Path $work "*") -DestinationPath $zip -CompressionLevel Optimal -Force
Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue

if (Test-Path -LiteralPath $zip) {
    $size = [math]::Round((Get-Item $zip).Length / 1KB, 1)
    Write-Host ""
    Write-Host "诊断包已生成：$zip  ($size KB)" -ForegroundColor Green
    Write-Host "把这个 zip 发给维护者即可。" -ForegroundColor Green
    try { Start-Process explorer.exe -ArgumentList "/select,`"$zip`"" | Out-Null } catch { }
    exit 0
} else {
    Write-Host "诊断包生成失败：$zip" -ForegroundColor Red
    exit 1
}
