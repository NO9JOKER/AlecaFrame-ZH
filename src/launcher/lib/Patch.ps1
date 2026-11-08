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

