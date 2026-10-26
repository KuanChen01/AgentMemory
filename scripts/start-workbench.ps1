param(
  [ValidateSet('menu', 'start', 'stop', 'restart', 'status', 'open-admin')]
  [string]$Action = 'menu',
  [int]$Port = 38888,
  [switch]$NoOpen,
  [switch]$OpenOnReuse,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# When stdout is piped or redirected (CI, Node child_process, log files) emit UTF-8 instead of the
# console OEM code page (e.g. 936 on zh-CN Windows), so callers can decode the Chinese status lines.
# Interactive console windows keep their default encoding.
if ([Console]::IsOutputRedirected) {
  try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
}

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
Set-Location $RepoRoot

# Keep this file pure ASCII. Windows PowerShell 5.1 decodes BOM-less scripts with the ANSI code page
# (e.g. 936/GBK on zh-CN Windows), which corrupts raw UTF-8 Chinese text and breaks parsing.
# Chinese UI text is therefore stored as \uXXXX escapes and decoded at runtime.
function ConvertFrom-EscapedText([string]$Escaped) {
  return [regex]::Unescape($Escaped)
}

$Text = @{
  StatusTitle = ConvertFrom-EscapedText 'AgentMemory Workbench \u72B6\u6001'
  OpenedAdmin = ConvertFrom-EscapedText '\u5DF2\u6253\u5F00 /admin\u3002'
  NotRunningNotOpened = ConvertFrom-EscapedText '\u5F53\u524D\u672A\u542F\u52A8\uFF0C\u672A\u6253\u5F00 /admin\u3002'
  AlreadyStopped = ConvertFrom-EscapedText '\u5F53\u524D\u5DF2\u505C\u6B62\u3002'
  Stopped = ConvertFrom-EscapedText '\u5DF2\u505C\u6B62 workbench\u3002'
  RunningOpenedAdmin = ConvertFrom-EscapedText '\u5F53\u524D\u5DF2\u542F\u52A8\uFF0C\u5DF2\u6253\u5F00 /admin\u3002'
  AlreadyRunning = ConvertFrom-EscapedText '\u5F53\u524D\u5DF2\u542F\u52A8\u3002'
  Started = ConvertFrom-EscapedText '\u5DF2\u542F\u52A8 workbench\u3002'
  Restarted = ConvertFrom-EscapedText '\u5DF2\u91CD\u542F workbench\u3002'
  FreshStarted = ConvertFrom-EscapedText '\u5F53\u524D\u672A\u542F\u52A8\uFF0C\u5DF2\u6309 fresh start \u542F\u52A8 workbench\u3002'
  ChooseAction = ConvertFrom-EscapedText '\u8BF7\u9009\u62E9\u64CD\u4F5C'
  Exited = ConvertFrom-EscapedText '\u5DF2\u9000\u51FA\u3002'
  InvalidChoice = ConvertFrom-EscapedText '\u65E0\u6548\u8F93\u5165\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002'
}

function Get-WorkbenchUrls([int]$TargetPort) {
  $baseUrl = "http://127.0.0.1:$TargetPort"
  return [PSCustomObject]@{
    AdminUrl = "$baseUrl/admin"
    OverviewUrl = "$baseUrl/admin/api/overview"
  }
}

# The worker requires the per-user token it keeps in its runtime directory (see src/services/worker-auth.ts).
function Get-WorkerToken() {
  $runtimeDir = $env:AGENTMEM_RUNTIME_DIR
  if (-not $runtimeDir) {
    $homeDir = $env:USERPROFILE
    if (-not $homeDir) { $homeDir = $HOME }
    $runtimeDir = Join-Path $homeDir '.agentmem'
  }
  $tokenPath = Join-Path $runtimeDir 'worker-token'
  if (Test-Path -LiteralPath $tokenPath) {
    $token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
    if ($token -match '^[A-Za-z0-9_-]{32,256}$') { return $token }
  }
  return ''
}

function Get-WorkerHeaders() {
  $token = Get-WorkerToken
  if ($token) { return @{ 'X-AgentMem-Token' = $token } }
  return @{}
}

function Test-ReusableOverviewPayload([object]$Payload) {
  if ($null -eq $Payload) {
    return $false
  }

  $rootKeys = @($Payload.PSObject.Properties.Name)
  if (-not ($rootKeys -contains 'stats' -and $rootKeys -contains 'policy' -and $rootKeys -contains 'projects' -and $rootKeys -contains 'agents')) {
    return $false
  }

  $stats = $Payload.stats
  $policy = $Payload.policy
  if ($null -eq $stats -or $null -eq $policy) {
    return $false
  }

  $statsKeys = @($stats.PSObject.Properties.Name)
  $policyKeys = @($policy.PSObject.Properties.Name)

  return (
    ($statsKeys -contains 'observations') -and
    ($statsKeys -contains 'sessions') -and
    ($statsKeys -contains 'projects') -and
    ($statsKeys -contains 'agents') -and
    ($statsKeys -contains 'currentStateFacts') -and
    ($policyKeys -contains 'readEnabled') -and
    ($policyKeys -contains 'writeEnabled') -and
    $Payload.projects -is [System.Array] -and
    $Payload.agents -is [System.Array]
  )
}

function Get-WorkbenchStatus([int]$TargetPort) {
  $urls = Get-WorkbenchUrls $TargetPort
  $state = 'INACTIVE'
  $httpStatus = 0
  $errorText = $null

  try {
    # -UseBasicParsing avoids the Internet Explorer engine dependency in Windows PowerShell 5.1
    # (it is accepted and ignored by PowerShell 7).
    $response = Invoke-WebRequest -Uri $urls.OverviewUrl -Headers (Get-WorkerHeaders) -TimeoutSec 2 -UseBasicParsing
    $httpStatus = [int]$response.StatusCode
    $payload = $null
    if ($response.Content) {
      try {
        # No -Depth: ConvertFrom-Json only gained it in PowerShell 6.2, and on 5.1 the unknown
        # parameter would make every running worker look INACTIVE.
        $payload = $response.Content | ConvertFrom-Json
      } catch {
        $payload = $null
      }
    }

    if ($httpStatus -eq 200 -and (Test-ReusableOverviewPayload $payload)) {
      $state = 'ACTIVE'
    }
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $httpStatus = [int]$_.Exception.Response.StatusCode.value__
    }
    $errorText = $_.Exception.Message
  }

  return [PSCustomObject]@{
    AdminUrl = $urls.AdminUrl
    Error = $errorText
    HttpStatus = $httpStatus
    OverviewUrl = $urls.OverviewUrl
    Port = $TargetPort
    State = $state
  }
}

