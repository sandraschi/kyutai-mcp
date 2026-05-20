set windows-shell := ["pwsh.exe", "-NoLogo", "-Command"]

# ── Dashboard ─────────────────────────────────────────────────────────────────

# Open the interactive recipe dashboard in the browser
default:
    @pwsh.exe -NoProfile -ExecutionPolicy Bypass -File ../mcp-central-docs/scripts/just-dashboard.ps1 -Path .

# ── Operation ─────────────────────────────────────────────────────────────────

# Start the Moshi MCP server
serve:
    uv run python -m kyutai_mcp

# Start the SOTA web dashboard
web:
    Set-Location webapp; ./start.ps1

# ── Quality ───────────────────────────────────────────────────────────────────

# Execute Ruff SOTA v13.1 linting
lint:
    uv run ruff check .
    Set-Location '{{justfile_directory()}}\webapp\frontend'
    npx @biomejs/biome ci .

# Execute Ruff SOTA v13.1 fix and formatting
fix:
    uv run ruff check . --fix --unsafe-fixes
    uv run ruff format .
    Set-Location '{{justfile_directory()}}\webapp\frontend'
    npx @biomejs/biome check --write .

# Run pytest suite
test:
    uv run pytest -q

# ── Hardening ─────────────────────────────────────────────────────────────────

# Execute Bandit security audit
check-sec:
    uv run bandit -r src/

# Execute safety audit of dependencies
audit-deps:
    uv run safety check
