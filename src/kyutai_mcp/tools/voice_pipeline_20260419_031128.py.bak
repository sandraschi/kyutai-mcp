"""Voice pipeline implementation for MCP tool surface.

Provides the core logic for the ``voice_pipeline`` portmanteau MCP tool.
Each public ``*_impl`` function maps to one operation and is designed to be
called both from the MCP tool handler (server.py) and from the webapp
backend REST layer.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import threading
import time
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import httpx

# ---------------------------------------------------------------------------
# Session store (in-memory, thread-safe)
# ---------------------------------------------------------------------------

_session_lock = threading.Lock()
_sessions: dict[str, list[dict[str, Any]]] = {}


def _append_turn(session_id: str, turn: dict[str, Any]) -> None:
    with _session_lock:
        _sessions.setdefault(session_id, []).append(turn)


def session_history_impl(session_id: str | None = None) -> dict[str, Any]:
    """List sessions or return full turn history for one session."""
    with _session_lock:
        if session_id:
            turns = list(_sessions.get(session_id, []))
            return {
                "session_id": session_id,
                "turn_count": len(turns),
                "turns": turns,
            }
        summary = []
        for sid, turns in _sessions.items():
            summary.append({
                "session_id": sid,
                "turn_count": len(turns),
                "last_activity_ms": turns[-1].get("timestamp_ms") if turns else None,
            })
        return {"sessions": summary, "total": len(summary)}


# ---------------------------------------------------------------------------
# Glom-On provider helpers (self-contained, no webapp import)
# ---------------------------------------------------------------------------

def _ollama_base_url() -> str:
    raw = (os.environ.get("OLLAMA_HOST") or "127.0.0.1:11434").strip() or "127.0.0.1:11434"
    if "://" not in raw:
        raw = "http://" + raw
    parsed = urllib.parse.urlparse(raw)
    host = parsed.hostname or "127.0.0.1"
    if host == "0.0.0.0":
        host = "127.0.0.1"
    port = parsed.port if parsed.port is not None else 11434
    scheme = parsed.scheme or "http"
    return f"{scheme}://{host}:{port}"


async def _probe_providers() -> tuple[bool, str | None]:
    """Return (any_healthy, preferred_provider)."""
    async with httpx.AsyncClient() as client:
        # Ollama
        ollama_ok = False
        try:
            r = await client.get(f"{_ollama_base_url()}/api/tags", timeout=2.5)
            if r.status_code == 200:
                ollama_ok = True
        except Exception:
            pass
        # LM Studio
        lms_ok = False
        try:
            r = await client.get("http://127.0.0.1:1234/v1/models", timeout=2.5)
            if r.status_code == 200:
                lms_ok = True
        except Exception:
            pass
    preferred = "ollama" if ollama_ok else ("lmstudio" if lms_ok else None)
    return (ollama_ok or lms_ok, preferred)


async def _select_provider(requested: str) -> str:
    if requested != "auto":
        return requested
    _, preferred = await _probe_providers()
    if not preferred:
        raise RuntimeError("No local LLM provider detected. Start Ollama (11434) or LM Studio (1234).")
    return preferred


async def _list_models(provider: str) -> list[str]:
    async with httpx.AsyncClient() as client:
        if provider == "ollama":
            r = await client.get(f"{_ollama_base_url()}/api/tags", timeout=3.0)
            r.raise_for_status()
            p = r.json()
            return [m["name"] for m in p.get("models", []) if isinstance(m, dict) and "name" in m]
        else:
            r = await client.get("http://127.0.0.1:1234/v1/models", timeout=3.0)
            r.raise_for_status()
            p = r.json()
            return [d["id"] for d in p.get("data", []) if isinstance(d, dict) and "id" in d]


async def _select_model(provider: str, requested: str | None) -> str:
    if requested and requested.strip():
        return requested.strip()
    models = await _list_models(provider)
    if not models:
        raise RuntimeError(f"No models available for provider '{provider}'.")
    return models[0]


async def _chat(provider: str, model: str, messages: list[dict[str, str]]) -> str:
    async with httpx.AsyncClient() as client:
        if provider == "ollama":
            r = await client.post(
                f"{_ollama_base_url()}/api/chat",
                json={"model": model, "messages": messages, "stream": False},
                timeout=60.0,
            )
            r.raise_for_status()
            p = r.json()
            msg = p.get("message", {})
            return msg.get("content", "") if isinstance(msg, dict) else ""
        else:
            r = await client.post(
                "http://127.0.0.1:1234/v1/chat/completions",
                json={"model": model, "messages": messages, "temperature": 0.3},
                timeout=60.0,
            )
            r.raise_for_status()
            p = r.json()
            choices = p.get("choices", [])
            if choices:
                return choices[0].get("message", {}).get("content", "")
            return ""


# ---------------------------------------------------------------------------
# Intent helpers
# ---------------------------------------------------------------------------

def _infer_intent(utterance: str) -> str:
    t = utterance.lower()
    if "weather" in t:
        return "weather"
    if "ai news" in t or "artificial intelligence news" in t:
        return "ai_news"
    if "world news" in t or "headline" in t or "news" in t:
        return "world_news"
    if "stock" in t or "market" in t or "nasdaq" in t or "s&p" in t:
        return "stock_market"
    return "general"


def _extract_location(utterance: str) -> str | None:
    text = utterance.strip()
    low = text.lower()
    for marker in (" in ", " for ", " at "):
        idx = low.rfind(marker)
        if idx >= 0:
            loc = text[idx + len(marker):].strip(" ?!.,")
            if loc:
                return loc
    return None


# ---------------------------------------------------------------------------
# Data fetchers
# ---------------------------------------------------------------------------

async def _fetch_weather(location: str) -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        geo = await client.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": location, "count": 1, "language": "en", "format": "json"},
            timeout=8.0,
        )
        geo.raise_for_status()
        results = geo.json().get("results", [])
        if not results:
            raise RuntimeError(f"No location match for '{location}'.")
        item = results[0]
        lat, lon = item.get("latitude"), item.get("longitude")
        forecast = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat, "longitude": lon,
                "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
                "daily": "temperature_2m_max,temperature_2m_min",
                "timezone": "auto",
            },
            timeout=8.0,
        )
        forecast.raise_for_status()
    return {"location": item, "forecast": forecast.json()}


async def _fetch_rss(url: str, max_items: int = 6) -> list[dict[str, str]]:
    async with httpx.AsyncClient() as client:
        r = await client.get(url, timeout=8.0, follow_redirects=True)
        r.raise_for_status()
    root = ET.fromstring(r.text)
    out: list[dict[str, str]] = []
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        if title:
            out.append({"title": title, "url": link})
        if len(out) >= max_items:
            break
    return out


async def _fetch_stocks(symbols: list[str]) -> list[dict[str, Any]]:
    normalized = [s.strip().upper() for s in symbols if s.strip()] or ["^GSPC", "^IXIC", "^DJI"]
    encoded = urllib.parse.quote(",".join(normalized), safe=",")
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={encoded}",
            timeout=8.0,
        )
        r.raise_for_status()
        result = r.json().get("quoteResponse", {}).get("result", [])
    return [
        {
            "symbol": q.get("symbol"),
            "name": q.get("shortName") or q.get("longName"),
            "price": q.get("regularMarketPrice"),
            "change": q.get("regularMarketChange"),
            "change_percent": q.get("regularMarketChangePercent"),
            "currency": q.get("currency"),
        }
        for q in result if isinstance(q, dict)
    ]


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

VOICE_ACK_PROMPT = (
    "You produce the immediate spoken acknowledgment in <= 18 words. "
    "Tone: calm operator assistant. No markdown. No long explanations."
)

VOICE_REASONER_PROMPT = (
    "You are the deep reasoner for a voice assistant. "
    "Use provided tool outputs only. Return concise, spoken-friendly text (2-5 sentences). "
    "If uncertainty exists, state it plainly."
)

SPEAK_BOILERPLATE_PROMPT = (
    "Convert tool data into a polished spoken briefing. Keep factual, current, and concise. "
    "Output plain text suitable for TTS."
)


# ---------------------------------------------------------------------------
# speak_boilerplate_impl
# ---------------------------------------------------------------------------

_TOPIC_RSS: dict[str, str] = {
    "world_news": "https://feeds.bbci.co.uk/news/world/rss.xml",
    "ai_news": "https://www.artificialintelligence-news.com/feed/",
}


async def speak_boilerplate_impl(
    topic: str,
    provider: str = "auto",
    model: str | None = None,
    location: str = "Vienna",
    symbols: list[str] | None = None,
    style: str = "normal",
) -> dict[str, Any]:
    """Agentic spoken briefing for a topic."""
    prov = await _select_provider(provider)
    mdl = await _select_model(prov, model)

    sources: list[dict[str, str]] = []
    gathered: dict[str, Any] = {}

    if topic == "weather":
        gathered = await _fetch_weather(location)
        sources.append({"name": "Open-Meteo", "url": "https://api.open-meteo.com/v1/forecast"})
    elif topic in _TOPIC_RSS:
        headlines = await _fetch_rss(_TOPIC_RSS[topic], max_items=7)
        gathered = {"headlines": headlines}
        sources.append({"name": topic.replace("_", " ").title() + " RSS", "url": _TOPIC_RSS[topic]})
    elif topic == "stock_market":
        gathered = {"quotes": await _fetch_stocks(symbols or [])}
        sources.append({"name": "Yahoo Finance", "url": "https://query1.finance.yahoo.com/v7/finance/quote"})
    else:
        raise ValueError(f"Unsupported topic: {topic}")

    import json as _json
    system = SPEAK_BOILERPLATE_PROMPT + f"\nStyle: {style}\nEnd with one short line: 'Next update available on request.'"
    user = f"Topic: {topic}\nLocation: {location}\nRaw data JSON:\n{_json.dumps(gathered, ensure_ascii=False)}\nSources JSON:\n{_json.dumps(sources, ensure_ascii=False)}\n"
    text = await _chat(prov, mdl, [{"role": "system", "content": system}, {"role": "user", "content": user}])

    return {
        "topic": topic,
        "style": style,
        "spoken_text": text.strip(),
        "research_data": gathered,
        "sources": sources,
        "provider": prov,
        "model": mdl,
        "workflow": ["collect_live_sources", "normalize_topic_data", "llm_synthesize_spoken_briefing"],
    }


# ---------------------------------------------------------------------------
# voice_turn_impl
# ---------------------------------------------------------------------------

# Per-session location memory (separate from turn history)
_location_memory: dict[str, str] = {}


async def voice_turn_impl(
    utterance: str,
    session_id: str = "default",
    provider: str = "auto",
    model: str | None = None,
    use_deep_reasoner: bool = True,
    deep_provider: str = "same",
    deep_model: str | None = None,
    location_hint: str | None = None,
) -> dict[str, Any]:
    """Full staged voice turn: ack → intent → research → synthesis."""
    prov = await _select_provider(provider)
    mdl = await _select_model(prov, model)
    dprov = prov if deep_provider == "same" else await _select_provider(deep_provider)
    dmdl = mdl if (deep_provider == "same" and not deep_model) else await _select_model(dprov, deep_model)

    utterance = utterance.strip()
    intent = _infer_intent(utterance)
    extracted_loc = _extract_location(utterance)

    with _session_lock:
        remembered = _location_memory.get(session_id)
    chosen_location = (location_hint or extracted_loc or remembered or "").strip()

    # Quick ack
    try:
        quick_ack = (await _chat(prov, mdl, [
            {"role": "system", "content": VOICE_ACK_PROMPT},
            {"role": "user", "content": f"Intent={intent}; User said: {utterance}"},
        ])).strip()
    except Exception:
        quick_ack = "Got it. Working on that now."

    # Weather without location → clarification
    if intent == "weather" and not chosen_location:
        result = {
            "intent": intent,
            "requires_clarification": True,
            "quick_ack": quick_ack,
            "response": "Sure — which city should I use for the weather report?",
            "workflow_steps": ["quick_ack", "slot_check(location)", "clarification"],
        }
        _append_turn(session_id, {
            "timestamp_ms": int(time.time() * 1000),
            "utterance": utterance,
            **result,
        })
        return result

    # Info intents → agentic research
    if intent in {"weather", "world_news", "ai_news", "stock_market"}:
        report = await speak_boilerplate_impl(
            topic=intent,
            provider=dprov if use_deep_reasoner else prov,
            model=dmdl if use_deep_reasoner else mdl,
            location=chosen_location or "Vienna",
            symbols=["^GSPC", "^IXIC", "^DJI"],
            style="normal",
        )
        if intent == "weather" and chosen_location:
            with _session_lock:
                _location_memory[session_id] = chosen_location

        result = {
            "intent": intent,
            "quick_ack": quick_ack,
            "response": report["spoken_text"],
            "provider": prov,
            "model": mdl,
            "deep_provider": dprov,
            "deep_model": dmdl,
            "research_data": report["research_data"],
            "sources": report["sources"],
            "workflow_steps": [
                "quick_ack", "intent_resolution", "agentic_research",
                "deep_reasoner_synthesis", "tts_ready_output",
            ],
        }
        _append_turn(session_id, {"timestamp_ms": int(time.time() * 1000), "utterance": utterance, **result})
        return result

    # General turn
    response = (await _chat(
        dprov if use_deep_reasoner else prov,
        dmdl if use_deep_reasoner else mdl,
        [
            {"role": "system", "content": VOICE_REASONER_PROMPT + "\nThis is a general turn, no external tool results are attached."},
            {"role": "user", "content": f"User utterance: {utterance}"},
        ],
    )).strip()

    result = {
        "intent": "general",
        "quick_ack": quick_ack,
        "response": response,
        "provider": prov,
        "model": mdl,
        "deep_provider": dprov,
        "deep_model": dmdl,
        "workflow_steps": ["quick_ack", "deep_reasoner_final_answer", "tts_ready_output"],
    }
    _append_turn(session_id, {"timestamp_ms": int(time.time() * 1000), "utterance": utterance, **result})
    return result


# ---------------------------------------------------------------------------
# Moshi service control
# ---------------------------------------------------------------------------

_moshi_proc: subprocess.Popen[str] | None = None
_moshi_log_path: str | None = None
_moshi_started_at_ms: int | None = None
_moshi_last_exit: int | None = None
_moshi_lock = threading.Lock()

# Default config — can be set by the webapp backend on startup
_moshi_cmd: str = ""
_moshi_args: list[str] = []
_moshi_cwd: str | None = None
_moshi_http_url: str = "http://127.0.0.1:8998"


def configure_moshi_service(
    command: str, args: list[str], cwd: str | None, http_url: str,
) -> None:
    """Called by webapp backend to keep service config in sync."""
    global _moshi_cmd, _moshi_args, _moshi_cwd, _moshi_http_url
    _moshi_cmd = command
    _moshi_args = args
    _moshi_cwd = cwd
    _moshi_http_url = http_url


async def moshi_service_status_impl() -> dict[str, Any]:
    """Check Moshi process state + HTTP probe."""
    global _moshi_proc
    with _moshi_lock:
        proc = _moshi_proc
        log_path = _moshi_log_path
        started_at = _moshi_started_at_ms
        last_exit = _moshi_last_exit

    running = False
    pid: int | None = None
    exit_code: int | None = None
    if proc is not None:
        pid = proc.pid
        exit_code = proc.poll()
        running = exit_code is None

    http_ok: bool | None = None
    http_detail: str | None = None
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(_moshi_http_url, timeout=1.5)
            http_ok = r.status_code < 500
            http_detail = f"HTTP {r.status_code}"
    except Exception as exc:
        http_ok = False
        http_detail = str(exc)

    return {
        "running": running,
        "pid": pid,
        "exit_code": exit_code if exit_code is not None else last_exit,
        "started_at_ms": started_at,
        "log_path": log_path,
        "http_probe": {"url": _moshi_http_url, "ok": http_ok, "detail": http_detail},
    }


def moshi_service_start_impl() -> dict[str, Any]:
    """Start the supervised Moshi process."""
    global _moshi_proc, _moshi_log_path, _moshi_started_at_ms, _moshi_last_exit
    with _moshi_lock:
        if _moshi_proc is not None and _moshi_proc.poll() is None:
            return {"already_running": True, "pid": _moshi_proc.pid}

        if not _moshi_cmd:
            raise RuntimeError("Moshi command not configured. Set it in Settings → Moshi Service.")
        cmd = shutil.which(_moshi_cmd)
        if not cmd:
            p = Path(_moshi_cmd)
            if p.exists():
                cmd = str(p)
            else:
                raise RuntimeError(f"Command not found: {_moshi_cmd}")

        logs_dir = Path(__file__).resolve().parents[2] / "webapp" / "backend" / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)
        log_path = logs_dir / "moshi-service.log"
        log_fh = open(log_path, "a", encoding="utf-8", errors="replace")
        started_at_ms = int(time.time() * 1000)

        proc = subprocess.Popen(
            [cmd, *_moshi_args],
            cwd=_moshi_cwd,
            stdout=log_fh,
            stderr=log_fh,
            text=True,
            bufsize=1,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
        )
        _moshi_proc = proc
        _moshi_log_path = str(log_path)
        _moshi_started_at_ms = started_at_ms
        _moshi_last_exit = None

        return {"pid": proc.pid, "log_path": str(log_path)}


def moshi_service_stop_impl() -> dict[str, Any]:
    """Stop the supervised Moshi process."""
    global _moshi_proc, _moshi_last_exit
    with _moshi_lock:
        proc = _moshi_proc
        _moshi_proc = None
    if proc is None:
        return {"stopped": False, "detail": "not running"}
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except Exception:
        proc.kill()
    with _moshi_lock:
        _moshi_last_exit = proc.poll()
    return {"stopped": True, "exit_code": proc.poll()}


# ---------------------------------------------------------------------------
# Persona proxy control
# ---------------------------------------------------------------------------

_proxy_proc: subprocess.Popen[str] | None = None
_proxy_started_at_ms: int | None = None
_proxy_lock = threading.Lock()

# Default proxy config
_proxy_host: str = "127.0.0.1"
_proxy_port: int = 8999


def configure_proxy(host: str = "127.0.0.1", port: int = 8999) -> None:
    """Set proxy host/port (called from webapp settings)."""
    global _proxy_host, _proxy_port
    _proxy_host = host
    _proxy_port = port


async def proxy_status_impl() -> dict[str, Any]:
    """Check persona proxy state + HTTP health probe."""
    with _proxy_lock:
        proc = _proxy_proc
        started_at = _proxy_started_at_ms

    running = False
    pid: int | None = None
    if proc is not None:
        pid = proc.pid
        running = proc.poll() is None

    http_ok: bool | None = None
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"http://{_proxy_host}:{_proxy_port}/health", timeout=1.5
            )
            http_ok = r.status_code == 200
    except Exception:
        http_ok = False

    return {
        "running": running,
        "pid": pid,
        "started_at_ms": started_at,
        "host": _proxy_host,
        "port": _proxy_port,
        "http_probe": http_ok,
        "upstream_moshi": _moshi_http_url,
        "usage": (
            f"Connect to ws://{_proxy_host}:{_proxy_port}/api/chat "
            f"(add ?persona=<system_prompt> for persona mode)"
        ),
    }


def proxy_start_impl() -> dict[str, Any]:
    """Start the persona-aware WebSocket proxy as a subprocess."""
    import sys

    global _proxy_proc, _proxy_started_at_ms
    with _proxy_lock:
        if _proxy_proc is not None and _proxy_proc.poll() is None:
            return {"already_running": True, "pid": _proxy_proc.pid}

        # Launch proxy module as subprocess
        logs_dir = Path(__file__).resolve().parents[2] / "webapp" / "backend" / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)
        log_path = logs_dir / "moshi-proxy.log"
        log_fh = open(log_path, "a", encoding="utf-8", errors="replace")

        env = os.environ.copy()
        env["MOSHI_PROXY_HOST"] = _proxy_host
        env["MOSHI_PROXY_PORT"] = str(_proxy_port)
        env["MOSHI_WS_URL"] = "ws://127.0.0.1:8998/api/chat"

        proc = subprocess.Popen(
            [sys.executable, "-m", "kyutai_mcp.proxy.moshi_proxy"],
            cwd=str(Path(__file__).resolve().parents[2]),
            stdout=log_fh,
            stderr=log_fh,
            text=True,
            env=env,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
        )
        _proxy_proc = proc
        _proxy_started_at_ms = int(time.time() * 1000)

        return {
            "pid": proc.pid,
            "host": _proxy_host,
            "port": _proxy_port,
            "log_path": str(log_path),
        }


def proxy_stop_impl() -> dict[str, Any]:
    """Stop the persona proxy process."""
    global _proxy_proc
    with _proxy_lock:
        proc = _proxy_proc
        _proxy_proc = None
    if proc is None:
        return {"stopped": False, "detail": "not running"}
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except Exception:
        proc.kill()
    return {"stopped": True, "exit_code": proc.poll()}


async def proxy_transcript_impl(session_id: str | None = None) -> dict[str, Any]:
    """Fetch transcript from the running proxy via REST."""
    base = f"http://{_proxy_host}:{_proxy_port}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(3.0)) as client:
            if session_id:
                r = await client.get(
                    f"{base}/api/proxy/sessions/{session_id}/transcript"
                )
                r.raise_for_status()
                return r.json()
            else:
                r = await client.get(f"{base}/api/proxy/sessions")
                r.raise_for_status()
                return r.json()
    except httpx.ConnectError:
        return {"error": f"Proxy not reachable at {base}", "hint": "Start proxy first."}
