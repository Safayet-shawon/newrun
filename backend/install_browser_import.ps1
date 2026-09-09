$ErrorActionPreference = "Stop"

$backend = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $backend

Write-Host "Installing Nexora backend requirements..." -ForegroundColor Cyan
py -m pip install -r requirements.txt

Write-Host "Installing Playwright Chromium..." -ForegroundColor Cyan
py -m playwright install chromium

Write-Host ""
Write-Host "Browser import setup complete." -ForegroundColor Green
Write-Host "Restart the Nexora backend, then test Import Store again."
