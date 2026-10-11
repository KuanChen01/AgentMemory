param(
  [switch]$NoOpen,
  [string]$AntigravityConfig,
  [string]$ApiKey,
  [string]$ApiUrl,
  [string]$Model,
  [int]$Port = 38888
)

$ErrorActionPreference = "Stop"

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
Set-Location $RepoRoot

$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($LASTEXITCODE -ne 0 -or $nodeMajor -lt 22) {
  throw "AgentMemory requires Node.js 22 or newer. Check node --version and the node executable on PATH."
}

Write-Host "Installing npm dependencies..."
npm install
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Building AgentMemory..."
npm run build
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$cliArgs = @("dist/bin/cli.js", "bootstrap-win", "--port", "$Port", "--strict")
if ($NoOpen) {
  $cliArgs += "--no-open"
}
if ($AntigravityConfig) {
  $cliArgs += "--antigravity-config"
  $cliArgs += $AntigravityConfig
}
if ($ApiKey) {
  $cliArgs += "--api-key"
  $cliArgs += $ApiKey
}
if ($ApiUrl) {
  $cliArgs += "--api-url"
  $cliArgs += $ApiUrl
}
if ($Model) {
  $cliArgs += "--model"
  $cliArgs += $Model
}

Write-Host "Running AgentMemory bootstrap..."
& node @cliArgs
exit $LASTEXITCODE
