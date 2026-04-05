"""
moshi_proxy.py — Persona-aware WebSocket proxy for Moshi.

Sits between the client and Moshi's WebSocket server (port 8998),
intercepting the text token stream to enable:
  1. Transcript capture — full conversation text logged per session
  2. Persona injection — text from Moshi feeds a persona-aware LLM reasoner
  3. Context augmentation — inject system context before/during conversation

Moshi Binary Protocol (upstream):
  0x00              → Handshake (server → client, sent once on connect)
  0x01 + opus_bytes → Audio frame (bidirectional)
  0x02 + utf8_text  → Text token from inner monologue (server → client)

This proxy is transparent by default — it relays all messages unmodified.
When persona mode is active, it buffers Moshi's text tokens and periodically
feeds them to the voice pipeline reasoner, injecting persona-augmented
responses as additional audio (via TTS) or text annotations.

Architecture:
  Client ──WS──► moshi_proxy (port 8999 or configurable)
                    ├─ relay audio ──WS──► Moshi (port 8998)
                    ├─ tap text tokens ──► transcript buffer
                    └─ (optional) persona reasoner ──► augmented responses
"""

from __future__ import annotations

import asyncio
import logging
import os
import time

from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine

import aiohttp
from aiohttp import web

logger = logging.getLogger("kyutai_mcp.proxy")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MOSHI_WS_URL = os.environ.get("MOSHI_WS_URL", "ws://127.0.0.1:8998/api/chat")
PROXY_HOST = os.environ.get("MOSHI_PROXY_HOST", "127.0.0.1")
PROXY_PORT = int(os.environ.get("MOSHI_PROXY_PORT", "8999"))


# ---------------------------------------------------------------------------
# Session transcript
# ---------------------------------------------------------------------------

@dataclass
class ProxySession:
    """Holds state for one proxied WebSocket session."""

    session_id: str
    started_at: float = field(default_factory=time.time)
    moshi_text_buffer: list[str] = field(default_factory=list)
    transcript_segments: list[dict[str, Any]] = field(default_factory=list)
    persona_system_prompt: str | None = None
    persona_enabled: bool = False

    # Accumulate Moshi text tokens into words/phrases
    _pending_text: str = ""

    def append_text_token(self, text: str) -> str | None:
        """Accumulate text token, return flushed segment when sentence-like boundary hit."""
        self._pending_text += text
        self.moshi_text_buffer.append(text)

        # Flush on sentence boundaries
        if any(self._pending_text.rstrip().endswith(c) for c in ".!?…"):
            segment = self._pending_text.strip()
            self._pending_text = ""
            if segment:
                self.transcript_segments.append({
                    "speaker": "moshi",
                    "text": segment,
                    "timestamp": time.time(),
                })
                return segment
        return None

    def get_transcript(self) -> list[dict[str, Any]]:
        """Return full transcript with any pending text flushed."""
        result = list(self.transcript_segments)
        if self._pending_text.strip():
            result.append({
                "speaker": "moshi",
                "text": self._pending_text.strip(),
                "timestamp": time.time(),
                "partial": True,
            })
        return result


# ---------------------------------------------------------------------------
# Active sessions registry
# ---------------------------------------------------------------------------

_sessions: dict[str, ProxySession] = {}
_session_counter = 0


def _next_session_id() -> str:
    global _session_counter
    _session_counter += 1
    return f"proxy-{_session_counter}-{int(time.time())}"


# ---------------------------------------------------------------------------
# Persona reasoner callback (pluggable)
# ---------------------------------------------------------------------------

PersonaCallback = Callable[[str, ProxySession], Coroutine[Any, Any, str | None]]


async def _default_persona_callback(
    moshi_segment: str, session: ProxySession
) -> str | None:
    """Default: no persona augmentation, just log."""
    logger.debug("Moshi said: %s", moshi_segment)
    return None


_persona_callback: PersonaCallback = _default_persona_callback


def set_persona_callback(cb: PersonaCallback) -> None:
    """Register a persona-aware reasoner callback.

    The callback receives each flushed Moshi text segment and the session.
    It can return an optional text response to inject back to the client
    as a text annotation (0x02 message).
    """
    global _persona_callback
    _persona_callback = cb


# ---------------------------------------------------------------------------
# WebSocket proxy handler
# ---------------------------------------------------------------------------

async def _relay_client_to_moshi(
    client_ws: web.WebSocketResponse,
    moshi_ws: aiohttp.ClientWebSocketResponse,
    session: ProxySession,
) -> None:
    """Forward client → Moshi (audio only in practice)."""
    try:
        async for msg in client_ws:
            if msg.type == aiohttp.WSMsgType.BINARY:
                await moshi_ws.send_bytes(msg.data)
            elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSING, aiohttp.WSMsgType.CLOSED):
                break
            elif msg.type == aiohttp.WSMsgType.ERROR:
                logger.error("Client WS error: %s", client_ws.exception())
                break
    except Exception as exc:
        logger.debug("client→moshi relay ended: %s", exc)
    finally:
        if not moshi_ws.closed:
            await moshi_ws.close()


