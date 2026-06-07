param(
  [ValidateSet('menu', 'start', 'stop', 'restart', 'status', 'open-admin')]
  [string]$Action = 'menu',
  [int]$Port = 38888,
  [switch]$NoOpen,
  [switch]$OpenOnReuse
)

$ErrorActionPreference = "Stop"

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
Set-Location $RepoRoot

function Get-WorkbenchUrls([int]$TargetPort) {
  $baseUrl = "http://127.0.0.1:$TargetPort"
  return [PSCustomObject]@{
    AdminUrl = "$baseUrl/admin"
    OverviewUrl = "$baseUrl/admin/api/overview"
  }
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
    $response = Invoke-WebRequest -Uri $urls.OverviewUrl -TimeoutSec 2
    $httpStatus = [int]$response.StatusCode
    $payload = $null
    if ($response.Content) {
      try {
        $payload = $response.Content | ConvertFrom-Json -Depth 8
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
  Write-Host "AgentMemory Workbench 状态"
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
  Write-Host "Building AgentMemory workbench..."
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed with exit code $LASTEXITCODE."
  }
}

function Invoke-WorkbenchBrowserOpen([string]$Url) {
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
      Write-WorkbenchStatus $currentStatus "已打开 /admin。"
    } else {
      Write-WorkbenchStatus $currentStatus "当前未启动，未打开 /admin。"
    }
    return
  }

  if ($ResolvedAction -eq 'stop') {
    if ($currentStatus.State -eq 'INACTIVE') {
      Write-WorkbenchStatus $currentStatus "当前已停止。"
      return
    }

    Invoke-WorkbenchStop $TargetPort
    $stoppedStatus = Wait-WorkbenchInactive $TargetPort
    Write-WorkbenchStatus $stoppedStatus "已停止 workbench。"
    return
  }

  if ($ResolvedAction -eq 'start') {
    if ($currentStatus.State -eq 'ACTIVE') {
      if ($AllowOpenOnReuse -and (-not $DisableBrowserOpen)) {
        Invoke-WorkbenchBrowserOpen $currentStatus.AdminUrl
        Write-WorkbenchStatus $currentStatus "当前已启动，已打开 /admin。"
      } else {
        Write-WorkbenchStatus $currentStatus "当前已启动。"
      }
      return
    }

    Invoke-WorkbenchBuild
    Invoke-WorkbenchStart $TargetPort (-not $DisableBrowserOpen)
    $startedStatus = Get-WorkbenchStatus $TargetPort
    Write-WorkbenchStatus $startedStatus "已启动 workbench。"
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
      Write-WorkbenchStatus $restartedStatus "已重启 workbench。"
    } else {
      Write-WorkbenchStatus $restartedStatus "当前未启动，已按 fresh start 启动 workbench。"
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

    $choice = Read-Host "请选择操作"
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
        Write-Host "已退出。"
        return
      }
      default {
        Write-Host "无效输入，请重新选择。"
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
