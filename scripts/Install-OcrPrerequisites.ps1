# MIOEU/AlecaFrame-ZH (MIT). OCR protocol and window globals are frozen; see src/ocr/CONTRACT.md.
# 工具目录：<包根>\bin\ocr\.tools；状态目录：<包根>\state。详见 src\ocr\CONTRACT.md。
[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# All OCR dependencies stay inside the project.  No system-wide Python or
# Node.js installation is required, and the launcher uses these local copies.
# 路径适配（本项目）：工具目录与 OCR worker 脚本同目录，保证
# relic-ocr-server.js 中 path.dirname(paddleWorkerPath)/.tools/paddleocr-home
# 的相对关系与实际安装位置一致；不再使用安装脚本所在目录下的 .tools。
$pkgRoot = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $pkgRoot "bin\ocr\.tools"
$pythonRoot = Join-Path $toolsRoot "python311-portable"
$pythonExe = Join-Path $pythonRoot "python.exe"
$nodeRoot = Join-Path $toolsRoot "node"
$nodeExe = Join-Path $nodeRoot "node.exe"
$cacheRoot = Join-Path $toolsRoot "paddleocr-home"
$downloadRoot = Join-Path $toolsRoot "downloads"
# pip 的 http 缓存必须显式落在包内。安装器为了隔离 Paddle 模型会把
# HOME/USERPROFILE 指到包内，pip 20.3.4 因此解析不出 Windows 缓存目录，
# 会退化成「当前目录\pip\cache」——在包根留下一份约 1 GB 的缓存。
# （实测：USERPROFILE 被改写时 `pip cache dir` 返回 <cwd>\pip\cache。）
$pipCacheRoot = Join-Path $toolsRoot "pip-cache"
$pythonVersion = "3.11.9"
$nodeVersion = "20.18.0"

# Mirrors are intentionally explicit so users in mainland China do not need
# to download Python/Node/PyPI packages from overseas default endpoints.
# 下载源全部做成「多源回退」：任一源 404/超时/502 时自动换下一个，最后一个源失败才报错。
$pythonZipUrls = @(
    "https://mirrors.huaweicloud.com/python/$pythonVersion/python-$pythonVersion-embed-amd64.zip",
    "https://npmmirror.com/mirrors/python/$pythonVersion/python-$pythonVersion-embed-amd64.zip",
    "https://mirrors.aliyun.com/python-release/windows/python-$pythonVersion-embed-amd64.zip"
)
$nodeZipUrls = @(
    "https://npmmirror.com/mirrors/node/v$nodeVersion/node-v$nodeVersion-win-x64.zip",
    "https://mirrors.huaweicloud.com/nodejs/v$nodeVersion/node-v$nodeVersion-win-x64.zip",
    "https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/v$nodeVersion/node-v$nodeVersion-win-x64.zip",
    "https://mirrors.ustc.edu.cn/nodejssource/v$nodeVersion/node-v$nodeVersion-win-x64.zip"
)
$getPipUrls = @(
    "https://mirrors.aliyun.com/pypi/get-pip.py",
    "https://bootstrap.pypa.io/get-pip.py"
)
$pypiMirrors = @(
    "https://mirrors.aliyun.com/pypi/simple",
    "https://pypi.tuna.tsinghua.edu.cn/simple",
    "https://mirrors.ustc.edu.cn/pypi/simple",
    "https://mirrors.cloud.tencent.com/pypi/simple"
)
# PaddlePaddle 官方镜像 2026-11-10 实测 502 Bad Gateway，pip 会报
# "No matching distribution found"；按 阿里云/清华/中科大/腾讯 PyPI → 官方 回退。
$paddleCpuMirrors = @(
    "https://mirrors.aliyun.com/pypi/simple",
    "https://pypi.tuna.tsinghua.edu.cn/simple",
    "https://mirrors.ustc.edu.cn/pypi/simple",
    "https://mirrors.cloud.tencent.com/pypi/simple",
    "https://www.paddlepaddle.org.cn/packages/stable/cpu/"
)

# 全过程写入日志，失败时窗口停留并提示日志位置（否则安装窗口一闪而过，用户拿不到信息）
$transcriptPath = Join-Path $pkgRoot "logs\ocr-install.log"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $transcriptPath) | Out-Null
try { Start-Transcript -Path $transcriptPath -Force | Out-Null } catch { }

