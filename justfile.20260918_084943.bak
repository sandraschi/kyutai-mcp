set windows-shell := ["powershell.exe", "-NoProfile", "-Command"]
import 'scripts/just/fleet.just'

REPO := justfile_directory()
UV := env_var_or_default("UV_EXE", "uv")

# --- Dashboard ---

# Open the interactive recipe dashboard in the browser
default:
    @just --list

# --- Install ---

# Install Python + frontend dependencies
install bootstrap:
    & "{{UV}}" sync
    Set-Location "{{REPO}}\webapp\frontend"
    npm install

# --- Operation ---

# Start full stack (canonical: webapp/start.ps1)
start dev web:
    Set-Location "{{REPO}}\webapp"
    .\start.bat

# Start full stack from repo root (delegates to webapp)
start-root:
    Set-Location "{{REPO}}"
    .\start.bat

# Start stdio MCP server only (Claude Desktop / Cursor)
serve mcp:
    & "{{UV}}" run python -m kyutai_mcp

# Start MCP HTTP transport only (port 10926)
mcp-http:
    & "{{UV}}" run uvicorn kyutai_mcp.mcp_http:app --host 127.0.0.1 --port 10926

# Pre-download Moshi HF weights (no GPU load)
download-moshi:
    & "{{UV}}" run python tools/download_moshi_weights.py

# Install Pocket TTS optional backend (CPU TTS on :10929)
bootstrap-pocket-tts:
    powershell.exe -NoProfile -NoProfile -ExecutionPolicy Bypass -File "{{REPO}}\tools\bootstrap_pocket_tts.ps1"

# --- Quality ---

# Quick import smoke test
check:
    & "{{UV}}" run python -c "import kyutai_mcp.server, kyutai_mcp.mcp_http; print('Import OK')"

# Execute Ruff SOTA linting
lint:
    & "{{UV}}" run ruff check .
    Set-Location '{{REPO}}\webapp\frontend'
    npx @biomejs/biome ci .

# Execute Ruff fix and formatting
fix:
    & "{{UV}}" run ruff check . --fix --unsafe-fixes
    & "{{UV}}" run ruff format .
    Set-Location '{{REPO}}\webapp\frontend'
    npx @biomejs/biome check --write .

# Run pytest suite
test:
    & "{{UV}}" run pytest -q

e2e:
    powershell.exe -NoProfile -NoProfile -ExecutionPolicy Bypass -File "D:\Dev\repos\mcp-central-docs\scripts\playwright-audit.ps1" -RepoPath "{{REPO}}"

# --- Hardening ---

# Execute Bandit security audit
check-sec:
    & "{{UV}}" run bandit -r src/

# Execute safety audit of dependencies
audit-deps:
	& "{{UV}}" run safety check

# --- Native  Tauri ---

# Build the Tauri NSIS desktop installer (full pipeline: frontend -> Rust -> NSIS)
build-native:
	$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
	Set-Location '{{justfile_directory()}}\native'
	npx @tauri-apps/cli build --bundles nsis


# Bootstrap: install dev deps + pre-commit hook
bootstrap:
    uv sync --group dev
    uv run pre-commit install
    Write-Host "Pre-commit hooks installed." -ForegroundColor Green