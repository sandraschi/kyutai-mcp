param(
    [switch]$Headless,
    [switch]$BackendOnly,
    [switch]$NoBrowser,
    [switch]$NoOpen

# Fast port helpers (scripts/PortHelpers.ps1)
param(
    [switch]$Headless,
    [switch]$BackendOnly,
    [switch]$NoBrowser,
    [switch]$NoOpen
)

# --- SOTA Headless Standard ---
if ($Headless -and ($Host.UI.RawUI.WindowTitle -notmatch 'Hidden')) {
    $relaunch = @('-NoProfile', '-File', $PSCommandPath, '-Headless')
    if ($BackendOnly) { $relaunch += '-BackendOnly' }
    if ($NoBrowser) { $relaunch += '-NoBrowser' }
    if ($NoOpen) { $relaunch += '-NoOpen' }
    Start-Process powershell.exe -ArgumentList $relaunch -WindowStyle Hidden
    exit
}
# ------------------------------

<#
.SYNOPSIS
Starts the full kyutai-mcp stack (canonical fleet launcher).

.DESCRIPTION
Full stack: Moshi bootstrap, backend :10924, MCP HTTP :10926, frontend :10925.
Repo-root start.bat delegates here. Stdio MCP only: just mcp / uv run python -m kyutai_mcp.
#>

if ($NoBrowser -and -not $NoOpen) { $NoOpen = $true }

Write-Host ""
Write-Host "kyutai-mcp - Full stack start" -ForegroundColor Cyan
Write-Host "Backend :10924   Frontend :10925   MCP HTTP :10926   Moshi :8998   Pocket TTS :10929 (optional)" -ForegroundColor DarkGray
Write-Host ""

$ErrorActionPreference = "Stop"
$BackendPort = 10924
$FrontendPort = 10925
$McpHttpPort = 10926
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


function Wait-HttpReady {
    param(
        [string]$Url,
        [int]$MaxAttempts = 30,
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

    if ($env:KYUTAI_SKIP_MOSHI_BOOTSTRAP -eq "1") {
        Write-Log "Skipping Moshi bootstrap (KYUTAI_SKIP_MOSHI_BOOTSTRAP=1)"
    } else {
        Write-Log "Checking Moshi deps (fast skip if already installed)"
        $bootstrapProc = Start-Process -WorkingDirectory $RepoRoot -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "tools\bootstrap_moshi.ps1") -Wait -PassThru -NoNewWindow
        if ($bootstrapProc.ExitCode -ne 0) {
            throw "Moshi bootstrap failed with exit code $($bootstrapProc.ExitCode)"
        }
    }

    Write-Log "Smoke-testing import"
    $importProc = Start-Process -WorkingDirectory $RepoRoot -FilePath "uv" -ArgumentList @("run", "python", "tools/smoke_import.py") -Wait -PassThru -NoNewWindow
    if ($importProc.ExitCode -ne 0) {
        throw "Import smoke test failed"
    }

    Write-Log "Clearing ports $BackendPort, $FrontendPort, $McpHttpPort"
    Stop-PortListeners -Port $BackendPort
    Stop-PortListeners -Port $FrontendPort
    Stop-PortListeners -Port $McpHttpPort

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

    Write-Log "Starting MCP HTTP on $HostIp`:$McpHttpPort"
    $mcpArgs = @(
        "run", "uvicorn",
        "kyutai_mcp.mcp_http:app",
        "--host", $HostIp,
        "--port", "$McpHttpPort"
    )
    $mcpProc = Invoke-WithRetry -OperationName "start mcp http" -ScriptBlock {
        Start-Process -WorkingDirectory $RepoRoot -FilePath "uv" -ArgumentList $mcpArgs -PassThru
    }

    $frontendProc = $null
    if (-not $BackendOnly) {
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
    } else {
        Write-Log "Skipping frontend (BackendOnly mode)"
    }

    Write-Log "Waiting for backend readiness"
    $backendReady = Wait-HttpReady -Url "http://$HostIp`:$BackendPort/api/health"
    if (-not $backendReady) {
        throw "Backend did not become ready on port $BackendPort."
    }

    Write-Log "Waiting for MCP HTTP readiness"
    $mcpReady = Wait-HttpReady -Url "http://$HostIp`:$McpHttpPort/health"
    if (-not $mcpReady) {
        throw "MCP HTTP did not become ready on port $McpHttpPort."
    }

    if (-not $BackendOnly) {
        Write-Log "Waiting for frontend readiness"
        $frontendReady = Wait-HttpReady -Url "http://$HostIp`:$FrontendPort/"
        if (-not $frontendReady) {
            throw "Frontend did not become ready on port $FrontendPort."
        }
    }

    if ($BackendOnly) {
        Write-Log "Startup complete (backend only). Backend PID=$($backendProc.Id), MCP PID=$($mcpProc.Id)"
    } else {
        Write-Log "Startup complete. Backend PID=$($backendProc.Id), MCP PID=$($mcpProc.Id), Frontend PID=$($frontendProc.Id)"
    }
    Write-Log "Backend  http://$HostIp`:$BackendPort"
    if (-not $BackendOnly) {
        Write-Log "Frontend http://$HostIp`:$FrontendPort"
    }
    Write-Log "MCP HTTP http://$HostIp`:$McpHttpPort/mcp"

    if ((-not $BackendOnly) -and (-not $NoOpen)) {
        Start-Process "http://$HostIp`:$FrontendPort/"
    }
    exit 0
} catch {
    Write-Log "Startup failed: $($_.Exception.Message)" "ERROR"
    Write-Log "Run from repo root: powershell -File webapp\start.ps1" "ERROR"
    exit 1
}
_RepoRootForPorts = Split-Path -Parent $PSScriptRoot
param(
    [switch]$Headless,
    [switch]$BackendOnly,
    [switch]$NoBrowser,
    [switch]$NoOpen
)

# --- SOTA Headless Standard ---
if ($Headless -and ($Host.UI.RawUI.WindowTitle -notmatch 'Hidden')) {
    $relaunch = @('-NoProfile', '-File', $PSCommandPath, '-Headless')
    if ($BackendOnly) { $relaunch += '-BackendOnly' }
    if ($NoBrowser) { $relaunch += '-NoBrowser' }
    if ($NoOpen) { $relaunch += '-NoOpen' }
    Start-Process powershell.exe -ArgumentList $relaunch -WindowStyle Hidden
    exit
}
# ------------------------------

<#
.SYNOPSIS
Starts the full kyutai-mcp stack (canonical fleet launcher).

.DESCRIPTION
Full stack: Moshi bootstrap, backend :10924, MCP HTTP :10926, frontend :10925.
Repo-root start.bat delegates here. Stdio MCP only: just mcp / uv run python -m kyutai_mcp.
#>

if ($NoBrowser -and -not $NoOpen) { $NoOpen = $true }

Write-Host ""
Write-Host "kyutai-mcp - Full stack start" -ForegroundColor Cyan
Write-Host "Backend :10924   Frontend :10925   MCP HTTP :10926   Moshi :8998   Pocket TTS :10929 (optional)" -ForegroundColor DarkGray
Write-Host ""

$ErrorActionPreference = "Stop"
$BackendPort = 10924
$FrontendPort = 10925
$McpHttpPort = 10926
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


function Wait-HttpReady {
    param(
        [string]$Url,
        [int]$MaxAttempts = 30,
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

    if ($env:KYUTAI_SKIP_MOSHI_BOOTSTRAP -eq "1") {
        Write-Log "Skipping Moshi bootstrap (KYUTAI_SKIP_MOSHI_BOOTSTRAP=1)"
    } else {
        Write-Log "Checking Moshi deps (fast skip if already installed)"
        $bootstrapProc = Start-Process -WorkingDirectory $RepoRoot -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "tools\bootstrap_moshi.ps1") -Wait -PassThru -NoNewWindow
        if ($bootstrapProc.ExitCode -ne 0) {
            throw "Moshi bootstrap failed with exit code $($bootstrapProc.ExitCode)"
        }
    }

    Write-Log "Smoke-testing import"
    $importProc = Start-Process -WorkingDirectory $RepoRoot -FilePath "uv" -ArgumentList @("run", "python", "tools/smoke_import.py") -Wait -PassThru -NoNewWindow
    if ($importProc.ExitCode -ne 0) {
        throw "Import smoke test failed"
    }

    Write-Log "Clearing ports $BackendPort, $FrontendPort, $McpHttpPort"
    Stop-PortListeners -Port $BackendPort
    Stop-PortListeners -Port $FrontendPort
    Stop-PortListeners -Port $McpHttpPort

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

    Write-Log "Starting MCP HTTP on $HostIp`:$McpHttpPort"
    $mcpArgs = @(
        "run", "uvicorn",
        "kyutai_mcp.mcp_http:app",
        "--host", $HostIp,
        "--port", "$McpHttpPort"
    )
    $mcpProc = Invoke-WithRetry -OperationName "start mcp http" -ScriptBlock {
        Start-Process -WorkingDirectory $RepoRoot -FilePath "uv" -ArgumentList $mcpArgs -PassThru
    }

    $frontendProc = $null
    if (-not $BackendOnly) {
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
    } else {
        Write-Log "Skipping frontend (BackendOnly mode)"
    }

    Write-Log "Waiting for backend readiness"
    $backendReady = Wait-HttpReady -Url "http://$HostIp`:$BackendPort/api/health"
    if (-not $backendReady) {
        throw "Backend did not become ready on port $BackendPort."
    }

    Write-Log "Waiting for MCP HTTP readiness"
    $mcpReady = Wait-HttpReady -Url "http://$HostIp`:$McpHttpPort/health"
    if (-not $mcpReady) {
        throw "MCP HTTP did not become ready on port $McpHttpPort."
    }

    if (-not $BackendOnly) {
        Write-Log "Waiting for frontend readiness"
        $frontendReady = Wait-HttpReady -Url "http://$HostIp`:$FrontendPort/"
        if (-not $frontendReady) {
            throw "Frontend did not become ready on port $FrontendPort."
        }
    }

    if ($BackendOnly) {
        Write-Log "Startup complete (backend only). Backend PID=$($backendProc.Id), MCP PID=$($mcpProc.Id)"
    } else {
        Write-Log "Startup complete. Backend PID=$($backendProc.Id), MCP PID=$($mcpProc.Id), Frontend PID=$($frontendProc.Id)"
    }
    Write-Log "Backend  http://$HostIp`:$BackendPort"
    if (-not $BackendOnly) {
        Write-Log "Frontend http://$HostIp`:$FrontendPort"
    }
    Write-Log "MCP HTTP http://$HostIp`:$McpHttpPort/mcp"

    if ((-not $BackendOnly) -and (-not $NoOpen)) {
        Start-Process "http://$HostIp`:$FrontendPort/"
    }
    exit 0
} catch {
    Write-Log "Startup failed: $($_.Exception.Message)" "ERROR"
    Write-Log "Run from repo root: powershell -File webapp\start.ps1" "ERROR"
    exit 1
}
_PortHelpers = Join-Path param(
    [switch]$Headless,
    [switch]$BackendOnly,
    [switch]$NoBrowser,
    [switch]$NoOpen
)

# --- SOTA Headless Standard ---
if ($Headless -and ($Host.UI.RawUI.WindowTitle -notmatch 'Hidden')) {
    $relaunch = @('-NoProfile', '-File', $PSCommandPath, '-Headless')
    if ($BackendOnly) { $relaunch += '-BackendOnly' }
    if ($NoBrowser) { $relaunch += '-NoBrowser' }
    if ($NoOpen) { $relaunch += '-NoOpen' }
    Start-Process powershell.exe -ArgumentList $relaunch -WindowStyle Hidden
    exit
}
# ------------------------------

<#
.SYNOPSIS
Starts the full kyutai-mcp stack (canonical fleet launcher).

.DESCRIPTION
Full stack: Moshi bootstrap, backend :10924, MCP HTTP :10926, frontend :10925.
Repo-root start.bat delegates here. Stdio MCP only: just mcp / uv run python -m kyutai_mcp.
#>

if ($NoBrowser -and -not $NoOpen) { $NoOpen = $true }

Write-Host ""
Write-Host "kyutai-mcp - Full stack start" -ForegroundColor Cyan
Write-Host "Backend :10924   Frontend :10925   MCP HTTP :10926   Moshi :8998   Pocket TTS :10929 (optional)" -ForegroundColor DarkGray
Write-Host ""

$ErrorActionPreference = "Stop"
$BackendPort = 10924
$FrontendPort = 10925
$McpHttpPort = 10926
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


function Wait-HttpReady {
    param(
        [string]$Url,
        [int]$MaxAttempts = 30,
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

    if ($env:KYUTAI_SKIP_MOSHI_BOOTSTRAP -eq "1") {
        Write-Log "Skipping Moshi bootstrap (KYUTAI_SKIP_MOSHI_BOOTSTRAP=1)"
    } else {
        Write-Log "Checking Moshi deps (fast skip if already installed)"
        $bootstrapProc = Start-Process -WorkingDirectory $RepoRoot -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "tools\bootstrap_moshi.ps1") -Wait -PassThru -NoNewWindow
        if ($bootstrapProc.ExitCode -ne 0) {
            throw "Moshi bootstrap failed with exit code $($bootstrapProc.ExitCode)"
        }
    }

    Write-Log "Smoke-testing import"
    $importProc = Start-Process -WorkingDirectory $RepoRoot -FilePath "uv" -ArgumentList @("run", "python", "tools/smoke_import.py") -Wait -PassThru -NoNewWindow
    if ($importProc.ExitCode -ne 0) {
        throw "Import smoke test failed"
    }

    Write-Log "Clearing ports $BackendPort, $FrontendPort, $McpHttpPort"
    Stop-PortListeners -Port $BackendPort
    Stop-PortListeners -Port $FrontendPort
    Stop-PortListeners -Port $McpHttpPort

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

    Write-Log "Starting MCP HTTP on $HostIp`:$McpHttpPort"
    $mcpArgs = @(
        "run", "uvicorn",
        "kyutai_mcp.mcp_http:app",
        "--host", $HostIp,
        "--port", "$McpHttpPort"
    )
    $mcpProc = Invoke-WithRetry -OperationName "start mcp http" -ScriptBlock {
        Start-Process -WorkingDirectory $RepoRoot -FilePath "uv" -ArgumentList $mcpArgs -PassThru
    }

    $frontendProc = $null
    if (-not $BackendOnly) {
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
    } else {
        Write-Log "Skipping frontend (BackendOnly mode)"
    }

    Write-Log "Waiting for backend readiness"
    $backendReady = Wait-HttpReady -Url "http://$HostIp`:$BackendPort/api/health"
    if (-not $backendReady) {
        throw "Backend did not become ready on port $BackendPort."
    }

    Write-Log "Waiting for MCP HTTP readiness"
    $mcpReady = Wait-HttpReady -Url "http://$HostIp`:$McpHttpPort/health"
    if (-not $mcpReady) {
        throw "MCP HTTP did not become ready on port $McpHttpPort."
    }

    if (-not $BackendOnly) {
        Write-Log "Waiting for frontend readiness"
        $frontendReady = Wait-HttpReady -Url "http://$HostIp`:$FrontendPort/"
        if (-not $frontendReady) {
            throw "Frontend did not become ready on port $FrontendPort."
        }
    }

    if ($BackendOnly) {
        Write-Log "Startup complete (backend only). Backend PID=$($backendProc.Id), MCP PID=$($mcpProc.Id)"
    } else {
        Write-Log "Startup complete. Backend PID=$($backendProc.Id), MCP PID=$($mcpProc.Id), Frontend PID=$($frontendProc.Id)"
    }
    Write-Log "Backend  http://$HostIp`:$BackendPort"
    if (-not $BackendOnly) {
        Write-Log "Frontend http://$HostIp`:$FrontendPort"
    }
    Write-Log "MCP HTTP http://$HostIp`:$McpHttpPort/mcp"

    if ((-not $BackendOnly) -and (-not $NoOpen)) {
        Start-Process "http://$HostIp`:$FrontendPort/"
    }
    exit 0
} catch {
    Write-Log "Startup failed: $($_.Exception.Message)" "ERROR"
    Write-Log "Run from repo root: powershell -File webapp\start.ps1" "ERROR"
    exit 1
}
_RepoRootForPorts 'scripts\PortHelpers.ps1'
if (Test-Path -LiteralPath param(
    [switch]$Headless,
    [switch]$BackendOnly,
    [switch]$NoBrowser,
    [switch]$NoOpen
)

# --- SOTA Headless Standard ---
if ($Headless -and ($Host.UI.RawUI.WindowTitle -notmatch 'Hidden')) {
    $relaunch = @('-NoProfile', '-File', $PSCommandPath, '-Headless')
    if ($BackendOnly) { $relaunch += '-BackendOnly' }
    if ($NoBrowser) { $relaunch += '-NoBrowser' }
    if ($NoOpen) { $relaunch += '-NoOpen' }
    Start-Process powershell.exe -ArgumentList $relaunch -WindowStyle Hidden
    exit
}
# ------------------------------

<#
.SYNOPSIS
Starts the full kyutai-mcp stack (canonical fleet launcher).

.DESCRIPTION
Full stack: Moshi bootstrap, backend :10924, MCP HTTP :10926, frontend :10925.
Repo-root start.bat delegates here. Stdio MCP only: just mcp / uv run python -m kyutai_mcp.
#>

if ($NoBrowser -and -not $NoOpen) { $NoOpen = $true }

Write-Host ""
Write-Host "kyutai-mcp - Full stack start" -ForegroundColor Cyan
Write-Host "Backend :10924   Frontend :10925   MCP HTTP :10926   Moshi :8998   Pocket TTS :10929 (optional)" -ForegroundColor DarkGray
Write-Host ""

$ErrorActionPreference = "Stop"
$BackendPort = 10924
$FrontendPort = 10925
$McpHttpPort = 10926
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


function Wait-HttpReady {
    param(
        [string]$Url,
        [int]$MaxAttempts = 30,
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

    if ($env:KYUTAI_SKIP_MOSHI_BOOTSTRAP -eq "1") {
        Write-Log "Skipping Moshi bootstrap (KYUTAI_SKIP_MOSHI_BOOTSTRAP=1)"
    } else {
        Write-Log "Checking Moshi deps (fast skip if already installed)"
        $bootstrapProc = Start-Process -WorkingDirectory $RepoRoot -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "tools\bootstrap_moshi.ps1") -Wait -PassThru -NoNewWindow
        if ($bootstrapProc.ExitCode -ne 0) {
            throw "Moshi bootstrap failed with exit code $($bootstrapProc.ExitCode)"
        }
    }

    Write-Log "Smoke-testing import"
    $importProc = Start-Process -WorkingDirectory $RepoRoot -FilePath "uv" -ArgumentList @("run", "python", "tools/smoke_import.py") -Wait -PassThru -NoNewWindow
    if ($importProc.ExitCode -ne 0) {
        throw "Import smoke test failed"
    }

    Write-Log "Clearing ports $BackendPort, $FrontendPort, $McpHttpPort"
    Stop-PortListeners -Port $BackendPort
    Stop-PortListeners -Port $FrontendPort
    Stop-PortListeners -Port $McpHttpPort

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

    Write-Log "Starting MCP HTTP on $HostIp`:$McpHttpPort"
    $mcpArgs = @(
        "run", "uvicorn",
        "kyutai_mcp.mcp_http:app",
        "--host", $HostIp,
        "--port", "$McpHttpPort"
    )
    $mcpProc = Invoke-WithRetry -OperationName "start mcp http" -ScriptBlock {
        Start-Process -WorkingDirectory $RepoRoot -FilePath "uv" -ArgumentList $mcpArgs -PassThru
    }

    $frontendProc = $null
    if (-not $BackendOnly) {
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
    } else {
        Write-Log "Skipping frontend (BackendOnly mode)"
    }

    Write-Log "Waiting for backend readiness"
    $backendReady = Wait-HttpReady -Url "http://$HostIp`:$BackendPort/api/health"
    if (-not $backendReady) {
        throw "Backend did not become ready on port $BackendPort."
    }

    Write-Log "Waiting for MCP HTTP readiness"
    $mcpReady = Wait-HttpReady -Url "http://$HostIp`:$McpHttpPort/health"
    if (-not $mcpReady) {
        throw "MCP HTTP did not become ready on port $McpHttpPort."
    }

    if (-not $BackendOnly) {
        Write-Log "Waiting for frontend readiness"
        $frontendReady = Wait-HttpReady -Url "http://$HostIp`:$FrontendPort/"
        if (-not $frontendReady) {
            throw "Frontend did not become ready on port $FrontendPort."
        }
    }

    if ($BackendOnly) {
        Write-Log "Startup complete (backend only). Backend PID=$($backendProc.Id), MCP PID=$($mcpProc.Id)"
    } else {
        Write-Log "Startup complete. Backend PID=$($backendProc.Id), MCP PID=$($mcpProc.Id), Frontend PID=$($frontendProc.Id)"
    }
    Write-Log "Backend  http://$HostIp`:$BackendPort"
    if (-not $BackendOnly) {
        Write-Log "Frontend http://$HostIp`:$FrontendPort"
    }
    Write-Log "MCP HTTP http://$HostIp`:$McpHttpPort/mcp"

    if ((-not $BackendOnly) -and (-not $NoOpen)) {
        Start-Process "http://$HostIp`:$FrontendPort/"
    }
    exit 0
} catch {
    Write-Log "Startup failed: $($_.Exception.Message)" "ERROR"
    Write-Log "Run from repo root: powershell -File webapp\start.ps1" "ERROR"
    exit 1
}
_PortHelpers) { . param(
    [switch]$Headless,
    [switch]$BackendOnly,
    [switch]$NoBrowser,
    [switch]$NoOpen
)

# --- SOTA Headless Standard ---
if ($Headless -and ($Host.UI.RawUI.WindowTitle -notmatch 'Hidden')) {
    $relaunch = @('-NoProfile', '-File', $PSCommandPath, '-Headless')
    if ($BackendOnly) { $relaunch += '-BackendOnly' }
    if ($NoBrowser) { $relaunch += '-NoBrowser' }
    if ($NoOpen) { $relaunch += '-NoOpen' }
    Start-Process powershell.exe -ArgumentList $relaunch -WindowStyle Hidden
    exit
}
# ------------------------------

<#
.SYNOPSIS
Starts the full kyutai-mcp stack (canonical fleet launcher).

.DESCRIPTION
Full stack: Moshi bootstrap, backend :10924, MCP HTTP :10926, frontend :10925.
Repo-root start.bat delegates here. Stdio MCP only: just mcp / uv run python -m kyutai_mcp.
#>

if ($NoBrowser -and -not $NoOpen) { $NoOpen = $true }

Write-Host ""
Write-Host "kyutai-mcp - Full stack start" -ForegroundColor Cyan
Write-Host "Backend :10924   Frontend :10925   MCP HTTP :10926   Moshi :8998   Pocket TTS :10929 (optional)" -ForegroundColor DarkGray
Write-Host ""

$ErrorActionPreference = "Stop"
$BackendPort = 10924
$FrontendPort = 10925
$McpHttpPort = 10926
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


function Wait-HttpReady {
    param(
        [string]$Url,
        [int]$MaxAttempts = 30,
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

    if ($env:KYUTAI_SKIP_MOSHI_BOOTSTRAP -eq "1") {
        Write-Log "Skipping Moshi bootstrap (KYUTAI_SKIP_MOSHI_BOOTSTRAP=1)"
    } else {
        Write-Log "Checking Moshi deps (fast skip if already installed)"
        $bootstrapProc = Start-Process -WorkingDirectory $RepoRoot -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "tools\bootstrap_moshi.ps1") -Wait -PassThru -NoNewWindow
        if ($bootstrapProc.ExitCode -ne 0) {
            throw "Moshi bootstrap failed with exit code $($bootstrapProc.ExitCode)"
        }
    }

    Write-Log "Smoke-testing import"
    $importProc = Start-Process -WorkingDirectory $RepoRoot -FilePath "uv" -ArgumentList @("run", "python", "tools/smoke_import.py") -Wait -PassThru -NoNewWindow
    if ($importProc.ExitCode -ne 0) {
        throw "Import smoke test failed"
    }

    Write-Log "Clearing ports $BackendPort, $FrontendPort, $McpHttpPort"
    Stop-PortListeners -Port $BackendPort
    Stop-PortListeners -Port $FrontendPort
    Stop-PortListeners -Port $McpHttpPort

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

    Write-Log "Starting MCP HTTP on $HostIp`:$McpHttpPort"
    $mcpArgs = @(
        "run", "uvicorn",
        "kyutai_mcp.mcp_http:app",
        "--host", $HostIp,
        "--port", "$McpHttpPort"
    )
    $mcpProc = Invoke-WithRetry -OperationName "start mcp http" -ScriptBlock {
        Start-Process -WorkingDirectory $RepoRoot -FilePath "uv" -ArgumentList $mcpArgs -PassThru
    }

    $frontendProc = $null
    if (-not $BackendOnly) {
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
    } else {
        Write-Log "Skipping frontend (BackendOnly mode)"
    }

    Write-Log "Waiting for backend readiness"
    $backendReady = Wait-HttpReady -Url "http://$HostIp`:$BackendPort/api/health"
    if (-not $backendReady) {
        throw "Backend did not become ready on port $BackendPort."
    }

    Write-Log "Waiting for MCP HTTP readiness"
    $mcpReady = Wait-HttpReady -Url "http://$HostIp`:$McpHttpPort/health"
    if (-not $mcpReady) {
        throw "MCP HTTP did not become ready on port $McpHttpPort."
    }

    if (-not $BackendOnly) {
        Write-Log "Waiting for frontend readiness"
        $frontendReady = Wait-HttpReady -Url "http://$HostIp`:$FrontendPort/"
        if (-not $frontendReady) {
            throw "Frontend did not become ready on port $FrontendPort."
        }
    }

    if ($BackendOnly) {
        Write-Log "Startup complete (backend only). Backend PID=$($backendProc.Id), MCP PID=$($mcpProc.Id)"
    } else {
        Write-Log "Startup complete. Backend PID=$($backendProc.Id), MCP PID=$($mcpProc.Id), Frontend PID=$($frontendProc.Id)"
    }
    Write-Log "Backend  http://$HostIp`:$BackendPort"
    if (-not $BackendOnly) {
        Write-Log "Frontend http://$HostIp`:$FrontendPort"
    }
    Write-Log "MCP HTTP http://$HostIp`:$McpHttpPort/mcp"

    if ((-not $BackendOnly) -and (-not $NoOpen)) {
        Start-Process "http://$HostIp`:$FrontendPort/"
    }
    exit 0
} catch {
    Write-Log "Startup failed: $($_.Exception.Message)" "ERROR"
    Write-Log "Run from repo root: powershell -File webapp\start.ps1" "ERROR"
    exit 1
}
_PortHelpers }
)