trap {
    Write-Host ""
    Write-Host ("[OCR 前置安装] 失败：" + $_.Exception.Message) -ForegroundColor Red
    Write-Host ("完整日志：" + $transcriptPath) -ForegroundColor Yellow
    try { Stop-Transcript | Out-Null } catch { }
    Read-Host "按回车关闭窗口"
    exit 1
}

function Write-Step {
    param([string]$Text)
    Write-Host "[OCR 前置安装] $Text" -ForegroundColor Cyan
}

# PowerShell 5.1 的坑：$ErrorActionPreference="Stop" 时，native 命令往 stderr 写内容
# 再被重定向（*> / 2>）会被当成终止性错误（NativeCommandError），脚本会在探测阶段直接退出。
# 因此探测类调用必须临时把 EAP 放宽到 Continue。
function Invoke-NativeQuiet {
    param([string]$FilePath, [string[]]$Arguments)
    $oldEap = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $FilePath @Arguments *> $null
    } finally {
        $ErrorActionPreference = $oldEap
    }
}

function Get-NativeVersion {
    param([string]$FilePath)
    $oldEap = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        return (((& $FilePath --version 2>$null) -join " ").Trim())
    } finally {
        $ErrorActionPreference = $oldEap
    }
}

function Get-DownloadFile {
    param([string]$Url, [string]$Destination)
    if ((Test-Path -LiteralPath $Destination) -and (Get-Item -LiteralPath $Destination).Length -gt 0) {
        Write-Step "复用已下载文件：$(Split-Path -Leaf $Destination)"
        return
    }
    Write-Step "下载：$Url"
    Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
}

function Get-DownloadFileFromMirrors {
    param([string[]]$Urls, [string]$Destination)
    if ((Test-Path -LiteralPath $Destination) -and (Get-Item -LiteralPath $Destination).Length -gt 0) {
        Write-Step "复用已下载文件：$(Split-Path -Leaf $Destination)"
        return
    }
    foreach ($url in $Urls) {
        try {
            Write-Step "下载（源）：$url"
            Invoke-WebRequest -Uri $url -OutFile $Destination -UseBasicParsing -ErrorAction Stop
            if ((Test-Path -LiteralPath $Destination) -and (Get-Item -LiteralPath $Destination).Length -gt 0) { return }
        } catch {
            Write-Step ("该源失败，自动换源：" + $_.Exception.Message)
            if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue }
        }
    }
    throw "所有下载源均失败：$(Split-Path -Leaf $Destination)"
}

function Expand-ArchiveReplace {
    param([string]$ZipPath, [string]$Destination)
    if (Test-Path -LiteralPath $Destination) {
        Remove-Item -LiteralPath $Destination -Recurse -Force
    }
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $Destination -Force
}

function Get-DirectorySize {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return [int64]0 }
    $sum = (Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
    if ($null -eq $sum) { return [int64]0 }
    return [int64]$sum
}

# 只删除确认是 pip http 缓存的目录，避免误删用户自己的文件。
function Remove-PipCacheIfSafe {
    param([string]$Path, [string]$Label)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $isPipCache = $false
    foreach ($probe in @("cache\http", "cache\selfcheck", "http", "selfcheck")) {
        if (Test-Path -LiteralPath (Join-Path $Path $probe)) { $isPipCache = $true; break }
    }
    if (-not $isPipCache) {
        Write-Step "跳过清理 $Label（不是 pip 缓存目录）：$Path"
        return
    }
    $size = Get-DirectorySize $Path
    try {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        Write-Step ("已清理{0}：{1} MB（{2}）" -f $Label, [Math]::Round($size / 1MB, 0), $Path)
    } catch {
        Write-Step ("清理{0}失败（运行时不需要该缓存，可手动删除 {1}）：{2}" -f $Label, $Path, $_.Exception.Message)
    }
}

