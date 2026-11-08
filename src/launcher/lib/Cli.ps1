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
