#requires -Version 5.1
<#
  AlecaFrame 简体中文补丁 - 启动器
  用法：
    AlecaFrame-ZH.ps1 -Action Start     中文模式启动（关闭 Overwolf -> 还原官方文件 -> 带校验绕过参数启动 -> 注入汉化 -> 重载应用）
    AlecaFrame-ZH.ps1 -Action Restore   恢复英文（关闭 Overwolf -> 还原官方文件 -> 正常启动）
    AlecaFrame-ZH.ps1 -Action Toggle    在已带参数启动的会话内快速切换中/英（不重启 Overwolf）
    AlecaFrame-ZH.ps1 -Action Status    查看当前状态
    AlecaFrame-ZH.ps1 -Action Refresh   在当前中文会话内重新注入最新词库
    AlecaFrame-ZH.ps1 -Action OcrOn     开启中文 OCR 增强（遗物/裂罅识别）
    AlecaFrame-ZH.ps1 -Action OcrOff    关闭中文 OCR 增强
    AlecaFrame-ZH.ps1 -Action InstallOcr 安装 OCR 前置组件（Python/Node/PaddleOCR）
    AlecaFrame-ZH.ps1 -Action InstallShortcuts  在桌面创建快捷方式
#>
param(
    [ValidateSet("Start", "Restore", "Toggle", "Status", "InstallShortcuts", "Refresh", "OcrOn", "OcrOff", "InstallOcr")]
    [string]$Action = "Status",
    [switch]$NoGui
)

$ErrorActionPreference = "Stop"
$script:NoGui = [bool]$NoGui

$script:AppId = "afmcagbpgggkpdkokjhjkllpegnadmkignlonpjm"
$script:Pages = @(
    "main.html",
    "AFBuilds.html",
    "InGameNotification.html",
    "relicOverlay.html",
    "relicRecommendation.html",
    "rivenOverlay.html",
    "SquadMakingMain.html",
    "SquadMakingSquad.html",
    "tradeFinishedNotification.html",
    "background.html"
)
# 除页面外，OCR 还会原地改写这个官方脚本（遗物奖励中文回退），还原时必须一起恢复
$script:ExtraOfficialFiles = @(
    "assets/js/relicOverlay/main.js"
)
$script:ZhJsRel = "assets/js/alecaframe-zh-cn.js"
$script:ScriptTag = '    <script src="assets/js/alecaframe-zh-cn.js"></script>'
$script:FlagArgs = @(
    "--ow-disable-features=extension-validation,read-opk-from-memory",
    "--ow-enable-features=force-validation-report-only"
)

# OCR 增强：脚本来自 bin\ocr\，运行时会复制到 web\assets\js\ 后按页面注入
$script:OcrScripts = @(
    "afzh-relic-ocr.js",
    "afzh-riven-ocr.js",
    "afzh-riven-overlay.js",
    "afzh-relic-ducats.js",
    "afzh-relic-overlay.js",
    "afzh-relic-recommendation.js",
    "afzh-relic-planner-cache.js",
    "afzh-inventory-price-sync.js",
    "afzh-inventory-images.js"
)
$script:OcrInjections = @(
    @{ Page = "background.html"; Scripts = @("afzh-relic-ocr.js", "afzh-riven-ocr.js") },
    @{ Page = "rivenOverlay.html"; Scripts = @("afzh-riven-overlay.js") },
    @{ Page = "relicOverlay.html"; Scripts = @("afzh-relic-ducats.js", "afzh-relic-overlay.js") },
    @{ Page = "relicRecommendation.html"; Scripts = @("afzh-relic-recommendation.js") },
    @{ Page = "main.html"; Scripts = @("afzh-relic-planner-cache.js", "afzh-inventory-price-sync.js", "afzh-inventory-images.js") }
)
$script:OcrStateSub = "RelicChineseOcr"
$script:OcrPort = 38147

$script:PkgRoot = Split-Path -Parent $PSScriptRoot
$script:BinDir = $PSScriptRoot
$script:OcrDir = Join-Path $script:BinDir "ocr"
$script:StateDir = Join-Path $script:PkgRoot "state"
$script:OcrStateDir = Join-Path $script:StateDir $script:OcrStateSub
$script:LogDir = Join-Path $script:PkgRoot "logs"
$script:LogFile = Join-Path $script:LogDir "launcher.log"
$script:SettingsFile = Join-Path $script:PkgRoot "AlecaFrame-ZH.settings.json"

New-Item -ItemType Directory -Force -Path $script:StateDir | Out-Null
New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null

function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -LiteralPath $script:LogFile -Value $line -Encoding UTF8
    Write-Host $line
}

function Show-Message {
    param([string]$Text, [string]$Title = "AlecaFrame-ZH")
    if ($script:NoGui) { Write-Host $Text; return }
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($Text, $Title, "OK", "Information") | Out-Null
    } catch {
        Write-Host $Text
    }
}

function Show-Error {
    param([string]$Text, [string]$Title = "AlecaFrame-ZH")
    if ($script:NoGui) { Write-Host ("ERROR: " + $Text); return }
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($Text, $Title, "OK", "Error") | Out-Null
    } catch {
        Write-Host $Text
    }
}

function Get-RegValue {
    param([string]$Path, [string]$Name)
    try { return (Get-ItemProperty -LiteralPath $Path -Name $Name -ErrorAction Stop).$Name } catch { return $null }
}