function Test-PythonPackages {
    if (-not (Test-Path -LiteralPath $pythonExe)) { return $false }
    # PowerShell 5.1 调用原生程序时会丢掉参数里的双引号：版本断言写双引号会被 Python
    # 读成 `assert paddle.__version__ == 2.6.2`（SyntaxError），让本函数永远返回 false、
    # 每次运行都重新跑 pip（实测 2026-11-08 的 OCR 安装日志）。这里改用单引号字符串。
    $versionCheck = @'
import paddle, paddleocr, numpy, PIL
assert paddle.__version__ == '2.6.2', paddle.__version__
assert paddleocr.__version__ == '2.9.1', paddleocr.__version__
assert numpy.__version__ == '1.26.4', numpy.__version__
assert PIL.__version__ == '12.3.0', PIL.__version__
'@
    Invoke-NativeQuiet -FilePath $pythonExe -Arguments @("-c", $versionCheck)
    return $LASTEXITCODE -eq 0
}

function Test-PaddleModels {
    # PaddleOCR 2.9.1 把模型放在 ~/.paddleocr；本项目把 HOME/USERPROFILE 指到 .tools，
    # 所以实际落在 <toolsRoot>\.paddleocr（旧版本/其它环境也可能在 paddleocr-home 下）。
    $roots = @(
        (Join-Path $toolsRoot ".paddleocr"),
        (Join-Path $cacheRoot ".paddleocr")
    )
    $relFiles = @(
        "whl\det\ch\ch_PP-OCRv4_det_infer\inference.pdmodel",
        "whl\det\ch\ch_PP-OCRv4_det_infer\inference.pdiparams",
        "whl\rec\ch\ch_PP-OCRv4_rec_infer\inference.pdmodel",
        "whl\rec\ch\ch_PP-OCRv4_rec_infer\inference.pdiparams",
        "whl\cls\ch_ppocr_mobile_v2.0_cls_infer\inference.pdmodel",
        "whl\cls\ch_ppocr_mobile_v2.0_cls_infer\inference.pdiparams"
    )
    foreach ($root in $roots) {
        $missing = @($relFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $root $_)) })
        if ($missing.Count -eq 0) { return $true }
    }
    return $false
}

function Ensure-PortablePython {
    $pythonReady = $false
    if (Test-Path -LiteralPath $pythonExe) {
        $installedVersion = Get-NativeVersion $pythonExe
        $pythonReady = $LASTEXITCODE -eq 0 -and $installedVersion -eq "Python $pythonVersion"
        if ($pythonReady -and -not $Force) {
            Write-Step "便携 Python $pythonVersion 已存在，跳过下载和解压。"
            return
        }
        if (-not $pythonReady) {
            Write-Step "现有便携 Python 不可用或版本不符（$installedVersion），将重新安装。"
        }
    }
    $zipPath = Join-Path $downloadRoot "python-$pythonVersion-embed-amd64.zip"
    Get-DownloadFileFromMirrors -Urls $pythonZipUrls -Destination $zipPath
    Expand-ArchiveReplace -ZipPath $zipPath -Destination $pythonRoot
    $pthPath = Join-Path $pythonRoot "python311._pth"
    $pth = @("python311.zip", ".", "Lib\\site-packages", "", "import site")
    $pth | Set-Content -LiteralPath $pthPath -Encoding ASCII
    if (-not (Test-Path -LiteralPath $pythonExe)) {
        throw "便携 Python 解压后缺少 python.exe。"
    }
}

