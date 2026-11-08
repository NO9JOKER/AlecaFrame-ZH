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

