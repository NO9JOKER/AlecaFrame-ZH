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
    Show-Message "已切换到中文界面。`n`n$ocrNote`n`n要恢复英文，请运行 2-还原-官方英文.cmd（或 3-中英切换.cmd 在本次会话内切换）。"
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
    Show-Message "已恢复英文并重新启动 Overwolf。`n`n下次如需中文，请运行 1-启动-中文补丁.cmd。"
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
                throw "切换中文失败，请运行 2-还原-官方英文.cmd 恢复。"
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
    if (-not (Test-FlaggedSession)) { throw "当前 Overwolf 会话不是中文模式启动的，请先运行 1-启动-中文补丁.cmd。" }
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
        Show-Message ("OCR 已开启，但前置组件未装齐：`n" + ($missing -join "`n") + "`n`n请先运行 6-安装OCR前置组件.cmd，然后重启中文版。")
        return
    }
    if (Test-FlaggedSession) {
        $verDir = Get-AppVersionDir
        Start-OcrHelper
        Apply-OcrPatch -VersionPath $verDir.FullName
        $patchTime = Get-Date
        Restart-AlecaFrameRenderer
        if (-not (Wait-ZhLoaded -Since $patchTime -TimeoutSeconds 60)) { throw "开启 OCR 后重载失败，请运行 2-还原-官方英文.cmd。" }
        Show-Message "中文 OCR 已开启（本次会话内生效）。"
    } else {
        Show-Message "中文 OCR 已开启，下次用 1-启动-中文补丁.cmd 启动时生效。"
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
    Show-Message "OCR 前置组件安装完成。`n`n现在用 1-启动-中文补丁.cmd 启动即可使用中文遗物/裂罅识别。"
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
        "  1-启动-中文补丁.cmd   中文启动（会重启 Overwolf）",
        "  2-还原-官方英文.cmd 恢复英文（会重启 Overwolf）",
        "  3-中英切换.cmd  在中文会话内快速切换中/英",
        "  4-重启补丁.cmd 重新注入最新词库",
        "  5-版本信息.cmd 查看状态"
    ) -join "`r`n"
    Show-Message $text "AlecaFrame-ZH 状态"
}