function Ensure-PortableNode {
    $nodeReady = $false
    if (Test-Path -LiteralPath $nodeExe) {
        $installedVersion = Get-NativeVersion $nodeExe
        $nodeReady = $LASTEXITCODE -eq 0 -and $installedVersion -eq "v$nodeVersion"
        if ($nodeReady -and -not $Force) {
            Write-Step "便携 Node.js v$nodeVersion 已存在，跳过下载和解压。"
            return
        }
        if (-not $nodeReady) {
            Write-Step "现有便携 Node.js 不可用或版本不符（$installedVersion），将重新安装。"
        }
    }
    $zipPath = Join-Path $downloadRoot "node-v$nodeVersion-win-x64.zip"
    $extractRoot = Join-Path $downloadRoot "node-v$nodeVersion-win-x64"
    Get-DownloadFileFromMirrors -Urls $nodeZipUrls -Destination $zipPath
    if (Test-Path -LiteralPath $extractRoot) { Remove-Item -LiteralPath $extractRoot -Recurse -Force }
    Expand-Archive -LiteralPath $zipPath -DestinationPath $downloadRoot -Force
    if (-not (Test-Path -LiteralPath (Join-Path $extractRoot "node.exe"))) {
        throw "Node.js 解压后缺少 node.exe。"
    }
    if (Test-Path -LiteralPath $nodeRoot) { Remove-Item -LiteralPath $nodeRoot -Recurse -Force }
    Move-Item -LiteralPath $extractRoot -Destination $nodeRoot
}

New-Item -ItemType Directory -Path $toolsRoot,$downloadRoot,$cacheRoot,$pipCacheRoot -Force | Out-Null
$env:PADDLE_HOME = $cacheRoot
$env:XDG_CACHE_HOME = $cacheRoot
# pip 缓存固定到包内绝对路径；不设置时 pip 会因下面的 USERPROFILE 改写而落到 <cwd>\pip\cache。
$env:PIP_CACHE_DIR = $pipCacheRoot
# 必须与运行时一致：bin\ocr\relic-ocr-server.js 启动 Python worker 时把 HOME/USERPROFILE
# 设成 <tools>\.tools\paddleocr-home，PaddleOCR 的 ~/.paddleocr 就落在那里。
# 早期版本这里写成 $toolsRoot，导致模型装到 .tools\.paddleocr、运行时要重新下载。
$env:HOME = $cacheRoot
$env:USERPROFILE = $cacheRoot

# 兼容早期安装：把模型目录搬到运行时真正读取的位置，避免重复下载
$legacyModelDir = Join-Path $toolsRoot ".paddleocr"
$modelDir = Join-Path $cacheRoot ".paddleocr"
if ((Test-Path -LiteralPath $legacyModelDir) -and -not (Test-Path -LiteralPath $modelDir)) {
    Write-Step "迁移已下载的模型到运行时目录：$modelDir"
    Move-Item -LiteralPath $legacyModelDir -Destination $modelDir -Force
}

Write-Step "准备便携 Python $pythonVersion"
Ensure-PortablePython

if (-not (Test-PythonPackages) -or $Force) {
    $getPipPath = Join-Path $downloadRoot "get-pip.py"
    Get-DownloadFileFromMirrors -Urls $getPipUrls -Destination $getPipPath
    Write-Step "安装 pip（阿里云 PyPI 镜像）"
    & $pythonExe $getPipPath --no-warn-script-location
    if ($LASTEXITCODE -ne 0) { throw "pip 安装失败。" }

    $paddleInstalled = $false
    foreach ($mirror in $paddleCpuMirrors) {
        Write-Step "安装 PaddlePaddle CPU 2.6.2（镜像：$mirror）"
        & $pythonExe -m pip install --disable-pip-version-check --no-warn-script-location --upgrade `
            "paddlepaddle==2.6.2" -i $mirror
        if ($LASTEXITCODE -eq 0) { $paddleInstalled = $true; break }
        Write-Step "该镜像不可用，尝试下一个。"
    }
    if (-not $paddleInstalled) { throw "PaddlePaddle 安装失败：所有镜像均不可用，请检查网络。" }

    # OpenCV 必须钉在 4.11：4.12 起要求 numpy>=2，与 paddleocr 的 numpy<2 冲突，
    # 不钉版时 pip 会为解析依赖下载 9 个 OpenCV 变体（首次下载约 950 MiB，
    # 钉版后约 304 MiB），而且装完还要回溯。
    $ocrDepsInstalled = $false
    foreach ($mirror in $pypiMirrors) {
        Write-Step "安装 PaddleOCR、NumPy 和 Pillow（镜像：$mirror）"
        & $pythonExe -m pip install --disable-pip-version-check --no-warn-script-location --upgrade `
            "paddleocr==2.9.1" "numpy==1.26.4" "pillow==12.3.0" `
            "opencv-python==4.11.0.86" "opencv-contrib-python==4.11.0.86" "opencv-python-headless==4.11.0.86" `
            -i $mirror
        if ($LASTEXITCODE -eq 0) { $ocrDepsInstalled = $true; break }
        Write-Step "该镜像不可用，尝试下一个。"
    }
    if (-not $ocrDepsInstalled) { throw "PaddleOCR 依赖安装失败：所有镜像均不可用，请检查网络。" }
} else {
    Write-Step "Python OCR 依赖及版本已符合要求，跳过安装。"
}

