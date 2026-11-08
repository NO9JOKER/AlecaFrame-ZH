#requires -Version 5.1
# 兼容包装：旧入口 scripts\test-inject.ps1 转发到 tools\test-inject.ps1。
$root = Split-Path -Parent $PSScriptRoot
& (Join-Path $root "tools\test-inject.ps1") @args
exit $LASTEXITCODE