async def _relay_moshi_to_client(
    client_ws: web.WebSocketResponse,
    moshi_ws: aiohttp.ClientWebSocketResponse,
    session: ProxySession,
) -> None:
    """Forward Moshi → client, tapping text tokens."""
    try:
        async for msg in moshi_ws:
            if msg.type == aiohttp.WSMsgType.BINARY:
                data: bytes = msg.data
                if len(data) == 0:
                    continue

                kind = data[0]

                # Always relay the raw message
                await client_ws.send_bytes(data)

                # Tap text tokens (kind == 2)
                if kind == 2 and len(data) > 1:
                    text = data[1:].decode("utf-8", errors="replace")
                    segment = session.append_text_token(text)

                    # If we got a complete segment, run persona callback
                    if segment and session.persona_enabled:
                        try:
                            augmented = await _persona_callback(segment, session)
                            if augmented:
                                # Inject persona text annotation back to client
                                annotation = b"\x02" + augmented.encode("utf-8")
                                await client_ws.send_bytes(annotation)
                                session.transcript_segments.append({
                                    "speaker": "persona",
                                    "text": augmented,
                                    "timestamp": time.time(),
                                })
                        except Exception as exc:
                            logger.warning("Persona callback failed: %s", exc)

            elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSING, aiohttp.WSMsgType.CLOSED):
                break
            elif msg.type == aiohttp.WSMsgType.ERROR:
                logger.error("Moshi WS error: %s", moshi_ws.exception())
                break
    except Exception as exc:
        logger.debug("moshi→client relay ended: %s", exc)
    finally:
        if not client_ws.closed:
            await client_ws.close()


async def handle_proxy_chat(request: web.Request) -> web.WebSocketResponse:
    """WebSocket handler: proxy /api/chat to upstream Moshi with text tapping."""
    client_ws = web.WebSocketResponse()
    await client_ws.prepare(request)

    # Parse optional persona config from query params
    persona_prompt = request.query.get("persona")
    session = ProxySession(
        session_id=_next_session_id(),
        persona_system_prompt=persona_prompt,
        persona_enabled=persona_prompt is not None,
    )
    _sessions[session.session_id] = session
    logger.info(
        "Proxy session %s started (persona=%s)",
        session.session_id,
        "enabled" if session.persona_enabled else "disabled",
    )

    # Connect to upstream Moshi
    http_session = aiohttp.ClientSession()
    try:
        moshi_ws = await http_session.ws_connect(MOSHI_WS_URL)
    except Exception as exc:
        logger.error("Cannot connect to Moshi at %s: %s", MOSHI_WS_URL, exc)
        await client_ws.close(code=1011, message=b"Cannot reach Moshi upstream")
        await http_session.close()
        return client_ws

    # Wait for Moshi handshake (0x00 byte)
    handshake = await moshi_ws.receive()
    if handshake.type == aiohttp.WSMsgType.BINARY and handshake.data == b"\x00":
        await client_ws.send_bytes(b"\x00")
    else:
        logger.warning("Unexpected handshake from Moshi: %s", handshake)
        await client_ws.send_bytes(b"\x00")  # send anyway, best effort

    # Run bidirectional relay
    try:
        await asyncio.gather(
            _relay_client_to_moshi(client_ws, moshi_ws, session),
            _relay_moshi_to_client(client_ws, moshi_ws, session),
        )
    finally:
        if not moshi_ws.closed:
            await moshi_ws.close()
        await http_session.close()
        logger.info(
            "Proxy session %s ended — %d transcript segments",
            session.session_id,
            len(session.transcript_segments),
        )

    return client_ws


# ---------------------------------------------------------------------------
# REST endpoints for proxy management
# ---------------------------------------------------------------------------

async def handle_proxy_sessions(request: web.Request) -> web.Response:
    """GET /api/proxy/sessions — list proxy sessions."""
    sessions_list = []
    for sid, s in _sessions.items():
        sessions_list.append({
            "session_id": sid,
            "started_at": s.started_at,
            "persona_enabled": s.persona_enabled,
            "transcript_segments": len(s.transcript_segments),
            "text_tokens": len(s.moshi_text_buffer),
        })
    return web.json_response({"sessions": sessions_list, "total": len(sessions_list)})


async def handle_proxy_transcript(request: web.Request) -> web.Response:
    """GET /api/proxy/sessions/{session_id}/transcript — get session transcript."""
    sid = request.match_info["session_id"]
    session = _sessions.get(sid)
    if not session:
        return web.json_response({"error": f"Session not found: {sid}"}, status=404)

    return web.json_response({
        "session_id": sid,
        "transcript": session.get_transcript(),
        "raw_text": "".join(session.moshi_text_buffer),
    })


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

def create_proxy_app(
    persona_callback: PersonaCallback | None = None,
) -> web.Application:
    """Create the aiohttp proxy application.

    Args:
        persona_callback: Optional async callback for persona-aware text augmentation.
            Receives (moshi_text_segment, session) and returns optional text to inject.
    """
    if persona_callback:
        set_persona_callback(persona_callback)

    app = web.Application()
    app.router.add_get("/api/chat", handle_proxy_chat)
    app.router.add_get("/api/proxy/sessions", handle_proxy_sessions)
    app.router.add_get("/api/proxy/sessions/{session_id}/transcript", handle_proxy_transcript)

    # Health endpoint
    async def health(_: web.Request) -> web.Response:
        return web.json_response({
            "ok": True,
            "service": "moshi-proxy",
            "upstream": MOSHI_WS_URL,
            "active_sessions": len(_sessions),
        })

    app.router.add_get("/health", health)

    return app


def run_proxy(
    host: str = PROXY_HOST,
    port: int = PROXY_PORT,
    persona_callback: PersonaCallback | None = None,
) -> None:
    """Run the proxy as a standalone server.

    Usage:
        python -m kyutai_mcp.proxy.moshi_proxy
    """
    app = create_proxy_app(persona_callback=persona_callback)
    logger.info("Moshi proxy starting on %s:%d → %s", host, port, MOSHI_WS_URL)
    web.run_app(app, host=host, port=port)


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )
    run_proxy()
