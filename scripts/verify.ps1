#requires -Version 5.1
<#
  兼容包装：旧入口 scripts\verify.ps1 转发到新架构 tools\verify.ps1。
#>
$root = Split-Path -Parent $PSScriptRoot
& (Join-Path $root "tools\verify.ps1") @args
exit $LASTEXITCODE
