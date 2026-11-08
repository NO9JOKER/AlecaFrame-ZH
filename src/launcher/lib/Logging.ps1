function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    try {
        # 防止长期使用后日志无限增长（诊断包只取尾部，无需保留全部历史）
        if ((Test-Path -LiteralPath $script:LogFile) -and ((Get-Item -LiteralPath $script:LogFile).Length -gt 2MB)) {
            $keep = @(Get-Content -LiteralPath $script:LogFile -Tail 2000 -Encoding UTF8)
            [System.IO.File]::WriteAllLines($script:LogFile, $keep, (New-Object System.Text.UTF8Encoding($false)))
        }
    } catch { }
    Add-Content -LiteralPath $script:LogFile -Value $line -Encoding UTF8
    Write-Host $line
}

function Show-Message {
    param([string]$Text, [string]$Title = "AlecaFrame-ZH")
    if ($script:NoGui) { Write-Host $Text; return }
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($Text, $Title, "OK", "Information") | Out-Null
    } catch {
        Write-Host $Text
    }
}

function Show-Error {
    param([string]$Text, [string]$Title = "AlecaFrame-ZH")
    if ($script:NoGui) { Write-Host ("ERROR: " + $Text); return }
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($Text, $Title, "OK", "Error") | Out-Null
    } catch {
        Write-Host $Text
    }
}

function Get-RegValue {
    param([string]$Path, [string]$Name)
    try { return (Get-ItemProperty -LiteralPath $Path -Name $Name -ErrorAction Stop).$Name } catch { return $null }
}

