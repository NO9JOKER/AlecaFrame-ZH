#requires -Version 5.1
<#
  注入/还原 自检脚本（不会碰真实的 AlecaFrame 安装）

  [1] 在合成的临时页面树上验证 Apply-Patch / Apply-OcrPatch / Save-OfficialSnapshot / Restore-OfficialFiles
  [2] 只读检查真实已安装 AlecaFrame 3.0.6 里补丁锚点是否仍然存在（版本升级后先跑这个）

  用法：
    powershell -ExecutionPolicy Bypass -File scripts\test-inject.ps1
    powershell -ExecutionPolicy Bypass -File scripts\test-inject.ps1 -KeepTemp
#>
param(
    [string]$VersionPath = "",
    [switch]$KeepTemp
)

$ErrorActionPreference = "Stop"
$PkgRoot = Split-Path -Parent $PSScriptRoot
$AppId = "afmcagbpgggkpdkokjhjkllpegnadmkignlonpjm"

$script:fail = 0
function Check {
    param([bool]$Ok, [string]$Name)
    if ($Ok) { Write-Host ("  [PASS] " + $Name) -ForegroundColor Green }
    else { Write-Host ("  [FAIL] " + $Name) -ForegroundColor Red; $script:fail++ }
}

$tmpRoot = Join-Path $PkgRoot "tests\tmp"
$work = Join-Path $tmpRoot ("inject-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force -Path $work | Out-Null

# ---- 合成一个最小但结构正确的 AlecaFrame web 树 ----
$web = Join-Path $work "web"
$jsDir = Join-Path $web "assets\js"
$relicDir = Join-Path $jsDir "relicOverlay"
New-Item -ItemType Directory -Force -Path $relicDir | Out-Null

$pages = @("main.html", "AFBuilds.html", "InGameNotification.html", "relicOverlay.html", "relicRecommendation.html", "rivenOverlay.html", "SquadMakingMain.html", "SquadMakingSquad.html", "tradeFinishedNotification.html", "background.html")
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
foreach ($p in $pages) {
    $body = "<!doctype html>`r`n<html><body>`r`n  <div>Placeholder</div>`r`n</body></html>`r`n"
    if ($p -eq "rivenOverlay.html") {
        $body = "<!doctype html>`r`n<html><body>`r`n  <div class=`"rivenDetailsStat positive`" v-for=`"stat in list`">`r`n    <div v-html=`"stat.description`"></div>`r`n  </div>`r`n</body></html>`r`n"
    }
    [System.IO.File]::WriteAllText((Join-Path $web $p), $body, $utf8NoBom)
}
$relicMain = @'
console.log("fake relic window");
var relicWindowInitialized = false;
function RelicWindowInitialization() {
    if (relicWindowInitialized) { return; }
    relicWindowInitialized = true;
    setTimeout(() => {
        sendPage("relic");
    }, 2500);
}
function onData(data) {
    if (data) {
        relicsApp.relics = data;
    } else {
        console.log("Failed to get relic data: " + data);
        relicsApp.error = true;
        relicsApp.errorMessage = data;
    }
}
'@
[System.IO.File]::WriteAllText((Join-Path $relicDir "main.js"), $relicMain, $utf8NoBom)
$verName = if ($VersionPath) { Split-Path -Leaf $VersionPath } else { "" }
if (-not $verName) { $verName = "synthetic" }

# ---- 加载启动器里的函数（去掉末尾执行入口，dot-source） ----
$launcher = Join-Path $PkgRoot "bin\AlecaFrame-ZH.ps1"
$text = [System.IO.File]::ReadAllText($launcher, [System.Text.Encoding]::UTF8)
$switchIdx = $text.IndexOf("switch (`$Action)")
if ($switchIdx -lt 0) { throw "无法定位启动器执行入口" }
$cut = $text.LastIndexOf("try {", $switchIdx)
if ($cut -lt 0) { throw "无法定位启动器执行入口" }
$stripped = $text.Substring(0, $cut)
$tempLauncher = Join-Path $PkgRoot "bin\.inject-test.ps1"
[System.IO.File]::WriteAllText($tempLauncher, $stripped, (New-Object System.Text.UTF8Encoding($true)))
. $tempLauncher
Remove-Item -LiteralPath $tempLauncher -Force -ErrorAction SilentlyContinue
# 快照/日志写到临时目录，别污染仓库 state/
$script:StateDir = Join-Path $tmpRoot "state"
$script:LogDir = Join-Path $tmpRoot "logs"
$script:LogFile = Join-Path $script:LogDir "test.log"
New-Item -ItemType Directory -Force -Path $script:StateDir, $script:LogDir | Out-Null
$script:NoGui = $true

Write-Host "`n[1] 界面汉化注入"
Apply-Patch -VersionPath $work
Check (Test-Path (Join-Path $jsDir "alecaframe-zh-cn.js")) "主脚本已复制到 assets/js"
$bundlePath = Join-Path $jsDir "alecaframe-zh-cn.js"
$bundle = Get-Content $bundlePath -Raw -Encoding UTF8
Check ($bundle.Contains("__AFCN_DICT__")) "bundle 含词典"
Check ($bundle.Contains("__ALECAFRAME_ZH_CN_ITEMS__")) "bundle 含 OCR 兼容 shim"
Check ((Get-Content (Join-Path $web "main.html") -Raw).Contains("assets/js/alecaframe-zh-cn.js")) "main.html 含脚本标签"
$allTagged = $true
foreach ($p in $pages) {
    $c = Get-Content (Join-Path $web $p) -Raw
    if (-not $c.Contains("assets/js/alecaframe-zh-cn.js")) { $allTagged = $false; Write-Host "    缺少标签: $p" }
}
Check $allTagged "10 个页面全部注入脚本标签"

Write-Host "`n[2] 重复注入的幂等性"
$before = (Get-Content (Join-Path $web "main.html") -Raw).Split("alecaframe-zh-cn.js").Count
Apply-Patch -VersionPath $work
$after = (Get-Content (Join-Path $web "main.html") -Raw).Split("alecaframe-zh-cn.js").Count
Check ($before -eq $after) "重复 Apply-Patch 不重复插入标签"

Write-Host "`n[3] OCR 增强注入"
$ocrFiles = @("afzh-relic-ocr.js", "afzh-riven-ocr.js", "afzh-riven-overlay.js", "afzh-relic-ducats.js", "afzh-relic-overlay.js", "afzh-relic-recommendation.js", "afzh-relic-planner-cache.js", "afzh-inventory-price-sync.js", "afzh-inventory-images.js")
$ocrAvail = $true
foreach ($f in $ocrFiles) { if (-not (Test-Path (Join-Path $PkgRoot "bin\ocr\$f"))) { $ocrAvail = $false; Write-Host "    缺少 bin\ocr\$f" -ForegroundColor Yellow } }
if ($ocrAvail) {
    Apply-OcrPatch -VersionPath $work
    foreach ($f in $ocrFiles) { if (-not (Test-Path (Join-Path $jsDir $f))) { Check $false "缺少 $f" } }
    Check ((Get-Content (Join-Path $web "background.html") -Raw).Contains("afzh-relic-ocr.js")) "background.html 注入遗物 OCR 桥"
    Check ((Get-Content (Join-Path $web "background.html") -Raw).Contains("afzh-riven-ocr.js")) "background.html 注入裂罅 OCR 桥"
    Check ((Get-Content (Join-Path $web "relicOverlay.html") -Raw).Contains("afzh-relic-overlay.js")) "relicOverlay.html 注入奖励叠加层"
    Check ((Get-Content (Join-Path $web "relicRecommendation.html") -Raw).Contains("afzh-relic-recommendation.js")) "relicRecommendation.html 注入推荐叠加层"
    Check ((Get-Content (Join-Path $web "main.html") -Raw).Contains("afzh-inventory-images.js")) "main.html 注入仓库图标脚本"
    $mainJs = Get-Content (Join-Path $relicDir "main.js") -Raw
    Check ($mainJs.Contains("ALECAFRAME_ZH_CN_REWARD_FALLBACK")) "relicOverlay/main.js 含奖励回退补丁"
    Check ($mainJs.Contains("alecaFrameZhCnStartRewardFallback")) "relicOverlay/main.js 含回退入口"
    $fastStart = $mainJs.Contains("}, 300);")
    Check $fastStart "relic 初始化已加速到 300ms"
    Check (-not $mainJs.Contains("}, 2500);")) "旧的 2500ms 延时已被替换"
    Check ((Get-Content (Join-Path $web "rivenOverlay.html") -Raw).Contains(':key="stat.description"')) "rivenOverlay.html 含 :key 补丁"
    $ocrBefore = (Get-Content (Join-Path $web "main.html") -Raw).Split("afzh-inventory-images.js").Count
    Apply-OcrPatch -VersionPath $work
    $ocrAfter = (Get-Content (Join-Path $web "main.html") -Raw).Split("afzh-inventory-images.js").Count
    Check ($ocrBefore -eq $ocrAfter) "重复 Apply-OcrPatch 不重复插入标签"
    Check (-not (Get-Content (Join-Path $relicDir "main.js") -Raw).Contains("ALECAFRAME_ZH_CN_REWARD_FALLBACK`r`nvar alecaFrameZhCnRewardResultKey`r`n// ALECAFRAME")) "奖励补丁不重复插入"
} else {
    Write-Host "  跳过：bin\ocr\ 尚未就绪" -ForegroundColor Yellow
}

Write-Host "`n[4] 快照 + 还原"
$clean = Join-Path $tmpRoot ("clean-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force -Path $clean | Out-Null
$copied = $false
if ($VersionPath -and (Test-Path (Join-Path $VersionPath "web"))) {
    Copy-Item (Join-Path $VersionPath "web") (Join-Path $clean "web") -Recurse -Force
    $copied = $true
}
if (-not $copied) {
    # 没有真实安装时，用一份未被改动的合成树充当“官方文件”
    New-Item -ItemType Directory -Force -Path (Join-Path $clean "web") | Out-Null
    foreach ($p in $pages) {
        $body = "<!doctype html>`r`n<html><body>`r`n  <div>Placeholder</div>`r`n</body></html>`r`n"
        if ($p -eq "rivenOverlay.html") { $body = "<!doctype html>`r`n<html><body>`r`n  <div class=`"rivenDetailsStat positive`" v-for=`"stat in list`">`r`n    <div v-html=`"stat.description`"></div>`r`n  </div>`r`n</body></html>`r`n" }
        [System.IO.File]::WriteAllText((Join-Path $clean "web\$p"), $body, $utf8NoBom)
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $clean "web\assets\js\relicOverlay") | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $clean "web\assets\js\relicOverlay\main.js"), $relicMain, $utf8NoBom)
}
Save-OfficialSnapshot -AppVersion $verName -VersionPath $clean
Check (Test-Path (Join-Path $script:StateDir ("official\" + $verName + "\web\main.html"))) "官方快照已建立"
Restore-OfficialFiles -AppVersion $verName -VersionPath $work
Check (-not (Get-Content (Join-Path $web "main.html") -Raw).Contains("alecaframe-zh-cn.js")) "还原后 main.html 无脚本标签"
Check (-not (Test-Path $bundlePath)) "还原后主脚本已删除"
Check (-not (Get-Content (Join-Path $relicDir "main.js") -Raw).Contains("ALECAFRAME_ZH_CN_REWARD_FALLBACK")) "还原后 relicOverlay/main.js 无补丁"
if ($ocrAvail) {
    Check (-not (Test-Path (Join-Path $jsDir "afzh-relic-ocr.js"))) "还原后 OCR 脚本已删除"
}

Write-Host "`n[5] 真实安装锚点只读检查"
if (-not $VersionPath) {
    $extRoot = Join-Path $env:LOCALAPPDATA "Overwolf\Extensions\$AppId"
    if (Test-Path $extRoot) {
        $VersionPath = (Get-ChildItem $extRoot -Directory |
            Where-Object { Test-Path (Join-Path $_.FullName "manifest.json") } |
            Sort-Object { try { [version]$_.Name } catch { [version]"0.0" } } -Descending |
            Select-Object -First 1).FullName
    }
}
if ($VersionPath -and (Test-Path (Join-Path $VersionPath "web"))) {
    $realWeb = Join-Path $VersionPath "web"
    Write-Host "    $VersionPath"
    $realMainJs = Join-Path $realWeb "assets\js\relicOverlay\main.js"
    if (Test-Path $realMainJs) {
        $c = Get-Content $realMainJs -Raw
        Check ($c.Contains("var relicWindowInitialized = false;")) "真实 relicOverlay/main.js 有初始化锚点"
        Check ($c.Contains('console.log("Failed to get relic data: " + data);')) "真实 relicOverlay/main.js 有失败分支锚点"
        Check ($c.Contains('sendPage("relic");')) "真实 relicOverlay/main.js 有 sendPage 锚点"
    } else { Check $false "真实安装缺少 relicOverlay/main.js" }
    $realRiven = Join-Path $realWeb "rivenOverlay.html"
    if (Test-Path $realRiven) {
        Check ((Get-Content $realRiven -Raw).Contains('class="rivenDetailsStat positive"')) "真实 rivenOverlay.html 有 rivenDetailsStat 模板"
    } else { Check $false "真实安装缺少 rivenOverlay.html" }
    foreach ($p in $pages) {
        $f = Join-Path $realWeb $p
        if ((Test-Path $f) -and ((Get-Content $f -Raw) -match "(?i)</body>")) { }
        else { Check $false "真实安装页面缺少 </body>：$p" }
    }
} else {
    Write-Host "  跳过：未找到本机 AlecaFrame 安装" -ForegroundColor Yellow
}

Write-Host "`n==== 结果 ===="
if ($script:fail -eq 0) { Write-Host "全部通过" -ForegroundColor Green } else { Write-Host "$($script:fail) 项失败" -ForegroundColor Red }
if (-not $KeepTemp) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath $clean -Recurse -Force -ErrorAction SilentlyContinue }
exit $(if ($script:fail -eq 0) { 0 } else { 1 })
