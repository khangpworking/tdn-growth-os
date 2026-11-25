#Requires -Version 7
<#
.SYNOPSIS
Add the shared installer to the DRAFT release of a tag, with a complete SHA256SUMS.txt (RELEASES.md).
The repository is public. The installer embeds a user access token, so this script uploads only to a draft.

.EXAMPLE
pwsh -File upload-installer.ps1 -Tag app-v1.3.0 -Installer .\Cai-dat-TDN-Shopee-chung.exe
#>
param(
    [Parameter(Mandatory)][string]$Tag,
    [Parameter(Mandatory)][string]$Installer
)
$ErrorActionPreference = 'Stop'

function Stop-WithError([string]$Message) {
    [Console]::Error.WriteLine("upload-installer: $Message")
    exit 1
}

function Assert-Draft {
    $draft = gh release view $Tag --json isDraft --jq .isDraft
    if ($LASTEXITCODE -ne 0) { Stop-WithError "release $Tag not found" }
    if ($draft -ne 'true') { Stop-WithError "release $Tag is not a draft; refusing to upload the installer" }
}

if ($Tag -notmatch '^app-v((0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*))$') { Stop-WithError "tag must be app-vX.Y.Z, got '$Tag'" }
$version = $Matches[1]
if (-not (Test-Path -LiteralPath $Installer -PathType Leaf)) { Stop-WithError "no installer at $Installer" }
Assert-Draft

$exeName = "TDN-Shopee-Flow-$version.exe"
$installerName = "Cai-dat-TDN-Shopee-chung-$version.exe"
$work = Join-Path ([IO.Path]::GetTempPath()) ("tdn-release-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
    $dl = Join-Path $work 'download'
    gh release download $Tag --pattern $exeName --pattern 'SHA256SUMS.txt' --dir $dl
    if ($LASTEXITCODE -ne 0) { Stop-WithError "cannot download $exeName and SHA256SUMS.txt from $Tag" }
    # The EXE must be the one the workflow built: its hash must match its line in the release SHA256SUMS.txt.
    $exeSha = (Get-FileHash -LiteralPath (Join-Path $dl $exeName) -Algorithm SHA256).Hash.ToLowerInvariant()
    $listed = Get-Content -LiteralPath (Join-Path $dl 'SHA256SUMS.txt') |
        Where-Object { $_ -match "^([0-9a-fA-F]{64})  $([regex]::Escape($exeName))$" } |
        ForEach-Object { $Matches[1].ToLowerInvariant() }
    if (@($listed).Count -ne 1 -or $listed -ne $exeSha) { Stop-WithError "$exeName sha256 does not match SHA256SUMS.txt in $Tag; refusing" }
    Move-Item -LiteralPath (Join-Path $dl $exeName) -Destination (Join-Path $work $exeName)
    Copy-Item -LiteralPath $Installer -Destination (Join-Path $work $installerName)
    $lines = foreach ($name in @($exeName, $installerName)) {
        $hash = (Get-FileHash -LiteralPath (Join-Path $work $name) -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $name"
    }
    $sums = Join-Path $work 'SHA256SUMS.txt'
    [IO.File]::WriteAllText($sums, (($lines -join "`n") + "`n"))
    Assert-Draft
    gh release upload $Tag (Join-Path $work $installerName) $sums --clobber
    if ($LASTEXITCODE -ne 0) { Stop-WithError "upload to $Tag failed" }
    Assert-Draft
    Write-Output "uploaded $installerName and SHA256SUMS.txt to draft $Tag"
    $lines | Write-Output
} finally {
    Remove-Item -LiteralPath $work -Recurse -Force -Confirm:$false -ErrorAction SilentlyContinue
}