# --- SOTA Headless Standard ---
if ($Headless -and ($Host.UI.RawUI.WindowTitle -notmatch 'Hidden')) {
    $relaunch = @('-NoProfile', '-File', $PSCommandPath, '-Headless')
    if ($BackendOnly) { $relaunch += '-BackendOnly' }
    if ($NoBrowser) { $relaunch += '-NoBrowser' }
    if ($NoOpen) { $relaunch += '-NoOpen' }
    Start-Process powershell.exe -ArgumentList $relaunch -WindowStyle Hidden
    exit
}
# ------------------------------

<#
.SYNOPSIS
Starts the full kyutai-mcp stack (canonical fleet launcher).

.DESCRIPTION
Full stack: Moshi bootstrap, backend :10924, MCP HTTP :10926, frontend :10925.
Repo-root start.bat delegates here. Stdio MCP only: just mcp / uv run python -m kyutai_mcp.
#>

if ($NoBrowser -and -not $NoOpen) { $NoOpen = $true }

Write-Host ""
Write-Host "kyutai-mcp - Full stack start" -ForegroundColor Cyan
Write-Host "Backend :10924   Frontend :10925   MCP HTTP :10926   Moshi :8998   Pocket TTS :10929 (optional)" -ForegroundColor DarkGray
Write-Host ""

