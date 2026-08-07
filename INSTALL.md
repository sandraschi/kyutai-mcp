# Installation

## 🚀 Quick Start (recommended)

```powershell
# Install just if you don't have it
winget install Casey.Just    # Windows
# scoop install just          # Windows (alternative)
# brew install just           # macOS
# sudo apt install just       # Debian/Ubuntu
# cargo install just          # Linux (Rust)

git clone https://github.com/sandraschi/kyutai-mcp
cd kyutai-mcp
just
```

The interactive recipe dashboard opens in your browser. From there:

```powershell
just bootstrap   # install all dependencies
just serve       # start the server
just web         # start the frontend (if applicable)
```

> **Why not `pip install`?** MCP servers bundle webapps, configs, project scaffolding, and tooling that a flat Python package can't deliver. PyPI offers no safety advantage — it doesn't audit packages either. `just` gives you the complete, ready-to-run stack.

---

## 🐌 Traditional Setup

If you prefer not to use `just`:

1. Install [Python 3.13+](https://python.org) and [uv](https://docs.astral.sh/uv/)
2. Clone and enter the repo:
   ```powershell
   git clone https://github.com/sandraschi/kyutai-mcp
   cd kyutai-mcp
   ```
3. Install dependencies:
   ```powershell
   uv sync --all-extras
   ```
4. (recommended) Pre-download Moshi weights:
   ```powershell
   just download-moshi
   # or: uv run python tools/download_moshi_weights.py
   ```

5. Start the full stack (canonical launcher is under `webapp/`):
   ```powershell
   .\webapp\start.bat
   # or from repo root (delegates to webapp):
   .\start.bat
   # or: just start
   ```

   Services:
   - Backend REST API: `http://127.0.0.1:10924`
   - Frontend dashboard: `http://127.0.0.1:10925`
   - MCP HTTP transport: `http://127.0.0.1:10926/mcp`

6. Stdio MCP only (for Claude Desktop / Cursor):
   ```powershell
   uv run python -m kyutai_mcp
   # or: just mcp
   ```

---

## ❓ Troubleshooting

| Issue | Fix |
|---|---|
| `just` not found | Install via `winget install Casey.Just`, `scoop install just`, or `brew install just` |
| Port conflict | Stop listeners on 10924/10925/10926, or re-run `start.bat` (clears ports automatically) |
| `TypeError: run_stdio_async() got an unexpected keyword argument` | Update repo — FastMCP 3.2+ requires separate stdio and HTTP entrypoints |
| Dependencies out of sync | `uv sync --all-extras` |
| Something else | [Open a GitHub issue](https://github.com/sandraschi/kyutai-mcp/issues) |

---

*See the main [README](README.md) for feature overview and documentation.*
