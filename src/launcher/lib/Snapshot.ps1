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

