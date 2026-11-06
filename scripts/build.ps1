# AlecaFrame-ZH 构建脚本（Windows / PowerShell）
#   默认：合并现有 dict/*.tsv -> bin/alecaframe-zh-cn.js
#   -WithItems：先从本机 AlecaFrame 游戏数据重新生成 dict/items.tsv，再合并
param(
    [switch]$WithItems
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    $python = $env:PYTHON
    if (-not $python) { $python = "python" }
    if ($WithItems) {
        & $python "src\build_items.py"
        if ($LASTEXITCODE -ne 0) { throw "build_items.py 失败" }
    }
    & $python "src\build.py"
    if ($LASTEXITCODE -ne 0) { throw "build.py 失败" }
    Write-Host "构建完成：bin\alecaframe-zh-cn.js"
} finally {
    Pop-Location
}
