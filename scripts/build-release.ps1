# Build a Windows release folder (and optional Setup.exe via Inno Setup).
# Run from project root:  npm run build:release
#
# Prerequisites:
#   - vendor-google-oauth.json with valid OAuth Web client credentials
#   - Google Cloud redirect URI: http://127.0.0.1:3000/api/google/auth/callback
#   - (Optional) Inno Setup 6 for Setup.exe - https://jrsoftware.org/isinfo.php

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "lib.ps1")

$AppRoot     = Get-AppRoot
$DistRoot    = Join-Path $AppRoot "dist"
$AppName     = "WhatsApp-Campaign-Tool"
$OutDir      = Join-Path $DistRoot $AppName
$NodeVer     = if ($env:NODE_RELEASE_VERSION) { $env:NODE_RELEASE_VERSION } else { "v20.19.2" }
$ReleasePort = if ($env:RELEASE_PORT) { $env:RELEASE_PORT } else { "3000" }

Write-Step "Building release: $AppName"

# 1. Bake OAuth credentials
Write-Step "Baking OAuth credentials"
$env:RELEASE_PORT = $ReleasePort
$nodeForBake = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeForBake) {
    throw "Node.js required on the build machine."
}
& $nodeForBake (Join-Path $AppRoot "scripts\bake-oauth.js")
if ($LASTEXITCODE -ne 0) {
    throw "bake-oauth failed"
}

# 2. Clean output directory
if (Test-Path $OutDir) {
    Write-Step "Removing previous build"
    Remove-Item -Recurse -Force $OutDir
}
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

# 3. Copy application files
Write-Step "Copying application files"
$copyItems = @(
    "src", "public", "package.json", "package-lock.json",
    "Start.bat", "Install.bat", "README-INSTALL.md"
)
foreach ($item in $copyItems) {
    $src = Join-Path $AppRoot $item
    if (-not (Test-Path $src)) { continue }
    Copy-Item -Path $src -Destination $OutDir -Recurse -Force
}

Get-ChildItem $OutDir -Recurse -Include "vendor-google-oauth.json", "oauth-spike.credentials.json" -ErrorAction SilentlyContinue |
    Remove-Item -Force

# 4. Bundle portable Node.js runtime
Write-Step "Downloading portable Node.js $NodeVer"
$runtimeDir = Join-Path $OutDir "runtime\node"
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

$zipName = "node-$NodeVer-win-x64.zip"
$zipUrl  = "https://nodejs.org/dist/$NodeVer/$zipName"
$zipPath = Join-Path $env:TEMP $zipName

if (-not (Test-Path $zipPath)) {
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
}

$extractDir = Join-Path $env:TEMP "node-extract-$NodeVer"
if (Test-Path $extractDir) {
    Remove-Item -Recurse -Force $extractDir
}
Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

$inner = Get-ChildItem $extractDir -Directory | Select-Object -First 1
Copy-Item -Path (Join-Path $inner.FullName "*") -Destination $runtimeDir -Recurse -Force
Write-Ok "Bundled Node at runtime\node\"

# 5. Install production dependencies
Write-Step "Installing production npm dependencies"
$npmCmd = Join-Path $runtimeDir "npm.cmd"
Push-Location $OutDir
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    & $npmCmd ci --omit=dev 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "npm ci failed with exit code $LASTEXITCODE"
    }
}
finally {
    $ErrorActionPreference = $prevEAP
    Pop-Location
}

# 6. Write version stamp
$pkg = Get-Content (Join-Path $AppRoot "package.json") | ConvertFrom-Json
$redirectUri = "http://127.0.0.1:$ReleasePort/api/google/auth/callback"
$buildInfo = @{
    version       = $pkg.version
    builtAt       = (Get-Date).ToUniversalTime().ToString("o")
    nodeVersion   = $NodeVer
    oauthRedirect = $redirectUri
}
$buildInfo | ConvertTo-Json | Set-Content (Join-Path $OutDir "build-info.json") -Encoding UTF8

Write-Ok "Release folder ready: $OutDir"

# 7. Optional: Inno Setup installer
$issFile = Join-Path $AppRoot "installer\WhatsAppCampaignTool.iss"
$pf86 = ${env:ProgramFiles(x86)}
$isccCandidates = @(
    (Join-Path $pf86 "Inno Setup 6\ISCC.exe"),
    (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe")
)
$iscc = $isccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($iscc -and (Test-Path $issFile)) {
    Write-Step "Compiling Setup.exe with Inno Setup"
    & $iscc $issFile
    if ($LASTEXITCODE -eq 0) {
        $setup = Join-Path $DistRoot "WhatsAppCampaignTool-Setup.exe"
        Write-Ok "Installer: $setup"
    }
    else {
        Write-Warn "Inno Setup compile failed - release folder is still usable"
    }
}
else {
    Write-Warn "Inno Setup not found - skipped Setup.exe (install Inno Setup 6 to enable)"
    Write-Warn "Customers can still use the dist folder or zip it manually"
}

Write-Host ""
Write-Host "Done. Next steps:" -ForegroundColor Green
Write-Host "  1. Add redirect URI in Google Cloud if not already:"
Write-Host "     $redirectUri"
Write-Host "  2. Test: cd dist\$AppName; .\Start.bat"
Write-Host "  3. Ship dist\$AppName or dist\WhatsAppCampaignTool-Setup.exe"
