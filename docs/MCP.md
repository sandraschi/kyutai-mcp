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

## Voice pipeline tool: `voice_pipeline`

Portmanteau tool with 10 operations:

### Core voice operations

- `turn` — staged voice turn: quick-ack → intent → research → deep reasoner synthesis.
- `speak_boilerplate` — agentic briefing for `weather`, `world_news`, `ai_news`, `stock_market`.

### Moshi service control

- `service_status` — Moshi process state + HTTP health probe.
- `service_start` — start supervised Moshi process.
- `service_stop` — stop supervised Moshi process.

### Session history

- `session_history` — list voice sessions or replay turns for a specific session.

### Persona proxy control

- `proxy_status` — check if persona-aware WebSocket proxy is running.
- `proxy_start` — start proxy on port 8999 (relays to Moshi with text tapping + persona injection).
- `proxy_stop` — stop the persona proxy.
- `proxy_transcript` — fetch captured transcript from a proxied session (text tapped from Moshi's inner monologue).

The proxy sits between clients and Moshi at the WebSocket level. Audio passes through unmodified. Text tokens (`0x02` protocol messages) are intercepted for transcript capture and optional persona augmentation via a local LLM callback.

## Voice orchestration REST endpoints (web API bridge)

The web backend exposes advanced staged voice APIs that pair well with MCP-driven agentic flows:

- `POST /api/voice/turn` — staged turn handling (`quick_ack -> intent -> optional research -> final spoken text`)
- `POST /api/voice/speak_boilerplate` — generated briefings for `weather`, `world_news`, `stock_market`, `ai_news`
- `GET /api/voice/workflows` — prompt templates, skill chain, and usage examples

These routes let you keep Moshi as the realtime voice layer while delegating deeper answer writing to a stronger model stage.

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
