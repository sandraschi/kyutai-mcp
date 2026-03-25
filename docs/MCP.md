# MCP server

## Framework

- **FastMCP 3.1+** (`src/kyutai_mcp/server.py`).
- **Transports:** stdio (default for CLI) and HTTP on `127.0.0.1:10926` with path `/mcp` (see `config.py`).

## Primary tool: `moshi_ops`

Portmanteau tool with `operation`:

- `status` — server/Moshi-oriented status.
- `local_viability` — environment hints for local runs.
- `references` — pointers to upstream docs/repos.
- `recommend_runtime` — runtime guidance.

Optional `include_env` for a safe subset of environment diagnostics.

## Discovery

- **Catalog (dashboard):** `GET /api/mcp/catalog` (web backend) — JSON summary of tools, resources, prompts.
- **Glama:** `glama.json` at repo root; `GET /api/discovery/glama` exposes parsed JSON.
- **Well-known:** `GET /.well-known/mcp/manifest.json` — minimal manifest including MCP HTTP URL.

## Running

```powershell
uv run python -m kyutai_mcp
```

For HTTP transport, the server entry should listen on the configured host/port (see package `__main__` and server bootstrap).

## Client wiring

Point your MCP client at:

- **Stdio:** command `uv` with args `run python -m kyutai_mcp` (or activate venv and run module).
- **HTTP:** `http://127.0.0.1:10926/mcp` when the server is up with HTTP enabled.
