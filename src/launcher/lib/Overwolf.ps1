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

