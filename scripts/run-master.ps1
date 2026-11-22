# Runs the latest master locally on its own database, so switching ticket branches can never clash its migrations.
# Usage (PowerShell, from the repo):  .\scripts\run-master.ps1          keeps your master data
#                                     .\scripts\run-master.ps1 -Fresh   starts from an empty database
param([switch]$Fresh)

Set-Location (Split-Path $PSScriptRoot -Parent)
git switch master
if ($LASTEXITCODE -ne 0) { exit 1 }
git pull --ff-only
if ($LASTEXITCODE -ne 0) { Write-Error "git pull failed; not starting a stale master."; exit 1 }

if ($Fresh -and (Test-Path .data/master)) { Remove-Item -Recurse -Force .data/master }

$previous = $env:PGLITE_DIR
$env:PGLITE_DIR = ".data/master"
try {
  corepack pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { exit 1 }
  corepack pnpm build
  if ($LASTEXITCODE -ne 0) { exit 1 }
  corepack pnpm start
} finally {
  $env:PGLITE_DIR = $previous
}
