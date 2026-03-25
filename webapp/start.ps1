<#
.SYNOPSIS
Starts kyutai-mcp web backend and frontend.

.DESCRIPTION
Fleet-standard startup script with:
- prerequisite validation (uv, npm, paths)
- port cleanup
- retry helper for transient failures
- readiness checks
- actionable logging and deterministic exit codes
#>

[CmdletBinding()]
param(
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$BackendPort = 10924
$FrontendPort = 10925
$HostIp = "127.0.0.1"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$FrontendDir = Join-Path $PSScriptRoot "frontend"

function Write-Log {
  param(
    [string]$Message,
    [ValidateSet("INFO", "WARN", "ERROR")] [string]$Level = "INFO"
  )
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-Host "[$ts][$Level] $Message"
}

function Invoke-WithRetry {
  param(
    [scriptblock]$ScriptBlock,
    [string]$OperationName,
    [int]$MaxRetries = 3,
    [int]$InitialDelaySeconds = 1
  )
  $attempt = 0
  $delay = $InitialDelaySeconds
  while ($attempt -le $MaxRetries) {
    try {
      return & $ScriptBlock
    } catch {
      $attempt = $attempt + 1
      if ($attempt -gt $MaxRetries) {
        Write-Log "Operation failed after retries: $OperationName. $($_.Exception.Message)" "ERROR"
        throw
      }
      Write-Log "Operation retry $attempt/${MaxRetries}: $OperationName" "WARN"
      Start-Sleep -Seconds $delay
      $delay = [Math]::Min($delay * 2, 8)
    }
  }
}

function Test-CommandExists {
  param([string]$Name)
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $cmd) {
    throw "Required command '$Name' not found in PATH."
  }
}

function Resolve-NpmCommand {
  $npmCmd = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
  if ($null -ne $npmCmd) {
    return $npmCmd.Source
  }
  $npm = Get-Command "npm" -ErrorAction SilentlyContinue
  if ($null -ne $npm) {
    return $npm.Source
  }
  throw "Required command 'npm' not found in PATH."
}

function Stop-PortListeners {
  param([int]$Port)
  $connections = @()
  try {
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
  } catch {
    $connections = @()
  }
  foreach ($c in $connections) {
    try {
      if ($null -ne $c.OwningProcess -and $c.OwningProcess -gt 0) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
      }
    } catch {
      Write-Log "Could not stop process $($c.OwningProcess) on port $Port" "WARN"
    }
  }
}

function Wait-HttpReady {
  param(
    [string]$Url,
    [int]$MaxAttempts = 20,
    [int]$DelayMs = 500
  )
  for ($i = 0; $i -lt $MaxAttempts; $i = $i + 1) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Milliseconds $DelayMs
    }
  }
  return $false
}

try {
  Write-Log "Validating prerequisites"
  Test-CommandExists -Name "uv"
  $npmPath = Resolve-NpmCommand
  if (-not (Test-Path $FrontendDir)) {
    throw "Frontend directory missing: $FrontendDir"
  }

  Write-Log "Clearing ports $BackendPort and $FrontendPort"
  Stop-PortListeners -Port $BackendPort
  Stop-PortListeners -Port $FrontendPort

  Write-Log "Starting backend on $HostIp`:$BackendPort"
  $backendArgs = @(
    "run", "uvicorn",
    "webapp.backend.app:app",
    "--host", $HostIp,
    "--port", "$BackendPort"
  )
  $backendProc = Invoke-WithRetry -OperationName "start backend" -ScriptBlock {
    Start-Process -WorkingDirectory $RepoRoot -FilePath "uv" -ArgumentList $backendArgs -PassThru
  }

  if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
    Write-Log "Installing frontend dependencies"
    $installProc = Invoke-WithRetry -OperationName "npm install" -ScriptBlock {
      Start-Process -WorkingDirectory $FrontendDir -FilePath $npmPath -ArgumentList @("install") -Wait -PassThru
    }
    if ($installProc.ExitCode -ne 0) {
      throw "npm install failed with exit code $($installProc.ExitCode)"
    }
  }

  Write-Log "Starting frontend on $HostIp`:$FrontendPort"
  $frontendProc = Invoke-WithRetry -OperationName "start frontend" -ScriptBlock {
    Start-Process -WorkingDirectory $FrontendDir -FilePath $npmPath -ArgumentList @("run", "dev") -PassThru
  }
  Start-Sleep -Milliseconds 700
  if ($frontendProc.HasExited) {
    throw "Frontend process exited immediately with code $($frontendProc.ExitCode)."
  }

  Write-Log "Waiting for backend readiness"
  $backendReady = Wait-HttpReady -Url "http://$HostIp`:$BackendPort/api/health"
  if (-not $backendReady) {
    throw "Backend did not become ready on port $BackendPort."
  }

  Write-Log "Waiting for frontend readiness"
  $frontendReady = Wait-HttpReady -Url "http://$HostIp`:$FrontendPort/"
  if (-not $frontendReady) {
    throw "Frontend did not become ready on port $FrontendPort."
  }

  Write-Log "Startup complete. Backend PID=$($backendProc.Id), Frontend PID=$($frontendProc.Id)"
  if (-not $NoOpen) {
    Start-Process "http://$HostIp`:$FrontendPort/"
  }
  exit 0
} catch {
  Write-Log "Startup failed: $($_.Exception.Message)" "ERROR"
  Write-Log "Check firewall/proxy and run this script from: $PSScriptRoot" "ERROR"
  exit 1
}

