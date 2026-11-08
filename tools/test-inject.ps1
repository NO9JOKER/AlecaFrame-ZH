#requires -Version 5.1
<#
  合成注入测试：在 build/test-inject 下复制合成页面树，直接调用 bin/lib/Patch.ps1，
  断言 bundle 写入正确路径、每个注入页面都有 script 标签；不接触真实 AlecaFrame。
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
$failed = 0
function Check([string]$name, [bool]$ok) {
    if ($ok) { Write-Host "  [PASS] $name" -ForegroundColor Green }
    else { Write-Host "  [FAIL] $name" -ForegroundColor Red; $script:failed++ }
}

$bundle = Join-Path $root "bin\alecaframe-zh-cn.js"
$lib = Join-Path $root "bin\lib"
if (-not (Test-Path $bundle)) { Write-Host "[FAIL] 缺少 bin/alecaframe-zh-cn.js，先运行 tools/build.py" -ForegroundColor Red; Pop-Location; exit 1 }
if (-not (Test-Path (Join-Path $lib "Patch.ps1"))) { Write-Host "[FAIL] 缺少 bin/lib/Patch.ps1，先运行 tools/build.py" -ForegroundColor Red; Pop-Location; exit 1 }

$pagesDoc = Get-Content -LiteralPath (Join-Path $root "pages.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$script:NoGui = $true
$script:PkgRoot = $root
$script:BinDir = Join-Path $root "bin"
$script:Pages = @($pagesDoc.pages | Where-Object { $_.inject } | ForEach-Object { [string]$_.file })
$script:ZhJsRel = ([string]$pagesDoc.bundle.deployPath).Replace("/", "\")
$script:ScriptTag = [string]$pagesDoc.bundle.scriptTag
$script:ExtraOfficialFiles = @()
$script:OcrScripts = @()
$script:StateDir = Join-Path $root "state"
$script:LogDir = Join-Path $root "logs"
$script:LogFile = Join-Path $script:LogDir "test-inject.log"
New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null
. (Join-Path $lib "Logging.ps1")
. (Join-Path $lib "Patch.ps1")

$temp = Join-Path $root "build\test-inject"
if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $temp "web") | Out-Null
foreach ($page in $script:Pages) {
    [IO.File]::WriteAllText((Join-Path $temp "web\$page"), '<!doctype html><html><head></head><body>test</body></html>', (New-Object System.Text.UTF8Encoding($false)))
}

try {
    Apply-Patch -VersionPath $temp
    $deployed = Join-Path $temp $script:ZhJsRel
    Check "bundle 部署路径" (Test-Path -LiteralPath $deployed)
    Check "bundle 大小一致" ((Get-Item $deployed).Length -eq (Get-Item $bundle).Length)
    Check "Test-Patched" (Test-Patched -VersionPath $temp)
    foreach ($page in $script:Pages) {
        $content = [IO.File]::ReadAllText((Join-Path $temp "web\$page"), [System.Text.Encoding]::UTF8)
        Check "$page 注入标签" $content.Contains("alecaframe-zh-cn.js")
    }

    # OCR 页面脚本：按 manifest 平铺复制到合成页面树，部署名不变。
    $ocrManifestPath = Join-Path $root "bin\ocr\manifest.json"
    if (Test-Path -LiteralPath $ocrManifestPath) {
        $ocrManifest = Get-Content -LiteralPath $ocrManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($script in $ocrManifest.pageScripts) {
            $source = Join-Path $root ("bin\ocr\" + $script.deployName)
            $destination = Join-Path $temp ("web\assets\js\" + $script.deployName)
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
            Copy-Item -LiteralPath $source -Destination $destination -Force
            Check ("OCR 部署 " + $script.deployName) (Test-Path -LiteralPath $destination)
        }
    } else {
        Check "OCR manifest 存在" $false
    }
} finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
Pop-Location
if ($failed -gt 0) { Write-Host "test-inject: FAIL ($failed)" -ForegroundColor Red; exit 1 }
Write-Host "test-inject: OK" -ForegroundColor Green
exit 0
