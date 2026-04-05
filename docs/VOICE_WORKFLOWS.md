# Voice workflows (advanced)

This document describes the staged speech orchestration introduced in the web backend:

- `POST /api/voice/turn`
- `POST /api/voice/speak_boilerplate`
- `GET /api/voice/workflows`

These endpoints are designed for **Moshi + external reasoner** pipelines.

## 1) Staged flow model

`/api/voice/turn` follows this pattern:

1. **Quick ack** (fast, short phrase for conversational flow)
2. **Intent resolution** (`weather`, `world_news`, `ai_news`, `stock_market`, `general`)
3. **Agentic research** (for info-heavy intents)
4. **Deep reasoner synthesis** (spoken final answer)
5. **TTS-ready output**

This keeps latency low while still allowing deeper answer quality.

## 2) Request schema (voice turn)

```json
{
  "session_id": "desk-1",
  "utterance": "hi moshi weather report please for vienna",
  "provider": "auto",
  "model": null,
  "use_deep_reasoner": true,
  "deep_provider": "same",
  "deep_model": null,
  "location_hint": null
}
```

Notes:

- `provider=auto` routes by Glom health (`ollama` then `lmstudio`).
- `deep_provider=same` means no second provider hop by default.
- Session memory stores last weather location per `session_id`.

## 3) Agentic `speak_boilerplate`

`/api/voice/speak_boilerplate` supports:

- `weather`
- `world_news`
- `stock_market`
- `ai_news`

### Live data collectors

- Weather: Open-Meteo geocoding + forecast
- World news: BBC world RSS feed
- AI news: artificialintelligence-news.com RSS feed
- Stocks: Yahoo Finance quote endpoint

The endpoint then synthesizes a spoken briefing using the selected local LLM.

## 4) Prompt templates

`GET /api/voice/workflows` returns prompt templates and skills metadata.

Current templates:

- `voice_ack_prompt`
- `voice_reasoner_prompt`
- `speak_boilerplate_prompt`

## 5) Usage examples

### Weather report

```json
POST /api/voice/turn
{
  "session_id": "car",
  "utterance": "hi moshi weather report please for tokyo",
  "provider": "auto",
  "use_deep_reasoner": true
}
```

Expected behavior:

- quick acknowledgment
- weather intent
- Open-Meteo fetch
- spoken summary returned in `response`

### World news bulletin

```json
POST /api/voice/speak_boilerplate
{
  "topic": "world_news",
  "provider": "auto",
  "style": "normal"
}
```

### Stock market boilerplate

```json
POST /api/voice/speak_boilerplate
{
  "topic": "stock_market",
  "symbols": ["^GSPC", "^IXIC", "AAPL", "NVDA"],
  "provider": "auto",
  "style": "brief"
}
```

## 6) Integrating Opus-class reasoners

If you want a slower but stronger reasoner (e.g. Opus-class), keep the same staged shape:

1. quick ack from fast local model
2. tool/research collection
3. deep reasoner synthesis
4. speak final text

This backend currently supports local Glom providers directly. For external reasoners, add a compatible relay/gateway and map it as a provider in the orchestration layer.

## 7) Persona-aware proxy

The **persona proxy** (`proxy/moshi_proxy.py`) is a WebSocket relay that sits between clients and Moshi. It enables transcript capture and persona-augmented responses without modifying Moshi's model code.

### Architecture

```
Client ──WS──► Proxy (port 8999) ──WS──► Moshi (port 8998)
                 │
                 ├─ audio frames (0x01) → transparent relay
                 ├─ text tokens (0x02) → tap into transcript
                 └─ persona callback → local LLM → inject annotation
```

### Starting the proxy

Via MCP:
```json
{ "operation": "proxy_start" }
```

Via REST:
```
POST /api/proxy/start
```

The proxy binds to `127.0.0.1:8999` by default (configurable via `MOSHI_PROXY_HOST` / `MOSHI_PROXY_PORT`).

### Persona injection

Connect with a persona system prompt:

```
ws://127.0.0.1:8999/api/chat?persona=You+are+a+Viennese+coffee+shop+companion
```

When a persona is set:
1. Text tokens from Moshi accumulate until a sentence boundary (`.!?…`).
2. The completed sentence is sent to a local LLM (Ollama/LM Studio via Glom-On).
3. The LLM can return augmented text or `SKIP`.
4. Augmented text is injected back to the client as a `0x02` text annotation.
5. Callbacks are rate-limited to 1 per 5 seconds.

### Retrieving transcripts

Via MCP:
```json
{ "operation": "proxy_transcript", "session_id": "desk-1" }
```

Transcripts contain all tapped text segments with timestamps, including both Moshi originals and persona augmentations.

### Proxy control operations (MCP)

| Operation | Description |
|-----------|-------------|
| `proxy_status` | Check proxy process + health probe |
| `proxy_start` | Start proxy subprocess |
| `proxy_stop` | Stop proxy |
| `proxy_transcript` | Fetch per-session transcript |
