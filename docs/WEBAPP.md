# Web application

## Ports (fleet default)

| Service | Port | Notes |
|---------|------|--------|
| Web backend (FastAPI) | 10924 | `/api/*`, `/.well-known/*` |
| Web frontend (Vite dev) | 10925 | Proxies `/api` and `/.well-known` to backend |
| MCP HTTP (optional, separate process) | 10926 | Streamable HTTP MCP at `/mcp` |

Ports are defined in `src/kyutai_mcp/config.py` (`KyutaiConfig`).

## Stack

- **Frontend:** React 18, Vite 5, Tailwind, React Router, lucide icons.
- **Backend:** FastAPI + uvicorn, colocated under `webapp/backend/app.py`, imports `kyutai_mcp` for shared logic.

## Standard routes

| Path | Purpose |
|------|---------|
| `/` | Home, health + port summary |
| `/actions` | Start/stop style workflows |
| `/tools` | `moshi_ops` runner + MCP catalog |
| `/apps` | Glama JSON, well-known manifest, MCP HTTP URL |
| `/moshi`, `/talk` | Upstream Moshi UI (link + iframe + probe) |
| `/status` | Runtime, Glom, Moshi service, tail logs |
| `/chat` | Persona chat against Glom providers |
| `/api/voice/*` | Advanced staged voice orchestration + agentic boilerplates (backend API surface) |
| `/logs` | Full-page session logger (shared buffer with bottom panel) |
| `/settings` | Moshi service command, cwd, HTTP URL |
| `/help` | Extended in-app documentation |

## Build

```powershell
cd webapp\frontend
npm install
npm run build
```

Output: `webapp/frontend/dist` — serve via your deployment strategy or use `start.ps1` for dev.

## Startup

From `webapp`:

```powershell
.\start.ps1
```

Clears listeners, starts backend + Vite. See `webapp/start.ps1` for flags.

## Advanced voice APIs

- `POST /api/voice/turn` — staged voice flow (ack -> intent -> optional research -> final spoken text)
- `POST /api/voice/speak_boilerplate` — topic briefings (`weather`, `world_news`, `stock_market`, `ai_news`)
- `GET /api/voice/workflows` — prompts, skills, and examples for integration

See `docs/VOICE_WORKFLOWS.md` for request examples and design rationale.
