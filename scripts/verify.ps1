#requires -Version 5.1
<#
.SYNOPSIS
    AlecaFrame-ZH 本地验证脚本：合并到 main 之前必须全绿。

.DESCRIPTION
    覆盖 GitHub Actions build.yml 的全部检查，并补充：版本号与 CHANGELOG 一致性、
    PowerShell 脚本语法解析、生成物未入库、可选发布包自检。

    用法（在仓库根目录或任意目录）：
        powershell -ExecutionPolicy Bypass -File scripts\verify.ps1
        powershell -ExecutionPolicy Bypass -File scripts\verify.ps1 -Package
        powershell -ExecutionPolicy Bypass -File scripts\verify.ps1 -Python D:\py311\python.exe -Node D:\node\node.exe

    参数：
        -Python   指定 python.exe（默认依次尝试 $env:PYTHON、python、python3）
        -Node     指定 node.exe（默认尝试 node）
        -Git      指定 git.exe（默认尝试 PATH 里的 git；用于检查生成物未被跟踪）
        -Package  额外跑 scripts/package.py 并校验发布包自包含
        -NoBuild  跳过 python src/build.py（只做静态检查）

    退出码：0 = 全部通过（可能有 WARN）；1 = 至少一项失败。
#>
param(
    [string]$Python = "",
    [string]$Node = "",
    [string]$Git = "",
    [switch]$Package,
    [switch]$NoBuild
)