Write-Step "准备便携 Node.js $nodeVersion"
Ensure-PortableNode

if (Test-PaddleModels) {
    Write-Step "PaddleOCR 中文模型已存在且完整，跳过下载。"
} else {
    Write-Step "PaddleOCR 中文模型缺失，将初始化下载。"
    # PowerShell 5.1 在真实控制台 + Start-Transcript 下用 `& python -c` 跑 PaddleOCR
    # 首次下载时，tqdm 进度条输出会抛 IndexOutOfRangeException（实测 2026-11-09 首次
    # 安装：模型其实已下载完成，却报「索引超出了数组界限」并退出码 1）。
    # 改为临时 .py 文件 + 全部输出重定向到日志文件，且最终以「模型文件是否齐全」判定成功，
    # 避免“实际已装好却报错”。
    $warmupScript = Join-Path $downloadRoot "paddleocr-warmup.py"
    $warmupLog = Join-Path $downloadRoot "paddleocr-warmup.log"
    $warmupCode = @'
from paddleocr import PaddleOCR

PaddleOCR(lang="ch", use_angle_cls=True, show_log=False, use_mkldnn=False)
print("PaddleOCR ready")
'@
    [System.IO.File]::WriteAllText($warmupScript, $warmupCode, (New-Object System.Text.UTF8Encoding($false)))
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $pythonExe $warmupScript *> $warmupLog
    } catch {
        Write-Step ("模型初始化命令异常（继续按模型文件校验）：" + $_.Exception.Message)
    } finally {
        $ErrorActionPreference = $oldEap
    }
    if (-not (Test-PaddleModels)) {
        $warmupTail = ""
        if (Test-Path -LiteralPath $warmupLog) {
            $warmupTail = (Get-Content -LiteralPath $warmupLog -Encoding UTF8 -Tail 15 -ErrorAction SilentlyContinue) -join "`r`n"
        }
        throw ("PaddleOCR 初始化完成后，中文模型文件仍不完整。" + $(if ($warmupTail) { "`r`n最近日志（" + $warmupLog + "）：`r`n" + $warmupTail } else { "" }))
    }
    Write-Step "PaddleOCR 中文模型已就绪。"
}

& $nodeExe --version
if ($LASTEXITCODE -ne 0) { throw "Node.js 验证失败。" }

# 安装成功后清理下载缓存：pip 的 http 缓存与安装器下载的 zip 只用于下载/重试，
# 运行时不需要。旧版安装器会把 pip 缓存写到包根（<包根>\pip），这里一并回收。
Remove-PipCacheIfSafe -Path $pipCacheRoot -Label "pip 下载缓存"
Remove-PipCacheIfSafe -Path (Join-Path $pkgRoot "pip") -Label "旧版安装器遗留在包根的 pip 缓存"

$toolsSize = Get-DirectorySize $toolsRoot
Write-Host ""
Write-Host "OCR 前置组件已准备完成。接下来运行 1-启动-中文补丁.cmd 启动中文界面。" -ForegroundColor Green
Write-Host ("OCR 运行期目录：{0}（{1} MB）" -f $toolsRoot, [Math]::Round($toolsSize / 1MB, 0))
Write-Host "缓存位置：$cacheRoot"
Write-Host "安装日志：$transcriptPath"
try { Stop-Transcript | Out-Null } catch { }