$ErrorActionPreference = "Stop"
$BackendPort = 10924
$FrontendPort = 10925
$McpHttpPort = 10926
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


function Wait-HttpReady {
    param(
        [string]$Url,
        [int]$MaxAttempts = 30,
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

    if ($env:KYUTAI_SKIP_MOSHI_BOOTSTRAP -eq "1") {
        Write-Log "Skipping Moshi bootstrap (KYUTAI_SKIP_MOSHI_BOOTSTRAP=1)"
    } else {
        Write-Log "Checking Moshi deps (fast skip if already installed)"
        $bootstrapProc = Start-Process -WorkingDirectory $RepoRoot -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "tools\bootstrap_moshi.ps1") -Wait -PassThru -NoNewWindow
        if ($bootstrapProc.ExitCode -ne 0) {
            throw "Moshi bootstrap failed with exit code $($bootstrapProc.ExitCode)"
        }
    }

    Write-Log "Smoke-testing import"
    $importProc = Start-Process -WorkingDirectory $RepoRoot -FilePath "uv" -ArgumentList @("run", "python", "tools/smoke_import.py") -Wait -PassThru -NoNewWindow
    if ($importProc.ExitCode -ne 0) {
        throw "Import smoke test failed"
    }

    Write-Log "Clearing ports $BackendPort, $FrontendPort, $McpHttpPort"
    Stop-PortListeners -Port $BackendPort
    Stop-PortListeners -Port $FrontendPort
    Stop-PortListeners -Port $McpHttpPort

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

    Write-Log "Starting MCP HTTP on $HostIp`:$McpHttpPort"
    $mcpArgs = @(
        "run", "uvicorn",
        "kyutai_mcp.mcp_http:app",
        "--host", $HostIp,
        "--port", "$McpHttpPort"
    )
    $mcpProc = Invoke-WithRetry -OperationName "start mcp http" -ScriptBlock {
        Start-Process -WorkingDirectory $RepoRoot -FilePath "uv" -ArgumentList $mcpArgs -PassThru
    }

    $frontendProc = $null
    if (-not $BackendOnly) {
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
    } else {
        Write-Log "Skipping frontend (BackendOnly mode)"
    }

    Write-Log "Waiting for backend readiness"
    $backendReady = Wait-HttpReady -Url "http://$HostIp`:$BackendPort/api/health"
    if (-not $backendReady) {
        throw "Backend did not become ready on port $BackendPort."
    }

    Write-Log "Waiting for MCP HTTP readiness"
    $mcpReady = Wait-HttpReady -Url "http://$HostIp`:$McpHttpPort/health"
    if (-not $mcpReady) {
        throw "MCP HTTP did not become ready on port $McpHttpPort."
    }

    if (-not $BackendOnly) {
        Write-Log "Waiting for frontend readiness"
        $frontendReady = Wait-HttpReady -Url "http://$HostIp`:$FrontendPort/"
        if (-not $frontendReady) {
            throw "Frontend did not become ready on port $FrontendPort."
        }
    }

    if ($BackendOnly) {
        Write-Log "Startup complete (backend only). Backend PID=$($backendProc.Id), MCP PID=$($mcpProc.Id)"
    } else {
        Write-Log "Startup complete. Backend PID=$($backendProc.Id), MCP PID=$($mcpProc.Id), Frontend PID=$($frontendProc.Id)"
    }
    Write-Log "Backend  http://$HostIp`:$BackendPort"
    if (-not $BackendOnly) {
        Write-Log "Frontend http://$HostIp`:$FrontendPort"
    }
    Write-Log "MCP HTTP http://$HostIp`:$McpHttpPort/mcp"

    if ((-not $BackendOnly) -and (-not $NoOpen)) {
        Start-Process "http://$HostIp`:$FrontendPort/"
    }
    exit 0
} catch {
    Write-Log "Startup failed: $($_.Exception.Message)" "ERROR"
    Write-Log "Run from repo root: powershell -File webapp\start.ps1" "ERROR"
    exit 1
}

