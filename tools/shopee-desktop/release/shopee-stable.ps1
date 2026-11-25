#Requires -Version 7
<#
.SYNOPSIS
Pin the installed TDN Shopee app as stable, roll back to it, or add a desktop shortcut (RELEASES.md).

.EXAMPLE
pwsh -File shopee-stable.ps1 pin -Version 1.3.0
pwsh -File shopee-stable.ps1 rollback
pwsh -File shopee-stable.ps1 shortcut
#>
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet('pin', 'rollback', 'shortcut')]
    [string]$Command,
    [string]$Version,
    [string]$AppDir = (Join-Path $env:LOCALAPPDATA 'TDN-Shopee'),
    [string]$InstallerDir = 'C:\Users\Admin\Desktop\claude session\outputs\shopee-tunnel\installer\dist'
)
$ErrorActionPreference = 'Stop'

$exe = Join-Path $AppDir 'TDN-Shopee-Flow.exe'
$stableExe = Join-Path $AppDir 'TDN-Shopee-Flow.stable.exe'
$backupExe = Join-Path $AppDir 'TDN-Shopee-Flow.before-rollback.exe'
$stableJson = Join-Path $AppDir 'stable.json'
$installer = Join-Path $InstallerDir 'Cai-dat-TDN-Shopee-chung.exe'
$stableInstaller = Join-Path $InstallerDir 'Cai-dat-TDN-Shopee-chung-stable.exe'
$backupInstaller = Join-Path $InstallerDir 'Cai-dat-TDN-Shopee-chung.before-rollback.exe'

function Stop-WithError([string]$Message) {
    [Console]::Error.WriteLine("shopee-stable: $Message")
    exit 1
}

function Get-Sha256([string]$Path) {
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Invoke-Pin {
    if ($Version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') { Stop-WithError "-Version must be X.Y.Z, got '$Version'" }
    if (-not (Test-Path -LiteralPath $exe)) { Stop-WithError "no app at $exe" }
    if (-not (Test-Path -LiteralPath $installer)) { Stop-WithError "no shared installer at $installer" }
    # Stage both files under temp names first. stable.json goes last; rollback checks both hashes against it.
    $tmpExe = "$stableExe.tmp"
    $tmpInstaller = "$stableInstaller.tmp"
    Copy-Item -LiteralPath $exe -Destination $tmpExe -Force -Confirm:$false
    Copy-Item -LiteralPath $installer -Destination $tmpInstaller -Force -Confirm:$false
    $exeSha = Get-Sha256 $tmpExe
    $installerSha = Get-Sha256 $tmpInstaller
    # Keep the current stable set in stable-prev (next to each file), so a pin that stops halfway can be undone.
    $prevApp = Join-Path $AppDir 'stable-prev'
    $prevInstaller = Join-Path $InstallerDir 'stable-prev'
    foreach ($dir in @($prevApp, $prevInstaller) | Select-Object -Unique) {
        if (Test-Path -LiteralPath $dir) { Remove-Item -LiteralPath $dir -Recurse -Force -Confirm:$false }
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
    foreach ($pair in @(@($stableExe, $prevApp), @($stableJson, $prevApp), @($stableInstaller, $prevInstaller))) {
        if (Test-Path -LiteralPath $pair[0]) { Move-Item -LiteralPath $pair[0] -Destination $pair[1] -Force -Confirm:$false }
    }
    Move-Item -LiteralPath $tmpExe -Destination $stableExe -Force -Confirm:$false
    Move-Item -LiteralPath $tmpInstaller -Destination $stableInstaller -Force -Confirm:$false
    $tmpJson = "$stableJson.tmp"
    [ordered]@{ version = $Version; sha256 = $exeSha; installerSha256 = $installerSha
        pinnedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ') } |
        ConvertTo-Json | Set-Content -LiteralPath $tmpJson -Encoding utf8NoBOM -Confirm:$false
    Move-Item -LiteralPath $tmpJson -Destination $stableJson -Force -Confirm:$false
    Write-Output "pinned ${Version}: $stableExe (sha256 $exeSha)"
    Write-Output "stable installer: $stableInstaller (sha256 $installerSha)"
}

function Invoke-Rollback {
    if (-not (Test-Path -LiteralPath $stableJson)) { Stop-WithError "no stable pin ($stableJson missing); rollback refused" }
    if (-not (Test-Path -LiteralPath $stableExe)) { Stop-WithError "no stable app ($stableExe missing); rollback refused" }
    if (-not (Test-Path -LiteralPath $stableInstaller)) { Stop-WithError "no stable installer ($stableInstaller missing); rollback refused" }
    $pin = Get-Content -LiteralPath $stableJson -Raw | ConvertFrom-Json
    if ((Get-Sha256 $stableExe) -ne $pin.sha256) { Stop-WithError "stable app sha256 does not match stable.json; rollback refused" }
    if ((Get-Sha256 $stableInstaller) -ne $pin.installerSha256) { Stop-WithError "stable installer sha256 does not match stable.json; rollback refused" }
    # Only the app that runs from this folder; another copy elsewhere keeps running.
    $full = [IO.Path]::GetFullPath($exe)
    Get-Process -Name 'TDN-Shopee-Flow' -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and [IO.Path]::GetFullPath($_.Path) -ieq $full } |
        Stop-Process -Force -Confirm:$false
    Start-Sleep -Seconds 2
    if (Test-Path -LiteralPath $exe) { Copy-Item -LiteralPath $exe -Destination $backupExe -Force -Confirm:$false }
    Copy-Item -LiteralPath $stableExe -Destination $exe -Force -Confirm:$false
    Start-Process -FilePath $exe
    Write-Output "app rolled back to $($pin.version); old app saved as $backupExe"
    if (Test-Path -LiteralPath $installer) { Copy-Item -LiteralPath $installer -Destination $backupInstaller -Force -Confirm:$false }
    Copy-Item -LiteralPath $stableInstaller -Destination $installer -Force -Confirm:$false
    Write-Output "shared installer rolled back; old installer saved as $backupInstaller"
}

function Invoke-Shortcut {
    if (-not (Test-Path -LiteralPath $stableExe)) { Stop-WithError "no stable app ($stableExe missing); run pin first" }
    $link = Join-Path ([Environment]::GetFolderPath('Desktop')) 'TDN Shopee (bản ổn định).lnk'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($link)
    $shortcut.TargetPath = $stableExe
    $shortcut.WorkingDirectory = $AppDir
    $shortcut.Save()
    Write-Output "shortcut: $link"
}

switch ($Command) {
    'pin' { Invoke-Pin }
    'rollback' { Invoke-Rollback }
    'shortcut' { Invoke-Shortcut }
}
