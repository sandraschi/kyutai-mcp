# Changelog

All notable changes to **kyutai-mcp** will be documented in this file.

## [Unreleased] — 2026-07-13

### Added
- Tool annotations: `READ_ONLY` for `moshi_ops`, `kyutai_backends`
- Docstring SOTA: `## Return Format`, `## Examples` on all 3 tools; removed `Args:` blocks
- Skills: `skills/kyutai-mcp/SKILL.md` with workflow guide + `SkillsDirectoryProvider` registration
- Dependencies: `framer-motion`, `zustand`, `@tauri-apps/api` added to webapp
- `.gitignore`: added `*.mcpb`, `mcpb-build/`
- Self-termination: `kyutai_shutdown` MCP tool + `/api/shutdown` in webapp backend + MCP HTTP
- `useZoom()` hook: Ctrl+Scroll through {0.5, 0.6, 0.7, 0.8, 1.0, 1.25, 1.5, 2.0, 3.0}, Ctrl+0 reset, CSS fallback, localStorage, zoom % indicator
- Backend-status listener: Tauri event + HTTP polling in AppShell
- Chat localStorage persistence (100-msg cap), data-testid attributes, Clear button
- Type declarations for `@tauri-apps/api`
- Font size/contrast audit: `text-xs`→`text-sm`, `text-slate-400`→`text-slate-300`, `text-slate-500`→`text-slate-400`, `text-amber-100`→`text-amber-200` across all 12 page files

### Fixed
- Ruff: import sorting in `server.py`

### Fixed
- Security: CORS `allow_origins=["*"]` in webapp backend → fleet standard with explicit origins + unconditional Tailscale/LAN/Tauri regex
- Security: CORS added to `mcp_http.py` (was missing entirely, MCP HTTP had no CORS middleware)
- Security: `build.ps1` now bundles `.env.example` instead of `.env` (was leaking dev API keys)
- Security: `tauri.conf.json` resources updated to `.env.example`
- Tauri: `backend.rs` `BACKEND_PORT` fixed from `10700` (wrong) to `10926` (MCP HTTP port)
- Tauri: `backend.rs` `free_port()` upgraded with image-name kill, UAC escalation, 240s poll loop
- Metadata: `glama.json` version synced to `0.2.0`, tools listed
- Version: `__init__.py` synced to match `pyproject.toml` (0.2.0)

### Added
- `.env.example` created (was missing entirely)
- `.cursorrules` for session context injection (Moshi voice ops)

## [0.2.1] — 2026-04-19

### Fixed
- `MCP_CATALOG` in `webapp/backend/app.py` listed only 6 `voice_pipeline` operations — missing the 4 proxy ops added in v0.2.0 (`proxy_status`, `proxy_start`, `proxy_stop`, `proxy_transcript`). The catalog is used by the dashboard Tools page and agent discovery; this caused those operations to be invisible to agents using catalog-based introspection.
- Removed dead `prefab-ui>=0.14.0` dependency from `pyproject.toml` — nothing in the codebase imports prefab_ui.
- **Replaced Yahoo Finance `v7/finance/quote` with Finnhub** — the Yahoo endpoint is unofficial, intermittently blocked, and has no documented stability. Both `voice_pipeline.py` and `app.py` now use `https://finnhub.io/api/v1/quote` with `FINNHUB_API_KEY`. If the key is not set, the feature returns a clear error with a link to register rather than silently failing. Free key at https://finnhub.io/register (60 req/min, no CC).
- Default stock symbols changed from Yahoo index tickers (`^GSPC`, `^IXIC`, `^DJI`) to ETF equivalents (`SPY`, `QQQ`, `AAPL`, `NVDA`) which are supported by Finnhub's free tier.

### Changed
- README: FastMCP badge updated from `3.1.0` to `3.1+`
- README: Added cross-reference table comparing kyutai-mcp (local/offline) with speech-mcp (cloud APIs)

### Known issues (not fixed, documented)
- `pyproject.toml` pins `fastmcp>=3.1.0`; FastMCP 3.2 changed the `mcp.run()` HTTP transport kwargs. Upgrade to 3.2 requires testing the HTTP transport path in `server.py`.
- `proxy_start_impl` and `moshi_service_start_impl` derive log directory path from `__file__` — works in dev layout, breaks if package is installed outside the repo.
- Yahoo Finance `v7/finance/quote` endpoint used for stock data is unofficial and intermittently blocked. No fallback implemented.



### Added
- **Persona-aware WebSocket proxy** (`proxy/moshi_proxy.py`) — transparent relay on port 8999 that sits between clients and Moshi (8998). Relays audio untouched, taps `0x02` text tokens for transcript capture.
- **Persona LLM callback** (`proxy/persona.py`) — pluggable callback using Glom-On auto-discovery (Ollama/LM Studio). Rate-limited (5s), sentence-boundary triggered, supports `SKIP` signal.
- **4 new voice_pipeline operations**: `proxy_status`, `proxy_start`, `proxy_stop`, `proxy_transcript` — full proxy lifecycle and transcript retrieval from the MCP tool surface.
- **Robofang voice bridge** — `robofang_voice` tool registered in Robofang fleet; REST relay pattern to kyutai-mcp backend at `http://127.0.0.1:10924`.
- **Fleet manifest entry** — Kyutai Voice Hand in `robofang/fleet_manifest.yaml` (potassium score 9.5).
- **aiohttp** added as a dependency for proxy WebSocket relay.

### Changed
- `voice_pipeline` tool expanded from 6 → 10 operations.
- `voice/pipeline_guide` prompt updated to document proxy workflow.
- `about://` resource updated to mention persona proxy.
- `docs/MCP.md` updated with proxy tool reference.
- `docs/VOICE_WORKFLOWS.md` extended with persona proxy section.

---

## [0.1.0] — 2026-03-27

### Added
- **FastMCP 3.1+ server** with `moshi_ops` portmanteau (status, local_viability, references, recommend_runtime).
- **voice_pipeline** portmanteau tool: `turn`, `speak_boilerplate`, `service_status`, `service_start`, `service_stop`, `session_history`.
- **SOTA webapp** — React/Vite frontend (port 10925) with FastAPI backend (port 10924).
- **Staged voice pipeline**: quick-ack → intent resolution → agentic research → deep reasoner synthesis → TTS output.
- **Agentic briefings**: weather (Open-Meteo), world news (BBC RSS), AI news, stock market (Yahoo Finance).
- **Glom-On** local LLM integration (Ollama/LM Studio auto-discovery).
- **Moshi process supervisor** — start/stop/status via REST + MCP.
- **Discovery**: `glama.json`, `/.well-known/mcp/manifest.json`, `/api/mcp/catalog`.
- Docs: `MCP.md`, `GLOM.md`, `MOSHI_SERVICE.md`, `VOICE_WORKFLOWS.md`, `WEBAPP.md`, `TOOLBENCH_INTENT.md`.
