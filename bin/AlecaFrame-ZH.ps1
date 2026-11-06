#requires -Version 5.1
<#
  AlecaFrame 简体中文补丁 - 启动器
  用法：
    AlecaFrame-ZH.ps1 -Action Start     中文模式启动（关闭 Overwolf -> 还原官方文件 -> 带校验绕过参数启动 -> 注入汉化 -> 重载应用）
    AlecaFrame-ZH.ps1 -Action Restore   恢复英文（关闭 Overwolf -> 还原官方文件 -> 正常启动）
    AlecaFrame-ZH.ps1 -Action Toggle    在已带参数启动的会话内快速切换中/英（不重启 Overwolf）
    AlecaFrame-ZH.ps1 -Action Status    查看当前状态
    AlecaFrame-ZH.ps1 -Action InstallShortcuts  在桌面创建快捷方式
#>
param(
    [ValidateSet("Start", "Restore", "Toggle", "Status", "InstallShortcuts", "Refresh")]
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
$script:ZhJsRel = "assets/js/alecaframe-zh-cn.js"
$script:ScriptTag = '    <script src="assets/js/alecaframe-zh-cn.js"></script>'
$script:FlagArgs = @(
    "--ow-disable-features=extension-validation,read-opk-from-memory",
    "--ow-enable-features=force-validation-report-only"
)

$script:PkgRoot = Split-Path -Parent $PSScriptRoot
$script:BinDir = $PSScriptRoot
$script:StateDir = Join-Path $script:PkgRoot "state"
$script:LogDir = Join-Path $script:PkgRoot "logs"
$script:LogFile = Join-Path $script:LogDir "launcher.log"
$script:MsgFile = Join-Path $script:BinDir "messages.txt"

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
    $candidates.Add("D:\Install\Overwolf")
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
}

