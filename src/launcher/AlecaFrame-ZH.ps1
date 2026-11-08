#requires -Version 5.1
<#
  AlecaFrame 简体中文补丁 - 启动器入口
  源码模块：Common / Snapshot / Overwolf / Patch / Ocr / Cli。
  页面、注入脚本、宿主补丁和 bundle 路径均来自 pages.json。
#>
param(
    [ValidateSet("Start", "Restore", "Toggle", "Status", "InstallShortcuts", "Refresh", "OcrOn", "OcrOff", "InstallOcr")]
    [string]$Action = "Status",
    [switch]$NoGui
)

$ErrorActionPreference = "Stop"
$script:NoGui = [bool]$NoGui
$script:LauncherDir = $PSScriptRoot

# 源码目录（src/launcher）与打包后根目录都支持：向上找 pages.json。
$script:PkgRoot = $env:AFCN_ROOT
if (-not $script:PkgRoot) {
    $candidates = @(
        $PSScriptRoot,
        (Split-Path -Parent $PSScriptRoot),
        (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath (Join-Path $candidate "pages.json"))) {
            $script:PkgRoot = $candidate
            break
        }
    }
}
if (-not $script:PkgRoot) {
    throw "未找到 pages.json；请从仓库根或打包目录运行启动器。"
}

$script:PagesFile = Join-Path $script:PkgRoot "pages.json"
if (-not (Test-Path -LiteralPath $script:PagesFile)) {
    throw "缺少页面注册表：$script:PagesFile"
}
$script:PagesDoc = Get-Content -LiteralPath $script:PagesFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($null -eq $script:PagesDoc -or $script:PagesDoc.schemaVersion -ne 1) {
    throw "pages.json schemaVersion 必须为 1。"
}

$script:AppId = [string]$script:PagesDoc.appId
$script:Pages = @($script:PagesDoc.pages | Where-Object { $_.inject } | ForEach-Object { [string]$_.file })
$script:ExtraOfficialFiles = @()
$script:OcrInjections = @()
$script:OcrScripts = @()
foreach ($page in @($script:PagesDoc.pages)) {
    foreach ($patch in @($page.hostPatches)) {
        if ($patch -and ($script:ExtraOfficialFiles -notcontains [string]$patch)) {
            $script:ExtraOfficialFiles += [string]$patch
        }
    }
    $scripts = @($page.ocrScripts | Where-Object { $_ } | ForEach-Object { [string]$_ })
    if ($scripts.Count -gt 0) {
        $script:OcrInjections += @{ Page = [string]$page.file; Scripts = $scripts }
        foreach ($scriptName in $scripts) {
            if ($script:OcrScripts -notcontains $scriptName) {
                $script:OcrScripts += $scriptName
            }
        }
    }
}
$script:ZhJsRel = ([string]$script:PagesDoc.bundle.deployPath).Replace("/", "\")
$script:ScriptTag = [string]$script:PagesDoc.bundle.scriptTag
$script:FlagArgs = @(
    "--ow-disable-features=extension-validation,read-opk-from-memory",
    "--ow-enable-features=force-validation-report-only"
)
$script:OcrStateSub = "RelicChineseOcr"
$script:OcrPort = 38147

$script:BinDir = Join-Path $script:PkgRoot "bin"
$script:OcrDir = Join-Path $script:BinDir "ocr"
$script:StateDir = Join-Path $script:PkgRoot "state"
$script:OcrStateDir = Join-Path $script:StateDir $script:OcrStateSub
$script:LogDir = Join-Path $script:PkgRoot "logs"
$script:LogFile = Join-Path $script:LogDir "launcher.log"
$script:SettingsFile = Join-Path $script:PkgRoot "AlecaFrame-ZH.settings.json"

New-Item -ItemType Directory -Force -Path $script:StateDir | Out-Null
New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null

. (Join-Path $PSScriptRoot "lib\Logging.ps1")
. (Join-Path $PSScriptRoot "lib\Snapshot.ps1")
. (Join-Path $PSScriptRoot "lib\Overwolf.ps1")
. (Join-Path $PSScriptRoot "lib\Patch.ps1")
. (Join-Path $PSScriptRoot "lib\Ocr.ps1")
. (Join-Path $PSScriptRoot "lib\State.ps1")
. (Join-Path $PSScriptRoot "lib\Cli.ps1")

try {
    switch ($Action) {
        "Start" { Invoke-StartChinese }
        "Restore" { Invoke-RestoreEnglish }
        "Toggle" { Invoke-Toggle }
        "Status" { Invoke-Status }
        "InstallShortcuts" { Invoke-InstallShortcuts }
        "Refresh" { Invoke-RefreshZh }
        "OcrOn" { Invoke-OcrOn }
        "OcrOff" { Invoke-OcrOff }
        "InstallOcr" { Invoke-InstallOcr }
    }
    exit 0
} catch {
    $msg = $_.Exception.Message
    Write-Log "错误：$msg"
    try {
        Stop-OcrHelper
        $verDir = Get-AppVersionDir
        if (Test-Patched -VersionPath $verDir.FullName) {
            Restore-OfficialFiles -AppVersion $verDir.Name -VersionPath $verDir.FullName
        }
    } catch { Write-Log "恢复官方文件失败：$($_.Exception.Message)" }
    Show-Error $msg "AlecaFrame-ZH 出错"
    exit 1
}