function Write-WorkbenchStatus([object]$Status, [string]$Message = $null) {
  Write-Host ""
  Write-Host $Text.StatusTitle
  Write-Host "State : $($Status.State)"
  Write-Host "Port  : $($Status.Port)"
  Write-Host "Admin : $($Status.AdminUrl)"
  if ($Status.HttpStatus -gt 0) {
    Write-Host "HTTP  : $($Status.HttpStatus)"
  }
  if ($Message) {
    Write-Host "Note  : $Message"
  } elseif ($Status.Error) {
    Write-Host "Note  : $($Status.Error)"
  }
  Write-Host ""
}

function Invoke-WorkbenchBuild() {
  if ($SkipBuild) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot 'dist/bin/workbench.js'))) {
      throw "No built workbench found. Run npm run build before using -SkipBuild."
    }
    return
  }
  Write-Host "Building AgentMemory workbench..."
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed with exit code $LASTEXITCODE."
  }
}

function Invoke-WorkbenchBrowserOpen([string]$Url) {
  # The token rides in the URL fragment, which the browser never sends to the server.
  $token = Get-WorkerToken
  if ($token) { $Url = "$Url#token=$token" }
  Start-Process $Url | Out-Null
}

function Invoke-WorkbenchStart([int]$TargetPort, [bool]$ShouldOpenBrowser) {
  $nodeArgs = @("dist/bin/workbench.js", "--port", "$TargetPort")
  if (-not $ShouldOpenBrowser) {
    $nodeArgs += "--no-open"
  }

  & node @nodeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "node dist/bin/workbench.js failed with exit code $LASTEXITCODE."
  }
}

function Invoke-WorkbenchStop([int]$TargetPort) {
  $previousPort = $env:AGENTMEM_PORT
  $env:AGENTMEM_PORT = "$TargetPort"
  try {
    & node "dist/bin/cli.js" stop
    if ($LASTEXITCODE -ne 0) {
      throw "node dist/bin/cli.js stop failed with exit code $LASTEXITCODE."
    }
  } finally {
    if ($null -eq $previousPort) {
      Remove-Item Env:AGENTMEM_PORT -ErrorAction SilentlyContinue
    } else {
      $env:AGENTMEM_PORT = $previousPort
    }
  }
}

