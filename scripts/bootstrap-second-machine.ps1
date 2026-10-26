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
npm install --ignore-scripts
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
# The key never goes on a command line (shell history, transcripts, process listings): it is read
# without echo when ~/.agentmem/.env has none yet, and handed to Node in the environment.
if ($ApiKey) {
  Write-Warning "-ApiKey puts the key in your shell history. Next time leave it out and type the key at the prompt, or set it in the workbench."
} else {
  $envFile = Join-Path (Join-Path $env:USERPROFILE ".agentmem") ".env"
  $savedKey = $null
  if (Test-Path -LiteralPath $envFile) {
    $savedKey = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*AGENTMEM_LLM_API_KEY\s*=\s*\S' -and $_ -notmatch '=\s*fill-me\s*$' } | Select-Object -First 1
  }
  if (-not $savedKey -and [Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
    $secureKey = Read-Host "LLM API key (input hidden; press Enter to skip and fill ~/.agentmem/.env later)" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    try {
      $ApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }
}
if ($ApiKey) {
  $env:AGENTMEM_BOOTSTRAP_API_KEY = $ApiKey
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
try {
  & node @cliArgs
  $bootstrapExit = $LASTEXITCODE
} finally {
  Remove-Item Env:AGENTMEM_BOOTSTRAP_API_KEY -ErrorAction SilentlyContinue
}
exit $bootstrapExit