function Find-OverwolfRoot {
    $candidates = New-Object System.Collections.Generic.List[string]
    $regValues = @(
        (Get-RegValue "HKLM:\SOFTWARE\WOW6432Node\Overwolf" "InstallFolder"),
        (Get-RegValue "HKCU:\Software\Overwolf" "InstallFolder"),
        (Get-RegValue "HKLM:\SOFTWARE\Overwolf" "InstallFolder")
    )
    foreach ($v in $regValues) { if ($v) { $candidates.Add($v) } }
    $proc = Get-Process -Name Overwolf -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc -and $proc.Path) {
        $dir = Split-Path -Parent $proc.Path
        $candidates.Add($dir)
        $candidates.Add((Split-Path -Parent $dir))
    }
    $candidates.Add("C:\Program Files (x86)\Overwolf")
    $candidates.Add("C:\Program Files\Overwolf")
    $candidates.Add((Join-Path $env:LOCALAPPDATA "Overwolf"))
    foreach ($c in $candidates) {
        if (-not $c) { continue }
        $c = $c.TrimEnd("\")
        if ((Test-Path (Join-Path $c "OverwolfLauncher.exe")) -and (Get-OverwolfVersionDir -Root $c)) { return $c }
    }
    return $null
}

function Get-OverwolfVersionDir {
    param([string]$Root)
    $dirs = Get-ChildItem -LiteralPath $Root -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^\d+\.\d+' -and (Test-Path (Join-Path $_.FullName "Overwolf.exe")) }
    if (-not $dirs) { return $null }
    return ($dirs | Sort-Object { try { [version]$_.Name } catch { [version]"0.0" } } -Descending | Select-Object -First 1)
}

function Get-AppVersionDir {
    $extRoot = Join-Path $env:LOCALAPPDATA "Overwolf\Extensions\$script:AppId"
    if (-not (Test-Path $extRoot)) { throw "未找到 AlecaFrame 扩展目录：$extRoot。请先在 Overwolf 中安装并打开一次官方 AlecaFrame。" }
    $dirs = Get-ChildItem -LiteralPath $extRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName "manifest.json") }
    if (-not $dirs) { throw "AlecaFrame 扩展目录为空：$extRoot" }
    $latest = $dirs | Sort-Object { try { [version]$_.Name } catch { [version]"0.0" } } -Descending | Select-Object -First 1
    return $latest
}

function Get-OfficialSource {
    param([string]$AppVersion)
    $opk = Join-Path $env:LOCALAPPDATA "Overwolf\PackagesCache\$script:AppId\$AppVersion\app.opk"
    if (Test-Path $opk) { return @{ Kind = "opk"; Path = $opk } }
    $backup = Join-Path $script:StateDir "official\$AppVersion"
    if (Test-Path (Join-Path $backup "web")) { return @{ Kind = "dir"; Path = $backup } }
    return $null
}

