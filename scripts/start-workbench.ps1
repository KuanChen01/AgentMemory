param(
  [int]$Port = 38888,
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
Set-Location $RepoRoot

Write-Host "Building AgentMemory workbench..."
npm run build
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$nodeArgs = @("dist/bin/workbench.js", "--port", "$Port")
if ($NoOpen) {
  $nodeArgs += "--no-open"
}

Write-Host "Launching AgentMemory workbench on port $Port..."
& node @nodeArgs
exit $LASTEXITCODE
