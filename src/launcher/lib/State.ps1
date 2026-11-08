# State：last-session / settings

function Save-State {
    param([string]$Version, [string]$Mode)
    $state = @{
        Version = $Version
        Mode = $Mode
        OcrEnabled = [bool](Get-OcrEnabled)
        Time = (Get-Date).ToString("o")
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText((Join-Path $script:StateDir "last-session.json"), $state, (New-Object System.Text.UTF8Encoding($false)))
}