function Save-OfficialSnapshot {
    param([string]$AppVersion, [string]$VersionPath)
    $backup = Join-Path $script:StateDir "official\$AppVersion"
    if (Test-Path (Join-Path $backup "web")) { return }
    Write-Log "首次运行：保存官方文件快照 -> $backup"
    foreach ($page in $script:Pages) {
        $src = Join-Path $VersionPath "web\$page"
        if (-not (Test-Path $src)) { continue }
        $dst = Join-Path $backup "web\$page"
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
        Copy-Item -LiteralPath $src -Destination $dst -Force
    }
    foreach ($rel in $script:ExtraOfficialFiles) {
        $src = Join-Path $VersionPath ("web\" + ($rel -replace "/", "\"))
        if (-not (Test-Path $src)) { continue }
        $dst = Join-Path $backup ("web\" + ($rel -replace "/", "\"))
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
        Copy-Item -LiteralPath $src -Destination $dst -Force
    }
}

function Test-CurrentFilesPristine {
    param([string]$VersionPath)
    foreach ($page in $script:Pages) {
        $file = Join-Path $VersionPath "web\$page"
        if (-not (Test-Path $file)) { continue }
        $content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
        if ($content.Contains("alecaframe-zh-cn.js")) { return $false }
    }
    $main = Join-Path $VersionPath "web\assets\js\relicOverlay\main.js"
    if ((Test-Path $main) -and ([System.IO.File]::ReadAllText($main, [System.Text.Encoding]::UTF8)).Contains("ALECAFRAME_ZH_CN_REWARD_FALLBACK")) {
        return $false
    }
    return $true
}

function Restore-OfficialFiles {
    param([string]$AppVersion, [string]$VersionPath)
    $source = Get-OfficialSource -AppVersion $AppVersion
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if ($source) {
        foreach ($page in $script:Pages) {
            $entryName = "web/$page"
            $target = Join-Path $VersionPath "web\$page"
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
            if ($source.Kind -eq "opk") {
                $zip = [System.IO.Compression.ZipFile]::OpenRead($source.Path)
                try {
                    $entry = $zip.Entries | Where-Object { $_.FullName -eq $entryName } | Select-Object -First 1
                    if (-not $entry) { throw "官方包中缺少 $entryName" }
                    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
                } finally { $zip.Dispose() }
            } else {
                $src = Join-Path $source.Path "web\$page"
                if (-not (Test-Path $src)) { throw "本地快照缺少 web\$page" }
                Copy-Item -LiteralPath $src -Destination $target -Force
            }
        }
        foreach ($rel in $script:ExtraOfficialFiles) {
            $entryName = "web/$rel"
            $target = Join-Path $VersionPath ("web\" + ($rel -replace "/", "\"))
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
            if ($source.Kind -eq "opk") {
                $zip = [System.IO.Compression.ZipFile]::OpenRead($source.Path)
                try {
                    $entry = $zip.Entries | Where-Object { $_.FullName -eq $entryName } | Select-Object -First 1
                    if (-not $entry) { throw "官方包中缺少 $entryName" }
                    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
                } finally { $zip.Dispose() }
            } else {
                $src = Join-Path $source.Path ("web\" + ($rel -replace "/", "\"))
                if (-not (Test-Path $src)) { throw "本地快照缺少 web\$rel" }
                Copy-Item -LiteralPath $src -Destination $target -Force
            }
        }
        if ($source.Kind -eq "opk") { Save-OfficialSnapshot -AppVersion $AppVersion -VersionPath $VersionPath }
        Write-Log "已还原官方文件（来源：$($source.Kind)）"
    } else {
        # 既没有 opk 缓存也没有快照：只有在当前文件仍是官方原版时才允许就地建立快照
        if (-not (Test-CurrentFilesPristine -VersionPath $VersionPath)) {
            throw "找不到官方文件来源（opk 缓存与本地快照均缺失），且当前文件已被汉化。请在 Overwolf 中重装 AlecaFrame。"
        }
        Save-OfficialSnapshot -AppVersion $AppVersion -VersionPath $VersionPath
        Write-Log "无 opk 缓存：已将当前官方文件保存为快照"
    }
    # 清理注入到官方目录的脚本文件
    $jsDir = Join-Path $VersionPath "web\assets\js"
    foreach ($name in (@("alecaframe-zh-cn.js") + $script:OcrScripts)) {
        $p = Join-Path $jsDir $name
        if (Test-Path $p) { Remove-Item -LiteralPath $p -Force }
    }
}

function Stop-Overwolf {
    Write-Log "关闭 Overwolf..."
    $names = @("Overwolf", "OverwolfBrowser", "OverwolfHelper", "OverwolfHelper64", "OverwolfCrashHandler")
    for ($i = 0; $i -lt 20; $i++) {
        $procs = Get-Process -Name $names -ErrorAction SilentlyContinue
        if (-not $procs) { return }
        $procs | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    }
    Start-Sleep -Seconds 2
}

function Start-Overwolf {
    param([switch]$WithValidationBypass)
    $root = Find-OverwolfRoot
    $verDir = Get-OverwolfVersionDir -Root $root
    $exe = Join-Path $verDir.FullName "Overwolf.exe"
    if ($WithValidationBypass) {
        Write-Log "启动 Overwolf（带校验绕过参数）"
        Start-Process -FilePath $exe -ArgumentList $script:FlagArgs | Out-Null
    } else {
        Write-Log "启动 Overwolf（正常模式）"
        Start-Process -FilePath $exe | Out-Null
    }
    Start-Sleep -Seconds 5
}

function Wait-ExtensionLoaded {
    param([datetime]$Since, [int]$TimeoutSeconds = 90)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $trace = Get-ChildItem (Join-Path $env:LOCALAPPDATA "Overwolf\Log") -Filter "Trace_*.log" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($trace -and $trace.LastWriteTime -ge $Since) {
            $hit = Select-String -LiteralPath $trace.FullName -Pattern ("Loading extension '" + [regex]::Escape($script:AppId) + "'") -Quiet
            if ($hit) { return $true }
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Get-OverwolfLauncher {
    $root = Find-OverwolfRoot
    return (Join-Path $root "OverwolfLauncher.exe")
}

function Launch-AlecaFrame {
    $launcher = Get-OverwolfLauncher
    Write-Log "启动 AlecaFrame 窗口"
    Start-Process -FilePath $launcher -ArgumentList "-launchapp", $script:AppId, "-from-desktop" | Out-Null
}

function Restart-AlecaFrameRenderer {
    Write-Log "重载 AlecaFrame 渲染进程..."
    Get-CimInstance Win32_Process -Filter "Name='OverwolfBrowser.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -match "AlecaFrame" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 3
    Launch-AlecaFrame
    Start-Sleep -Seconds 5
}

function Test-Patched {
    param([string]$VersionPath)
    $zhJs = Join-Path $VersionPath "web\$($script:ZhJsRel)"
    $main = Join-Path $VersionPath "web\main.html"
    if (-not (Test-Path $zhJs)) { return $false }
    if (-not (Test-Path $main)) { return $false }
    return [bool](Select-String -LiteralPath $main -Pattern "alecaframe-zh-cn\.js" -Quiet)
}

function Add-ScriptTag {
    param([string]$VersionPath, [string]$Page, [string]$ScriptName)
    $file = Join-Path $VersionPath "web\$Page"
    if (-not (Test-Path $file)) { return $false }
    $content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
    if ($content.Contains("assets/js/$ScriptName")) { return $true }
    if ($content -notmatch "(?i)</body>") { Write-Log "警告：$Page 缺少 </body>，跳过 $ScriptName"; return $false }
    $tag = '    <script src="assets/js/' + $ScriptName + '"></script>'
    $patched = [regex]::Replace($content, "(?i)</body>", "`r`n$tag`r`n</body>", 1)
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($file, $patched, $utf8)
    return $true
}

function Apply-Patch {
    param([string]$VersionPath)
    $srcJs = Join-Path $script:BinDir "alecaframe-zh-cn.js"
    if (-not (Test-Path $srcJs)) { throw "补丁文件缺失：$srcJs" }
    $dstJs = Join-Path $VersionPath "web\$($script:ZhJsRel)"
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dstJs) | Out-Null
    Copy-Item -LiteralPath $srcJs -Destination $dstJs -Force
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    foreach ($page in $script:Pages) {
        $file = Join-Path $VersionPath "web\$page"
        if (-not (Test-Path $file)) { continue }
        $content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
        $changed = $false

        # 关键：background.html 没有 <meta charset>，浏览器会把注入的脚本按 Windows-1252 解码，
        # 导致脚本里的中文全部变成乱码（hasChinese 失效、反向索引查不到中文）。
        # 必须在任何 <script> 之前补一个 UTF-8 声明（编码嗅探只看文档前 1024 字节）。
        if ($content -notmatch "(?i)charset\s*=") {
            $meta = '<meta charset="utf-8">'
            if ($content -match "(?i)<!DOCTYPE[^>]*>") {
                $content = [regex]::Replace($content, "(?i)(<!DOCTYPE[^>]*>)", "`$1`r`n$meta", 1)
            } elseif ($content -match "(?i)<head[^>]*>") {
                $content = [regex]::Replace($content, "(?i)(<head[^>]*>)", "`$1`r`n$meta", 1)
            } else {
                $content = $meta + "`r`n" + $content
            }
            $changed = $true
            Write-Log "已为 $page 补充 UTF-8 字符集声明"
        }

        if (-not $content.Contains("alecaframe-zh-cn.js")) {
            if ($content -notmatch "(?i)</body>") { throw "页面缺少 </body>：$page" }
            $content = [regex]::Replace($content, "(?i)</body>", "`r`n$($script:ScriptTag)`r`n</body>", 1)
            $changed = $true
        }

        if ($changed) { [System.IO.File]::WriteAllText($file, $content, $utf8) }
    }
    Write-Log "已注入中文脚本（共 $($script:Pages.Count) 个页面）"
}

# ---------------- OCR 增强 ----------------

function Get-OcrEnabled {
    if (-not (Test-Path $script:SettingsFile)) { return $true }
    try {
        $settings = Get-Content -LiteralPath $script:SettingsFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($null -ne $settings.relicOcr -and $null -ne $settings.relicOcr.enabled) {
            return [bool]$settings.relicOcr.enabled
        }
    } catch {
        Write-Log "OCR 设置读取失败，按开启处理：$($_.Exception.Message)"
    }
    return $true
}

function Set-OcrEnabled {
    param([bool]$Enabled)
    $obj = [ordered]@{ relicOcr = [ordered]@{ enabled = $Enabled } }
    $json = $obj | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText($script:SettingsFile, $json, (New-Object System.Text.UTF8Encoding($false)))
    Write-Log "OCR 设置已写入：enabled=$Enabled"
}

function Get-LocalNode {
    $local = Join-Path $script:OcrDir ".tools\node\node.exe"
    if (Test-Path $local) { return $local }
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Test-OcrPrerequisites {
    $missing = New-Object System.Collections.Generic.List[string]
    if (-not (Get-LocalNode)) { $missing.Add("node") }
    $python = Join-Path $script:OcrDir ".tools\python311-portable\python.exe"
    if (-not (Test-Path $python)) { $missing.Add("python311-portable") }
    foreach ($f in @("relic-ocr-server.js", "relic-ocr-worker.ps1", "capture-warframe-screen.ps1", "paddle-reward-worker.py")) {
        if (-not (Test-Path (Join-Path $script:OcrDir $f))) { $missing.Add($f) }
    }
    if (-not (Test-Path (Join-Path $script:OcrDir "afzh-items.js"))) { $missing.Add("bin/ocr/afzh-items.js（请先运行 python src/build.py）") }
    return $missing
}

function Get-OcrListenerPid {
    $conn = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $script:OcrPort -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($conn) { return $conn.OwningProcess }
    return $null
}

function Stop-OcrHelper {
    $pid_ = Get-OcrListenerPid
    if (-not $pid_) { return }
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $pid_" -ErrorAction SilentlyContinue
    if ($owner -and $owner.Name -eq "node.exe" -and $owner.CommandLine -like "*relic-ocr-server.js*") {
        Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 400
        Write-Log "已停止中文 OCR 服务（PID $pid_）"
    } else {
        Write-Log "警告：端口 $script:OcrPort 被其它程序占用（PID $pid_），不自动结束"
    }
}

function Start-OcrHelper {
    $node = Get-LocalNode
    if (-not $node) { throw "未找到 Node.js，请先运行 安装OCR前置组件.cmd" }
    $python = Join-Path $script:OcrDir ".tools\python311-portable\python.exe"
    $server = Join-Path $script:OcrDir "relic-ocr-server.js"
    $worker = Join-Path $script:OcrDir "relic-ocr-worker.ps1"
    $capture = Join-Path $script:OcrDir "capture-warframe-screen.ps1"
    $rewardWorker = Join-Path $script:OcrDir "paddle-reward-worker.py"
    $itemsJs = Join-Path $script:OcrDir "afzh-items.js"
    foreach ($p in @($server, $worker, $capture, $rewardWorker, $itemsJs, $python)) {
        if (-not (Test-Path $p)) { throw "OCR 组件缺失：$p" }
    }
    Stop-OcrHelper
    New-Item -ItemType Directory -Force -Path $script:OcrStateDir | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $script:OcrDir ".tools\paddleocr-home") | Out-Null
    $stdout = Join-Path $script:OcrStateDir "helper.out.log"
    $stderr = Join-Path $script:OcrStateDir "helper.err.log"
    # 参数顺序由 relic-ocr-server.js 的 process.argv 解析决定，不可调整
    $nodeArgs = @(
        ('"' + $server + '"'),
        ('"' + $itemsJs + '"'),
        ('"' + $worker + '"'),
        ('"' + $script:OcrStateDir + '"'),
        ('"' + $capture + '"'),
        ('"' + $python + '"'),
        ('"' + $rewardWorker + '"')
    )
    $oldPaddleHome = $env:PADDLE_HOME
    $oldXdgCache = $env:XDG_CACHE_HOME
    $oldHome = $env:HOME
    $oldUserProfile = $env:USERPROFILE
    try {
        # Paddle 2.x 用 XDG_CACHE_HOME/HOME 定位模型缓存，必须限制在包内
        $env:PADDLE_HOME = Join-Path $script:OcrDir ".tools\paddleocr-home"
        $env:XDG_CACHE_HOME = $env:PADDLE_HOME
        $env:HOME = (Join-Path $script:OcrDir ".tools")
        $env:USERPROFILE = (Join-Path $script:OcrDir ".tools")
        Start-Process -FilePath $node -ArgumentList $nodeArgs -WindowStyle Hidden `
            -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
    } finally {
        $env:PADDLE_HOME = $oldPaddleHome
        $env:XDG_CACHE_HOME = $oldXdgCache
        $env:HOME = $oldHome
        $env:USERPROFILE = $oldUserProfile
    }
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 250
        try {
            $health = Invoke-RestMethod -Uri ("http://127.0.0.1:$script:OcrPort/health") -TimeoutSec 1
            if ($health.ready) { Write-Log "中文 OCR 服务已就绪"; return }
        } catch { }
    }
    Write-Log "警告：中文 OCR 服务未在 10 秒内就绪（见 state\RelicChineseOcr\helper.err.log），继续启动不阻塞"
}

function Copy-OcrAssets {
    param([string]$VersionPath)
    $jsDir = Join-Path $VersionPath "web\assets\js"
    New-Item -ItemType Directory -Force -Path $jsDir | Out-Null
    foreach ($name in $script:OcrScripts) {
        $src = Join-Path $script:OcrDir $name
        if (-not (Test-Path $src)) { Write-Log "警告：缺少 OCR 脚本 $name"; continue }
        Copy-Item -LiteralPath $src -Destination (Join-Path $jsDir $name) -Force
    }
}

function Patch-RelicOverlayMain {
    param([string]$VersionPath)
    $main = Join-Path $VersionPath "web\assets\js\relicOverlay\main.js"
    if (-not (Test-Path $main)) { Write-Log "警告：未找到 relicOverlay/main.js，跳过奖励回退补丁"; return }
    $content = [System.IO.File]::ReadAllText($main, [System.Text.Encoding]::UTF8)
    if ($content.Contains("// ALECAFRAME_ZH_CN_REWARD_FALLBACK")) { return }
    $helperFile = Join-Path $script:PkgRoot "src\relic-reward-fallback.js"
    if (-not (Test-Path $helperFile)) { Write-Log "警告：缺少 src\relic-reward-fallback.js"; return }
    $helper = [System.IO.File]::ReadAllText($helperFile, [System.Text.Encoding]::UTF8)
    $anchor = "var relicWindowInitialized = false;"
    if (-not $content.Contains($anchor)) {
        Write-Log "警告：relicOverlay/main.js 锚点缺失（版本变化），跳过奖励回退补丁"
        return
    }
    $content = $content.Replace($anchor, $helper + "`r`n" + $anchor)
    $failurePattern = '(?ms)^\s*console\.log\("Failed to get relic data: "\s*\+\s*data\);\s*relicsApp\.error = true;\s*relicsApp\.errorMessage = data;'
    $failureBranch = @'
                            console.log("Failed to get relic data: " + data);

                            if (String(data || "").toLowerCase().includes("unsupported warframe language detected")) {
                                alecaFrameZhCnStartRewardFallback();
                            } else {
                                relicsApp.error = true;
                                relicsApp.errorMessage = data;
                            }
'@
    if ([regex]::IsMatch($content, $failurePattern)) {
        $content = [regex]::Replace($content, $failurePattern, $failureBranch, 1)
    } else {
        Write-Log "警告：relic 失败分支锚点缺失（版本变化），奖励回退可能不触发"
    }
    $slowPattern = '(?s)setTimeout\(\(\)\s*=>\s*\{\s*sendPage\("relic"\);\s*\},\s*2500\);'
    $fastReplace = @'
    // 中文奖励识别立即开始；官方英文 OCR 之后必然会失败
    alecaFrameZhCnStartRewardFallback();
    setTimeout(() => {
        sendPage("relic");
    }, 300);
'@
    if ([regex]::IsMatch($content, $slowPattern)) {
        $content = [regex]::Replace($content, $slowPattern, $fastReplace, 1)
    } else {
        Write-Log "警告：relic 初始化延时锚点缺失（版本变化），未加速识别"
    }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($main, $content, $utf8)
    Write-Log "已注入遗物奖励中文回退补丁"
}

function Patch-RivenOverlayHtml {
    param([string]$VersionPath)
    $file = Join-Path $VersionPath "web\rivenOverlay.html"
    if (-not (Test-Path $file)) { return }
    $content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
    if ($content.Contains(':key="stat.description"')) { return }
    $pattern = '(<div class="rivenDetailsStat (?:positive|negative)" v-for="stat in [^"]+")'
    if (-not [regex]::IsMatch($content, $pattern)) {
        Write-Log "提示：rivenOverlay.html 未找到 rivenDetailsStat 模板，跳过 :key 补丁"
        return
    }
    $patched = [regex]::Replace($content, $pattern, '$1 :key="stat.description"')
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($file, $patched, $utf8)
    Write-Log "已为裂罅详情模板补充 :key（OCR 短帧渲染保护）"
}

function Apply-OcrPatch {
    param([string]$VersionPath)
    Copy-OcrAssets -VersionPath $VersionPath
    foreach ($entry in $script:OcrInjections) {
        foreach ($name in $entry.Scripts) {
            Add-ScriptTag -VersionPath $VersionPath -Page $entry.Page -ScriptName $name | Out-Null
        }
    }
    Patch-RelicOverlayMain -VersionPath $VersionPath
    Patch-RivenOverlayHtml -VersionPath $VersionPath
    Write-Log "已注入中文 OCR 增强脚本"
}

function Remove-OcrArtifacts {
    param([string]$VersionPath)
    # 页面上的 <script> 由 Restore-OfficialFiles 还原页面时一并清掉
    $jsDir = Join-Path $VersionPath "web\assets\js"
    foreach ($name in $script:OcrScripts) {
        $p = Join-Path $jsDir $name
        if (Test-Path $p) { Remove-Item -LiteralPath $p -Force }
    }
    Write-Log "已清理 OCR 增强脚本"
}

function Wait-ZhLoaded {
    param([datetime]$Since, [int]$TimeoutSeconds = 90)
    $logPath = Join-Path $env:LOCALAPPDATA "Overwolf\Log\Apps\AlecaFrame\MainWindow.html.log"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $logPath) {
            $item = Get-Item -LiteralPath $logPath
            if ($item.LastWriteTime -ge $Since) {
                $tail = Get-Content -LiteralPath $logPath -Tail 400 -ErrorAction SilentlyContinue
                if ($tail -match "\[AlecaFrame-ZH\] loaded") { return $true }
            }
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Test-FlaggedSession {
    $procs = Get-CimInstance Win32_Process -Filter "Name='Overwolf.exe'" -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
        if ($p.CommandLine -and $p.CommandLine -match "extension-validation") { return $true }
    }
    return $false
}

function Save-State {
    param([string]$Version, [string]$Mode)
    $state = @{
        Version = $Version
        Mode = $Mode
        OcrEnabled = [bool](Get-OcrEnabled)
        Time = (Get-Date).ToString("o")
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText((Join-Path $script:StateDir "last-session.json"), $state, (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-StartChinese {
    $root = Find-OverwolfRoot
    if (-not $root) { throw "未找到 Overwolf 安装目录。" }
    $verDir = Get-AppVersionDir
    Write-Log "AlecaFrame 版本目录：$($verDir.FullName)"
    $ocrRequested = Get-OcrEnabled
    $ocrMissing = Test-OcrPrerequisites
    $enableOcr = $ocrRequested -and ($ocrMissing.Count -eq 0)
    if ($ocrRequested -and -not $enableOcr) {
        Write-Log ("OCR 已开启但前置未装齐，本次跳过：" + ($ocrMissing -join ", "))
    }
    Stop-Overwolf
    Restore-OfficialFiles -AppVersion $verDir.Name -VersionPath $verDir.FullName
    if ($enableOcr) { Start-OcrHelper } else { Stop-OcrHelper }
    $since = Get-Date
    Start-Overwolf -WithValidationBypass
    $loaded = Wait-ExtensionLoaded -Since $since -TimeoutSeconds 90
    if (-not $loaded) { Write-Log "警告：未在 trace 中看到扩展加载记录，继续尝试注入" }
    Start-Sleep -Seconds 4
    Apply-Patch -VersionPath $verDir.FullName
    if ($enableOcr) { Apply-OcrPatch -VersionPath $verDir.FullName }
    Save-State -Version $verDir.Name -Mode "zh"
    $patchTime = Get-Date
    Restart-AlecaFrameRenderer
    if (-not (Wait-ZhLoaded -Since $patchTime -TimeoutSeconds 120)) {
        throw "中文脚本未能加载。已停止重试并恢复官方文件。请查看 logs\launcher.log。"
    }
    $ocrNote = if ($enableOcr) { "中文 OCR 增强：已开启" } elseif ($ocrRequested) { "中文 OCR 增强：前置未安装，已跳过" } else { "中文 OCR 增强：已关闭" }
    Write-Log "中文界面加载成功（版本 $($verDir.Name)）；$ocrNote"
    Show-Message "已切换到中文界面。`n`n$ocrNote`n`n要恢复英文，请运行 Restore-English.cmd（或 Toggle-Chinese.cmd 在本次会话内切换）。"
}

function Invoke-RestoreEnglish {
    $root = Find-OverwolfRoot
    if (-not $root) { throw "未找到 Overwolf 安装目录。" }
    $verDir = Get-AppVersionDir
    Stop-OcrHelper
    Stop-Overwolf
    Restore-OfficialFiles -AppVersion $verDir.Name -VersionPath $verDir.FullName
    Save-State -Version $verDir.Name -Mode "en"
    Start-Overwolf
    Start-Sleep -Seconds 3
    Launch-AlecaFrame
    Write-Log "已恢复官方英文界面"
    Show-Message "已恢复英文并重新启动 Overwolf。`n`n下次如需中文，请运行 Start-Chinese.cmd。"
}

function Invoke-Toggle {
    $verDir = Get-AppVersionDir
    $flagged = Test-FlaggedSession
    $patched = Test-Patched -VersionPath $verDir.FullName
    Write-Log "切换：flagged=$flagged patched=$patched"
    if ($flagged) {
        if ($patched) {
            $since = Get-Date
            Stop-OcrHelper
            Restore-OfficialFiles -AppVersion $verDir.Name -VersionPath $verDir.FullName
            Save-State -Version $verDir.Name -Mode "en"
            Restart-AlecaFrameRenderer
            Write-Log "已切换为英文"
            Show-Message "已切换为英文（本次 Overwolf 会话内，无需重启 Overwolf）。"
        } else {
            Apply-Patch -VersionPath $verDir.FullName
            $ocrMissing = Test-OcrPrerequisites
            $enableOcr = (Get-OcrEnabled) -and ($ocrMissing.Count -eq 0)
            if ($enableOcr) {
                Start-OcrHelper
                Apply-OcrPatch -VersionPath $verDir.FullName
            }
            Save-State -Version $verDir.Name -Mode "zh"
            $patchTime = Get-Date
            Restart-AlecaFrameRenderer
            if (-not (Wait-ZhLoaded -Since $patchTime -TimeoutSeconds 60)) {
                throw "切换中文失败，请运行 Restore-English.cmd 恢复。"
            }
            Write-Log "已切换为中文"
            Show-Message "已切换为中文（本次 Overwolf 会话内）。"
        }
    } else {
        if ($patched) { Invoke-RestoreEnglish } else { Invoke-StartChinese }
    }
}

function Invoke-RefreshZh {
    $verDir = Get-AppVersionDir
    if (-not (Test-FlaggedSession)) { throw "当前 Overwolf 会话不是中文模式启动的，请先运行 Start-Chinese.cmd。" }
    Apply-Patch -VersionPath $verDir.FullName
    if ((Get-OcrEnabled) -and ((Test-OcrPrerequisites).Count -eq 0)) {
        Start-OcrHelper
        Apply-OcrPatch -VersionPath $verDir.FullName
    }
    $patchTime = Get-Date
    Restart-AlecaFrameRenderer
    if (-not (Wait-ZhLoaded -Since $patchTime -TimeoutSeconds 60)) { throw "刷新中文脚本失败。" }
    Write-Log "已刷新中文脚本"
}

function Invoke-OcrOn {
    Set-OcrEnabled -Enabled $true
    $missing = Test-OcrPrerequisites
    if ($missing.Count -gt 0) {
        Show-Message ("OCR 已开启，但前置组件未装齐：`n" + ($missing -join "`n") + "`n`n请先运行 安装OCR前置组件.cmd，然后重启中文版。")
        return
    }
    if (Test-FlaggedSession) {
        $verDir = Get-AppVersionDir
        Start-OcrHelper
        Apply-OcrPatch -VersionPath $verDir.FullName
        $patchTime = Get-Date
        Restart-AlecaFrameRenderer
        if (-not (Wait-ZhLoaded -Since $patchTime -TimeoutSeconds 60)) { throw "开启 OCR 后重载失败，请运行 Restore-English.cmd。" }
        Show-Message "中文 OCR 已开启（本次会话内生效）。"
    } else {
        Show-Message "中文 OCR 已开启，下次用 Start-Chinese.cmd 启动时生效。"
    }
}

function Invoke-OcrOff {
    Set-OcrEnabled -Enabled $false
    Stop-OcrHelper
    if (Test-FlaggedSession) {
        $verDir = Get-AppVersionDir
        Restore-OfficialFiles -AppVersion $verDir.Name -VersionPath $verDir.FullName
        Apply-Patch -VersionPath $verDir.FullName
        $patchTime = Get-Date
        Restart-AlecaFrameRenderer
        if (-not (Wait-ZhLoaded -Since $patchTime -TimeoutSeconds 60)) { throw "关闭 OCR 后重载失败，请运行 Restore-English.cmd。" }
        Show-Message "中文 OCR 已关闭（界面汉化保留，本次会话内生效）。"
    } else {
        Show-Message "中文 OCR 已关闭。"
    }
}

function Invoke-InstallOcr {
    $installer = Join-Path $script:PkgRoot "scripts\Install-OcrPrerequisites.ps1"
    if (-not (Test-Path $installer)) { throw "缺少安装脚本：$installer" }
    Write-Log "运行 OCR 前置安装：$installer"
    $p = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ('"' + $installer + '"')) -Wait -PassThru
    if ($p.ExitCode -ne 0) {
        # 安装器的完整输出在 logs\ocr-install.log，失败时把末尾几行带给用户，避免"一闪而过看不到原因"
        $log = Join-Path $script:LogDir "ocr-install.log"
        $tail = ""
        if (Test-Path $log) {
            $lines = @(Get-Content -LiteralPath $log -Tail 12 -Encoding UTF8 -ErrorAction SilentlyContinue)
            $tail = ($lines | Where-Object { $_.Trim() }) -join "`r`n"
        }
        $hint = if ($tail) { "`n`n最近日志：`n$tail" } else { "" }
        throw ("OCR 前置组件安装失败（退出码 $($p.ExitCode)）。" + $hint + "`n`n完整日志：$log")
    }
    Show-Message "OCR 前置组件安装完成。`n`n现在用 Start-Chinese.cmd 启动即可使用中文遗物/裂罅识别。"
}

function Invoke-Status {
    $root = Find-OverwolfRoot
    $overwolfVer = "未安装/未找到"
    if ($root) {
        $v = Get-OverwolfVersionDir -Root $root
        if ($v) { $overwolfVer = $v.Name }
    }
    $appVer = "未安装"
    $patched = $false
    try {
        $verDir = Get-AppVersionDir
        $appVer = $verDir.Name
        $patched = Test-Patched -VersionPath $verDir.FullName
    } catch { }
    $flagged = Test-FlaggedSession
    $ocrEnabled = Get-OcrEnabled
    $ocrMissing = Test-OcrPrerequisites
    $ocrReady = $ocrMissing.Count -eq 0
    $ocrRunning = $null -ne (Get-OcrListenerPid)
    $text = @(
        "Overwolf 版本: $overwolfVer",
        "AlecaFrame 版本: $appVer",
        "当前文件已汉化: $patched",
        "本次会话已带校验绕过参数: $flagged",
        "",
        "中文 OCR 增强: 开关=$ocrEnabled，前置=$ocrReady，服务运行中=$ocrRunning",
        ("  缺失项: " + $(if ($ocrReady) { "无" } else { $ocrMissing -join ", " })),
        "",
        "用法:",
        "  Start-Chinese.cmd   中文启动（会重启 Overwolf）",
        "  Restore-English.cmd 恢复英文（会重启 Overwolf）",
        "  Toggle-Chinese.cmd  在中文会话内快速切换中/英",
        "  Refresh-Chinese.cmd 重新注入最新词库",
        "  Install-Shortcuts.cmd 在桌面创建快捷方式"
    ) -join "`r`n"
    Show-Message $text "AlecaFrame-ZH 状态"
}

function Invoke-InstallShortcuts {
    $desktop = [Environment]::GetFolderPath("Desktop")
    $wsh = New-Object -ComObject WScript.Shell
    # 名称直接写明后果，避免误点：前两个会重启 Overwolf，第三个不会
    $items = @(
        @{
            Name = "AlecaFrame 中文版（启动）"
            Target = (Join-Path $script:PkgRoot "Start-Chinese.cmd")
            Description = "启动 AlecaFrame 中文版。会关闭并重启 Overwolf，加载中文界面与中文 OCR。"
        },
        @{
            Name = "AlecaFrame 英文版（恢复）"
            Target = (Join-Path $script:PkgRoot "Restore-English.cmd")
            Description = "恢复官方英文版。会关闭并重启 Overwolf，还原官方文件。"
        },
        @{
            Name = "AlecaFrame 中英切换（不重启）"
            Target = (Join-Path $script:PkgRoot "Toggle-Chinese.cmd")
            Description = "在中文会话内切换中/英界面。不会重启 Overwolf，仅重载 AlecaFrame。"
        }
    )
    foreach ($it in $items) {
        $lnk = Join-Path $desktop ($it.Name + ".lnk")
        $sc = $wsh.CreateShortcut($lnk)
        $sc.TargetPath = $it.Target
        $sc.WorkingDirectory = $script:PkgRoot
        $sc.WindowStyle = 7
        $sc.Description = $it.Description
        $sc.Save()
    }
    # 清理旧版英文命名快捷方式，避免新旧两套并存导致误点
    foreach ($legacy in @("AlecaFrame-ZH Start", "AlecaFrame-ZH Restore", "AlecaFrame-ZH Toggle")) {
        $old = Join-Path $desktop ($legacy + ".lnk")
        if (Test-Path -LiteralPath $old) {
            Remove-Item -LiteralPath $old -Force
            Write-Log "已删除旧快捷方式：$legacy"
        }
    }
    Write-Log "已创建中文命名桌面快捷方式"
    Show-Message ("已在桌面创建 3 个快捷方式：`n`n" +
        "  AlecaFrame 中文版（启动）        —— 会重启 Overwolf`n" +
        "  AlecaFrame 英文版（恢复）        —— 会重启 Overwolf`n" +
        "  AlecaFrame 中英切换（不重启）    —— 只重载 AlecaFrame`n`n" +
        "旧的英文命名快捷方式已清理。")
}

try {
    switch ($Action) {
        "Start" { Invoke-StartChinese }
        "Restore" { Invoke-RestoreEnglish }
        "Toggle" { Invoke-Toggle }
        "Status" { Invoke-Status }
        "InstallShortcuts" { Invoke-InstallShortcuts }
        "Refresh" { Invoke-RefreshZh }
        "OcrOn" { Invoke-OcrOn }
        "OcrOff" { Invoke-OcrOff }
        "InstallOcr" { Invoke-InstallOcr }
    }
    exit 0
} catch {
    $msg = $_.Exception.Message
    Write-Log "错误：$msg"
    try {
        Stop-OcrHelper
        $verDir = Get-AppVersionDir
        if (Test-Patched -VersionPath $verDir.FullName) {
            Restore-OfficialFiles -AppVersion $verDir.Name -VersionPath $verDir.FullName
        }
    } catch { Write-Log "恢复官方文件失败：$($_.Exception.Message)" }
    Show-Error $msg "AlecaFrame-ZH 出错"
    exit 1
}
