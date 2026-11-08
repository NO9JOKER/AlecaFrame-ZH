#requires -Version 5.1
<#
.SYNOPSIS
  AlecaFrame-ZH 本地/CI 门禁。Windows PowerShell 5.1。
.DESCRIPTION
  覆盖构建、契约、词典 strict、单元测试、Node 测试、PowerShell BOM/语法、
  runtime/OCR JS 语法和生成物未跟踪检查。CI 使用 Python/Node 等价步骤。
.PARAMETER Python
  python.exe 路径；默认 $env:PYTHON、python、python3。
.PARAMETER Node
  node.exe 路径；默认 PATH。
.PARAMETER Package
  额外生成 dist 测试包并校验 bundle hash。
.PARAMETER NoBuild
  跳过构建和依赖构建产物的检查。
#>
param(
    [string]$Python = "",
    [string]$Node = "",
    [string]$Git = "",
    [switch]$Package,
    [switch]$NoBuild
)

$ErrorActionPreference = "Continue"
$script:Failed = 0
$script:Passed = 0
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

function Write-Head([string]$text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Write-Ok([string]$text) { Write-Host "  [PASS] $text" -ForegroundColor Green; $script:Passed++ }
function Write-Fail([string]$text) { Write-Host "  [FAIL] $text" -ForegroundColor Red; $script:Failed++ }

function Resolve-Tool([string]$explicit, [string]$envName, [string[]]$names) {
    $candidates = @()
    if ($explicit) { $candidates += $explicit }
    if ($envName) {
        $envValue = [Environment]::GetEnvironmentVariable($envName)
        if ($envValue) { $candidates += $envValue }
    }
    foreach ($name in $names) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { $candidates += $cmd.Source }
    }
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    return $null
}

function Invoke-Check([string]$name, [string]$exe, [string[]]$arguments) {
    Write-Head $name
    & $exe @arguments
    if ($LASTEXITCODE -eq 0) { Write-Ok $name } else { Write-Fail "$name (exit $LASTEXITCODE)" }
}

$python = Resolve-Tool $Python "PYTHON" @("python", "python3")
$node = Resolve-Tool $Node "NODE" @("node")
if (-not $python) { Write-Fail "找不到 Python"; }
if (-not $node) { Write-Fail "找不到 Node.js"; }

if ($python) {
    if (-not $NoBuild) {
        Invoke-Check "构建" $python @("tools\build.py")
    }
    Invoke-Check "契约" $python @("tools\check_contracts.py")
    Invoke-Check "golden 构建清单" $python @("tools\golden.py", "verify")
    Invoke-Check "词典 strict" $python @("tools\dict.py", "check", "--strict")
    Invoke-Check "Python 单元测试" $python @("-m", "unittest", "discover", "-s", "tests", "-p", "test_dictlib.py")
    Invoke-Check "Python 语法" $python @("-m", "py_compile", "tools\build.py", "tools\check_contracts.py", "tools\dict.py", "tools\dictlib.py", "tools\golden.py", "tools\package.py")
}

if ($node) {
    Invoke-Check "runtime 测试" $node @("tests\runtime.test.mjs")
    Invoke-Check "rules 测试" $node @("tests\rules.test.mjs")
    Invoke-Check "search feature 测试" $node @("tests\search-feature.test.mjs")

    if (-not $NoBuild) {
        Write-Head "合成注入测试"
        & (Join-Path $PSScriptRoot "test-inject.ps1")
        if ($LASTEXITCODE -eq 0) { Write-Ok "合成注入测试" } else { Write-Fail "合成注入测试 (exit $LASTEXITCODE)" }
    }

    Write-Head "运行时/OCR JS 语法"
    $jsFiles = @()
    $runtimeManifest = Get-Content -LiteralPath "src\runtime\modules.json" -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($module in $runtimeManifest.modules) { $jsFiles += (Join-Path "src\runtime" $module.file) }
    $ocrManifest = Get-Content -LiteralPath "src\ocr\manifest.json" -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($script in $ocrManifest.pageScripts) { $jsFiles += (Join-Path "src\ocr" $script.source) }
    $jsFiles += (Join-Path "src\ocr" $ocrManifest.server.entry)
    $jsFiles += @(Get-ChildItem "src\ocr\worker" -File -Filter *.js | ForEach-Object { $_.FullName })
    $jsFailed = $false
    foreach ($file in $jsFiles) {
        if (-not (Test-Path -LiteralPath $file)) { Write-Fail "缺少 JS：$file"; $jsFailed = $true; continue }
        & $node --check $file 2>$null
        if ($LASTEXITCODE -ne 0) { Write-Fail "JS 语法：$file"; $jsFailed = $true }
    }
    if (-not $jsFailed) { Write-Ok "JS 语法 $($jsFiles.Count) 个" }
}