function Restore-OfficialFiles {
    param([string]$AppVersion, [string]$VersionPath)
    $source = Get-OfficialSource -AppVersion $AppVersion
    if (-not $source) {
        throw "找不到官方文件来源（opk 缓存与本地快照均缺失），无法还原。请在 Overwolf 中重装 AlecaFrame。"
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
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
    $zhJs = Join-Path $VersionPath "web\$($script:ZhJsRel)"
    if (Test-Path $zhJs) { Remove-Item -LiteralPath $zhJs -Force }
    if ($source.Kind -eq "opk") { Save-OfficialSnapshot -AppVersion $AppVersion -VersionPath $VersionPath }
    Write-Log "已还原官方文件（来源：$($source.Kind)）"
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
        if ($content.Contains("alecaframe-zh-cn.js")) { continue }
        if ($content -notmatch "(?i)</body>") { throw "页面缺少 </body>：$page" }
        $patched = [regex]::Replace($content, "(?i)</body>", "`r`n$($script:ScriptTag)`r`n</body>", 1)
        [System.IO.File]::WriteAllText($file, $patched, $utf8)
    }
    Write-Log "已注入中文脚本（共 $($script:Pages.Count) 个页面）"
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
        Time = (Get-Date).ToString("o")
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText((Join-Path $script:StateDir "last-session.json"), $state, (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-StartChinese {
    $root = Find-OverwolfRoot
    if (-not $root) { throw "未找到 Overwolf 安装目录。" }
    $verDir = Get-AppVersionDir
    Write-Log "AlecaFrame 版本目录：$($verDir.FullName)"
    Stop-Overwolf
    Restore-OfficialFiles -AppVersion $verDir.Name -VersionPath $verDir.FullName
    $since = Get-Date
    Start-Overwolf -WithValidationBypass
    $loaded = Wait-ExtensionLoaded -Since $since -TimeoutSeconds 90
    if (-not $loaded) { Write-Log "警告：未在 trace 中看到扩展加载记录，继续尝试注入" }
    Start-Sleep -Seconds 4
    Apply-Patch -VersionPath $verDir.FullName
    Save-State -Version $verDir.Name -Mode "zh"
    $patchTime = Get-Date
    Restart-AlecaFrameRenderer
    if (-not (Wait-ZhLoaded -Since $patchTime -TimeoutSeconds 120)) {
        throw "中文脚本未能加载。已停止重试并恢复官方文件。请查看 logs\launcher.log。"
    }
    Write-Log "中文界面加载成功（版本 $($verDir.Name)）"
    Show-Message "已切换到中文界面。`n`n要恢复英文，请运行 Restore-English.cmd（或 Toggle-Chinese.cmd 在本次会话内切换）。"
}

function Invoke-RestoreEnglish {
    $root = Find-OverwolfRoot
    if (-not $root) { throw "未找到 Overwolf 安装目录。" }
    $verDir = Get-AppVersionDir
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
            Restore-OfficialFiles -AppVersion $verDir.Name -VersionPath $verDir.FullName
            Save-State -Version $verDir.Name -Mode "en"
            Restart-AlecaFrameRenderer
            Write-Log "已切换为英文"
            Show-Message "已切换为英文（本次 Overwolf 会话内，无需重启 Overwolf）。"
        } else {
            Apply-Patch -VersionPath $verDir.FullName
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
    $patchTime = Get-Date
    Restart-AlecaFrameRenderer
    if (-not (Wait-ZhLoaded -Since $patchTime -TimeoutSeconds 60)) { throw "刷新中文脚本失败。" }
    Write-Log "已刷新中文脚本"
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
    $text = @(
        "Overwolf 版本: $overwolfVer",
        "AlecaFrame 版本: $appVer",
        "当前文件已汉化: $patched",
        "本次会话已带校验绕过参数: $flagged",
        "",
        "用法:",
        "  Start-Chinese.cmd   中文启动（会重启 Overwolf）",
        "  Restore-English.cmd 恢复英文（会重启 Overwolf）",
        "  Toggle-Chinese.cmd  在中文会话内快速切换中/英",
        "  Install-Shortcuts.cmd 在桌面创建快捷方式"
    ) -join "`r`n"
    Show-Message $text "AlecaFrame-ZH 状态"
}

function Invoke-InstallShortcuts {
    $desktop = [Environment]::GetFolderPath("Desktop")
    $wsh = New-Object -ComObject WScript.Shell
    $items = @(
        @{ Name = "AlecaFrame-ZH Start"; Target = (Join-Path $script:PkgRoot "Start-Chinese.cmd") },
        @{ Name = "AlecaFrame-ZH Restore"; Target = (Join-Path $script:PkgRoot "Restore-English.cmd") },
        @{ Name = "AlecaFrame-ZH Toggle"; Target = (Join-Path $script:PkgRoot "Toggle-Chinese.cmd") }
    )
    foreach ($it in $items) {
        $lnk = Join-Path $desktop ($it.Name + ".lnk")
        $sc = $wsh.CreateShortcut($lnk)
        $sc.TargetPath = $it.Target
        $sc.WorkingDirectory = $script:PkgRoot
        $sc.WindowStyle = 7
        $sc.Description = "AlecaFrame 简体中文补丁"
        $sc.Save()
    }
    Write-Log "已创建桌面快捷方式"
    Show-Message "已在桌面创建 3 个快捷方式：`nStart（中文启动）、Restore（恢复英文）、Toggle（会话内切换）。"
}

try {
    switch ($Action) {
        "Start" { Invoke-StartChinese }
        "Restore" { Invoke-RestoreEnglish }
        "Toggle" { Invoke-Toggle }
        "Status" { Invoke-Status }
        "InstallShortcuts" { Invoke-InstallShortcuts }
        "Refresh" { Invoke-RefreshZh }
    }
    exit 0
} catch {
    $msg = $_.Exception.Message
    Write-Log "错误：$msg"
    try {
        $verDir = Get-AppVersionDir
        if (Test-Patched -VersionPath $verDir.FullName) {
            Restore-OfficialFiles -AppVersion $verDir.Name -VersionPath $verDir.FullName
        }
    } catch { Write-Log "恢复官方文件失败：$($_.Exception.Message)" }
    Show-Error $msg "AlecaFrame-ZH 出错"
    exit 1
}
