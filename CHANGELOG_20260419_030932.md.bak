# Changelog

All notable changes to **kyutai-mcp** will be documented in this file.

## [0.2.0] — 2026-03-28

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