Write-Head "PowerShell BOM / 语法"
$psFiles = @(Get-ChildItem -Path "." -Recurse -File -Include *.ps1,*.psm1 |
    Where-Object { $_.FullName -notmatch '\\\.git\\|\\dist\\|\\build\\|\\bin\\ocr\\\.tools' })
$badBom = 0
$badSyntax = 0
foreach ($file in $psFiles) {
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    if (-not ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)) {
        Write-Fail "缺少 UTF-8 BOM：$($file.FullName)"; $badBom++
    }
    $tokens = $null
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors -and $errors.Count -gt 0) {
        Write-Fail "语法错误：$($file.FullName)：$($errors[0].Message)"; $badSyntax++
    }
}
if ($badBom -eq 0) { Write-Ok "PowerShell BOM $($psFiles.Count) 个" }
if ($badSyntax -eq 0) { Write-Ok "PowerShell 语法 $($psFiles.Count) 个" }

Write-Head "生成物未跟踪"
$git = Resolve-Tool $Git "GIT" @("git")
if ($git) {
    $tracked = @(& $git ls-files "bin/alecaframe-zh-cn.js" "bin/ocr" 2>$null)
    if ($tracked.Count -gt 0) { Write-Fail "生成物被跟踪：$($tracked -join ', ')" } else { Write-Ok "bin 生成物未跟踪" }
    $dirty = @(& $git status --porcelain 2>$null)
    if ($dirty.Count -gt 0) { Write-Ok "工作树有未提交修改（不影响本地验证）" } else { Write-Ok "工作树干净" }
} else {
    Write-Fail "找不到 git，无法检查生成物"
}

if ($Package -and $python) {
    $version = (Get-Content -LiteralPath "VERSION" -Raw -Encoding UTF8).Trim()
    Invoke-Check "测试包" $python @("tools\package.py", "--version", $version, "--name", "AlecaFrame-ZH-$version", "--out", "dist")
    $pkg = Join-Path "dist" "AlecaFrame-ZH-$version"
    $infoPath = Join-Path $pkg "PACKAGE-INFO.json"
    if (Test-Path -LiteralPath $infoPath) {
        $info = Get-Content -LiteralPath $infoPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $bundle = Join-Path $pkg "bin\alecaframe-zh-cn.js"
        $hash = (Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($hash -eq $info.bundle.sha256) { Write-Ok "包内 bundle hash" } else { Write-Fail "包内 bundle hash 不一致" }
        if (Test-Path (Join-Path $pkg "scripts\Export-Diagnostics.ps1")) { Write-Ok "包内诊断脚本" } else { Write-Fail "包内缺诊断脚本" }
        if (Test-Path (Join-Path $pkg "bin\ocr\manifest.json")) { Write-Ok "包内 OCR manifest" } else { Write-Fail "包内缺 OCR manifest" }
    } else { Write-Fail "缺少包信息：$infoPath" }
}

Write-Host ""
Write-Host ("结果：PASS={0} FAIL={1}" -f $script:Passed, $script:Failed) -ForegroundColor $(if ($script:Failed -eq 0) { "Green" } else { "Red" })
Pop-Location
if ($script:Failed -gt 0) { exit 1 }
exit 0