function Wait-WorkbenchInactive([int]$TargetPort, [int]$Attempts = 20, [int]$DelayMs = 300) {
  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    $status = Get-WorkbenchStatus $TargetPort
    if ($status.State -eq 'INACTIVE') {
      return $status
    }

    if ($attempt -lt $Attempts) {
      Start-Sleep -Milliseconds $DelayMs
    }
  }

  throw "Workbench did not stop cleanly on port $TargetPort."
}

function Invoke-WorkbenchAction(
  [string]$ResolvedAction,
  [int]$TargetPort,
  [bool]$DisableBrowserOpen,
  [bool]$AllowOpenOnReuse
) {
  $currentStatus = Get-WorkbenchStatus $TargetPort

  if ($ResolvedAction -eq 'status') {
    Write-WorkbenchStatus $currentStatus
    return
  }

  if ($ResolvedAction -eq 'open-admin') {
    if ($currentStatus.State -eq 'ACTIVE') {
      Invoke-WorkbenchBrowserOpen $currentStatus.AdminUrl
      Write-WorkbenchStatus $currentStatus $Text.OpenedAdmin
    } else {
      Write-WorkbenchStatus $currentStatus $Text.NotRunningNotOpened
    }
    return
  }

  if ($ResolvedAction -eq 'stop') {
    if ($currentStatus.State -eq 'INACTIVE') {
      Write-WorkbenchStatus $currentStatus $Text.AlreadyStopped
      return
    }

    Invoke-WorkbenchStop $TargetPort
    $stoppedStatus = Wait-WorkbenchInactive $TargetPort
    Write-WorkbenchStatus $stoppedStatus $Text.Stopped
    return
  }

  if ($ResolvedAction -eq 'start') {
    if ($currentStatus.State -eq 'ACTIVE') {
      if ($AllowOpenOnReuse -and (-not $DisableBrowserOpen)) {
        Invoke-WorkbenchBrowserOpen $currentStatus.AdminUrl
        Write-WorkbenchStatus $currentStatus $Text.RunningOpenedAdmin
      } else {
        Write-WorkbenchStatus $currentStatus $Text.AlreadyRunning
      }
      return
    }

    Invoke-WorkbenchBuild
    Invoke-WorkbenchStart $TargetPort (-not $DisableBrowserOpen)
    $startedStatus = Get-WorkbenchStatus $TargetPort
    Write-WorkbenchStatus $startedStatus $Text.Started
    return
  }

  if ($ResolvedAction -eq 'restart') {
    Invoke-WorkbenchBuild

    if ($currentStatus.State -eq 'ACTIVE') {
      Invoke-WorkbenchStop $TargetPort
      $null = Wait-WorkbenchInactive $TargetPort
    }

    Invoke-WorkbenchStart $TargetPort (-not $DisableBrowserOpen)
    $restartedStatus = Get-WorkbenchStatus $TargetPort
    if ($currentStatus.State -eq 'ACTIVE') {
      Write-WorkbenchStatus $restartedStatus $Text.Restarted
    } else {
      Write-WorkbenchStatus $restartedStatus $Text.FreshStarted
    }
    return
  }

  throw "Unsupported action: $ResolvedAction"
}

function Show-WorkbenchMenu([int]$TargetPort) {
  while ($true) {
    $status = Get-WorkbenchStatus $TargetPort
    Write-WorkbenchStatus $status
    Write-Host "[1] Start"
    Write-Host "[2] Stop"
    Write-Host "[3] Restart"
    Write-Host "[4] Status"
    Write-Host "[5] Open Admin"
    Write-Host "[6] Exit"

    $choice = Read-Host $Text.ChooseAction
    switch ($choice) {
      '1' {
        Invoke-WorkbenchAction 'start' $TargetPort $false $false
        return
      }
      '2' {
        Invoke-WorkbenchAction 'stop' $TargetPort $false $false
        return
      }
      '3' {
        Invoke-WorkbenchAction 'restart' $TargetPort $false $false
        return
      }
      '4' {
        Invoke-WorkbenchAction 'status' $TargetPort $false $false
        return
      }
      '5' {
        Invoke-WorkbenchAction 'open-admin' $TargetPort $false $false
        return
      }
      '6' {
        Write-Host $Text.Exited
        return
      }
      default {
        Write-Host $Text.InvalidChoice
        Write-Host ""
      }
    }
  }
}

if ($Action -eq 'menu') {
  Show-WorkbenchMenu $Port
} else {
  Invoke-WorkbenchAction $Action $Port $NoOpen.IsPresent $OpenOnReuse.IsPresent
}