# 本脚本大量调用原生命令（python/node/git）并检查退出码，
# 用 Continue 避免 PowerShell 5.1 把 stderr 当成 NativeCommandError 中断流程。
$ErrorActionPreference = "Continue"
$script:Failed = 0
$script:Warned = 0
$script:Passed = 0

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    function Write-Head([string]$text) {
        Write-Host ""
        Write-Host "==> $text" -ForegroundColor Cyan
    }
    function Write-Ok([string]$text) {
        Write-Host "  [PASS] $text" -ForegroundColor Green
        $script:Passed++
    }
    function Write-Warn2([string]$text) {
        Write-Host "  [WARN] $text" -ForegroundColor Yellow
        $script:Warned++
    }
    function Write-Fail2([string]$text) {
        Write-Host "  [FAIL] $text" -ForegroundColor Red
        $script:Failed++
    }

    # --- 探测 python / node ---------------------------------------------------
    function Find-Python {
        $cands = @()
        if ($Python) { $cands += $Python }
        if ($env:PYTHON) { $cands += $env:PYTHON }
        foreach ($n in @("python", "python3")) {
            $c = Get-Command $n -ErrorAction SilentlyContinue
            if ($c) { $cands += $c.Source }
        }
        foreach ($c in $cands) {
            if (-not $c -or -not (Test-Path $c)) { continue }
            try { $v = & $c --version 2>&1 } catch { continue }
            if ($LASTEXITCODE -eq 0 -and "$v" -match "Python \d") { return $c }
        }
        return $null
    }

    function Find-Node {
        $cands = @()
        if ($Node) { $cands += $Node }
        $c = Get-Command node -ErrorAction SilentlyContinue
        if ($c) { $cands += $c.Source }
        foreach ($x in $cands) {
            if (-not $x -or -not (Test-Path $x)) { continue }
            try { $v = & $x --version 2>&1 } catch { continue }
            if ($LASTEXITCODE -eq 0 -and "$v" -match "^v\d") { return $x }
        }
        return $null
    }

    $py = Find-Python
    $nd = Find-Node

    Write-Head "环境"
    if ($py) { Write-Ok "python: $py ($(& $py --version 2>&1))" }
    else { Write-Fail "未找到可用的 python（需要 3.8+）；若已安装请用 -Python <路径> 指定" }
    if ($nd) { Write-Ok "node: $nd ($(& $nd --version 2>&1))" }
    else { Write-Fail "未找到可用的 node（需要 18+）；若已安装请用 -Node <路径> 指定" }

    # --- 1. 构建词典 ----------------------------------------------------------
    Write-Head "构建词典（python src/build.py）"
    if ($NoBuild) {
        Write-Warn2 "已按 -NoBuild 跳过构建"
    } elseif (-not $py) {
        Write-Fail2 "缺少 python，无法构建"
    } else {
        $env:PYTHON = $py
        $out = & $py "src\build.py" 2>&1
        $code = $LASTEXITCODE
        $out | ForEach-Object { Write-Host "    $_" }
        if ($code -ne 0) {
            Write-Fail2 "python src/build.py 退出码 $code"
        } else {
            Write-Ok "构建成功"
        }
    }

    # 构建产物检查（对应 CI 的 Verify artifact）
    $artifact = Join-Path $root "bin\alecaframe-zh-cn.js"
    if (-not (Test-Path $artifact)) {
        Write-Fail2 "缺少构建产物 bin/alecaframe-zh-cn.js"
    } else {
        $text = [IO.File]::ReadAllText($artifact, [Text.Encoding]::UTF8)
        $miss = @()
        foreach ($m in @("__AFCN_DICT__", "__ALECAFRAME_ZH_CN_ITEMS__", "AlecaFrame-ZH")) {
            if ($text.IndexOf($m) -lt 0) { $miss += $m }
        }
        if ($miss.Count -gt 0) {
            Write-Fail2 "构建产物缺少标记：$($miss -join ', ')"
        } else {
            $kb = [math]::Round((Get-Item $artifact).Length / 1KB, 1)
            Write-Ok "构建产物检查通过（$kb KB）"
        }
    }
    $ocrArtifact = Join-Path $root "bin\ocr\afzh-items.js"
    if (Test-Path $ocrArtifact) { Write-Ok "OCR 词库产物存在" }
    else { Write-Fail "缺少 OCR 词库产物 bin/ocr/afzh-items.js" }

    # --- 2. 词典 TSV 格式 -----------------------------------------------------
    Write-Head "词典格式（dict/*.tsv 每行必须含 Tab）"
    $tsvBad = @()
    $tsvCount = 0
    foreach ($f in Get-ChildItem (Join-Path $root "dict") -Filter *.tsv -File) {
        $ln = 0
        foreach ($line in [IO.File]::ReadAllLines($f.FullName, [Text.Encoding]::UTF8)) {
            $ln++
            if (-not $line.Trim()) { continue }
            $tsvCount++
            if ($line.IndexOf("`t") -lt 0) { $tsvBad += "$($f.Name):$ln" }
        }
    }
    if ($tsvBad.Count -gt 0) {
        Write-Fail2 "以下行不是 TSV 行：$($tsvBad[0..([math]::Min(9, $tsvBad.Count - 1))] -join ', ')"
    } else {
        Write-Ok "TSV 格式正常（共 $tsvCount 条）"
    }

    # --- 3. PowerShell 脚本 UTF-8 BOM ----------------------------------------
    Write-Head "PowerShell 脚本 UTF-8 BOM"
    $ps1Bad = @()
    foreach ($f in Get-ChildItem $root -Filter *.ps1 -Recurse -File | Where-Object { $_.FullName -notmatch "\\\.git\\" }) {
        $b = [IO.File]::ReadAllBytes($f.FullName)
        if ($b.Length -lt 3 -or $b[0] -ne 0xEF -or $b[1] -ne 0xBB -or $b[2] -ne 0xBF) {
            $ps1Bad += $f.FullName.Substring($root.Length + 1)
        }
    }
    if ($ps1Bad.Count -gt 0) {
        Write-Fail2 "缺少 UTF-8 BOM（PowerShell 5.1 下中文会乱码）：$($ps1Bad -join ', ')"
    } else {
        Write-Ok "所有 .ps1 均为 UTF-8 with BOM"
    }

    # --- 4. PowerShell 语法解析 ----------------------------------------------
    Write-Head "PowerShell 语法解析"
    $ps1Total = 0
    $ps1Err = @()
    foreach ($f in Get-ChildItem $root -Filter *.ps1 -Recurse -File | Where-Object { $_.FullName -notmatch "\\\.git\\" }) {
        $ps1Total++
        $tokens = $null
        $errors = $null
        [void][System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$tokens, [ref]$errors)
        if ($errors -and $errors.Count -gt 0) {
            $ps1Err += "$($f.FullName.Substring($root.Length + 1)): $($errors[0].Message)"
        }
    }
    if ($ps1Err.Count -gt 0) {
        Write-Fail2 "语法错误：$($ps1Err -join ' | ')"
    } else {
        Write-Ok "$ps1Total 个 .ps1 语法解析通过"
    }

    # --- 5. JS 语法检查（对应 CI 的 Syntax check JS）--------------------------
    Write-Head "JS 语法（node --check）"
    if (-not $nd) {
        Write-Fail2 "缺少 node，跳过 JS 语法检查视为失败"
    } else {
        $jsFiles = @()
        foreach ($rel in @("src\engine.js", "src\search.js", "src\relic-reward-fallback.js")) {
            $p = Join-Path $root $rel
            if (Test-Path $p) { $jsFiles += $p }
        }
        $ocrDir = Join-Path $root "bin\ocr"
        if (Test-Path $ocrDir) {
            foreach ($f in Get-ChildItem $ocrDir -Filter *.js -File) { $jsFiles += $f.FullName }
        }
        $jsBad = @()
        foreach ($f in $jsFiles) {
            & $nd --check $f 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { $jsBad += $f.Substring($root.Length + 1) }
        }
        if ($jsBad.Count -gt 0) { Write-Fail2 "语法错误：$($jsBad -join ', ')" }
        else { Write-Ok "$($jsFiles.Count) 个 JS 文件语法通过" }
    }

    # --- 6. 搜索单元测试 ------------------------------------------------------
    Write-Head "搜索单元测试（node tests/search.test.mjs）"
    $testFile = Join-Path $root "tests\search.test.mjs"
    if (-not (Test-Path $testFile)) {
        Write-Warn2 "未找到 tests/search.test.mjs，跳过"
    } elseif (-not $nd) {
        Write-Fail2 "缺少 node，无法跑单元测试"
    } else {
        $out = & $nd $testFile 2>&1
        $code = $LASTEXITCODE
        $out | Select-Object -Last 15 | ForEach-Object { Write-Host "    $_" }
        if ($code -ne 0) { Write-Fail2 "tests/search.test.mjs 退出码 $code" }
        else { Write-Ok "搜索单元测试通过" }
    }

    # --- 7. 版本号与 CHANGELOG 一致 ------------------------------------------
    Write-Head "版本一致性（VERSION / CHANGELOG.md / tag）"
    $verFile = Join-Path $root "VERSION"
    $chgFile = Join-Path $root "CHANGELOG.md"
    $ver = ""
    if (Test-Path $verFile) {
        $ver = ([IO.File]::ReadAllText($verFile)).Trim()
        Write-Ok "VERSION = $ver"
    } else {
        Write-Fail2 "缺少 VERSION 文件"
    }
    if ((Test-Path $chgFile) -and $ver) {
        $firstHeading = $null
        foreach ($line in [IO.File]::ReadAllLines($chgFile, [Text.Encoding]::UTF8)) {
            if ($line -match "^##\s+v(\S+)") { $firstHeading = $Matches[1]; break }
        }
        if (-not $firstHeading) {
            Write-Fail2 "CHANGELOG.md 找不到 '## vX.Y.Z' 版本标题"
        } elseif ($firstHeading -ne $ver) {
            Write-Fail2 "CHANGELOG 首个版本是 v$firstHeading，与 VERSION ($ver) 不一致"
        } else {
            Write-Ok "CHANGELOG 首个版本与 VERSION 一致（v$ver）"
        }
    }

    # --- 8. 生成物未入库 ------------------------------------------------------
    Write-Head "生成物未入库（gitignore 有效性）"
    $gitCmd = ""
    if ($Git -and (Test-Path $Git)) { $gitCmd = $Git }
    elseif (Get-Command git -ErrorAction SilentlyContinue) { $gitCmd = "git" }
    if (-not $gitCmd) {
        Write-Warn2 "未找到 git（命令行），跳过该检查；可用 -Git <git.exe> 指定，或确认 bin/alecaframe-zh-cn.js 未被跟踪"
    } else {
        $tracked = @()
        foreach ($rel in @("bin/alecaframe-zh-cn.js", "bin/ocr/afzh-items.js", "build-unmatched.txt")) {
            $r = & $gitCmd -C $root ls-files -- $rel 2>&1
            if ("$r".Trim()) { $tracked += $rel }
        }
        if ($tracked.Count -gt 0) { Write-Fail2 "生成物被 git 跟踪：$($tracked -join ', ')" }
        else { Write-Ok "生成物未被跟踪" }
    }

    # --- 9. 可选：打包自检 ----------------------------------------------------
    if ($Package) {
        Write-Head "发布包自检（python scripts/package.py）"
        if (-not $py) {
            Write-Fail2 "缺少 python，无法打包"
        } else {
            $env:PYTHON = $py
            $out = & $py "scripts\package.py" 2>&1
            $code = $LASTEXITCODE
            $out | ForEach-Object { Write-Host "    $_" }
            if ($code -ne 0) {
                Write-Fail2 "scripts/package.py 退出码 $code"
            } elseif ($ver) {
                $zip = Join-Path $root "dist\AlecaFrame-ZH-v$ver.zip"
                if (Test-Path $zip) { Write-Ok "发布包存在：dist/AlecaFrame-ZH-v$ver.zip" }
                else { Write-Fail2 "未生成 dist/AlecaFrame-ZH-v$ver.zip" }
            }
        }
    }

    # --- 汇总 ----------------------------------------------------------------
    Write-Host ""
    Write-Host ("-" * 60)
    if ($script:Failed -gt 0) {
        Write-Host "结果：失败（PASS=$script:Passed, WARN=$script:Warned, FAIL=$script:Failed）" -ForegroundColor Red
        Write-Host "未通过，不要合并到 main。" -ForegroundColor Red
        exit 1
    }
    Write-Host "结果：通过（PASS=$script:Passed, WARN=$script:Warned）" -ForegroundColor Green
    Write-Host "下一步：手动回归 Start / Restore / Refresh 各一次，然后再合入 main。" -ForegroundColor Green
    exit 0
}
finally {
    Pop-Location
}
