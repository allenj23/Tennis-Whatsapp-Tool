# Shared helpers for install / build scripts

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "    $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "    $Message" -ForegroundColor Yellow
}

function Write-Err([string]$Message) {
    Write-Host "    $Message" -ForegroundColor Red
}

function Get-AppRoot {
    if ($PSScriptRoot) {
        return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    }
    return (Get-Location).Path
}

function Get-NodeExe([string]$AppRoot) {
    $bundled = Join-Path $AppRoot "runtime\node\node.exe"
    if (Test-Path $bundled) { return $bundled }
    return $null
}

function Get-NpmCmd([string]$AppRoot) {
    $bundledNpm = Join-Path $AppRoot "runtime\node\npm.cmd"
    if (Test-Path $bundledNpm) { return $bundledNpm }
    return "npm.cmd"
}

function Ensure-NodeModules([string]$AppRoot) {
    $nm = Join-Path $AppRoot "node_modules"
    if (Test-Path $nm) { return $true }

    $nodeExe = Get-NodeExe $AppRoot
    if (-not $nodeExe) {
        $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
    }
    if (-not $nodeExe) {
        Write-Err "Node.js not found. Run Install.bat or use a release build with bundled runtime."
        return $false
    }

    Write-Step "Installing dependencies (first run - may take a few minutes)..."
    $npm = Get-NpmCmd $AppRoot
    Push-Location $AppRoot
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $npm ci --omit=dev 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) {
            & $npm install --omit=dev 2>&1 | Out-Host
        }
    } finally {
        $ErrorActionPreference = $prevEAP
        Pop-Location
    }
    return (Test-Path $nm)
}
