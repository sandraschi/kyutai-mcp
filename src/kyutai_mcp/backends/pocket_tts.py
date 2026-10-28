"""Pocket TTS synthesis adapter (async HTTP passthrough).

Pocket TTS runs as an external process exposing an HTTP endpoint. This module
does not pretend to synthesize locally: it forwards the text to the
configured endpoint and stores the returned audio under ``tts_output_dir``.
When no endpoint is configured it raises ``RuntimeError`` with an actionable
message, which the dashboard converts to HTTP 503.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import httpx

from kyutai_mcp.backends.common import tts_output_dir


def _endpoint_from(cfg: dict[str, Any]) -> str:
    endpoint = str(cfg.get("synthesize_url") or cfg.get("http_url") or "").strip()
    if not endpoint:
        host = str(cfg.get("host") or "127.0.0.1").strip()
        port = int(cfg.get("port") or 10929)
        path = str(cfg.get("synthesize_path") or "/api/synthesize").strip()
        endpoint = f"http://{host}:{port}{path}"
    return endpoint


async def pocket_tts_synthesize(
    text: str,
    cfg: dict[str, Any],
    voice: str | None = None,
) -> dict[str, Any]:
    """Synthesize ``text`` via the configured Pocket TTS endpoint.

    Returns ``{"audio_file", "bytes", "voice", "endpoint"}`` where
    ``audio_file`` is the WAV filename served by
    ``GET /api/backends/tts/audio``. Raises ``RuntimeError`` when no endpoint
    is configured or the service cannot be reached.
    """
    cleaned = (text or "").strip()
    if not cleaned:
        raise RuntimeError("Nothing to synthesize: text is empty.")
    if not isinstance(cfg, dict) or not (
        cfg.get("synthesize_url") or cfg.get("http_url") or cfg.get("host") or cfg.get("port")
    ):
        if not cfg.get("auto_default"):
            raise RuntimeError(
                "Pocket TTS endpoint is not configured. Set it in Settings (pocket_tts) before synthesizing."
            )
    endpoint = _endpoint_from(cfg)
    payload: dict[str, Any] = {"text": cleaned}
    resolved_voice = voice or cfg.get("voice") or cfg.get("default_voice")
    if resolved_voice:
        payload["voice"] = resolved_voice

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(endpoint, json=payload, timeout=120.0)
            resp.raise_for_status()
    except Exception as exc:
        raise RuntimeError(f"Pocket TTS request to {endpoint} failed: {exc}") from exc

    content_type = resp.headers.get("content-type", "")
    body = resp.content
    if not body and "json" in content_type:
        # Some endpoints answer {"audio_url": ...}; fetch it.
        try:
            data = resp.json()
        except Exception as exc:
            raise RuntimeError(f"Pocket TTS returned no audio from {endpoint}.") from exc
        audio_url = data.get("audio_url") or data.get("url")
        if not audio_url:
            raise RuntimeError(f"Pocket TTS returned no audio from {endpoint}.")
        try:
            async with httpx.AsyncClient() as client:
                fetched = await client.get(audio_url, timeout=120.0)
                fetched.raise_for_status()
                body = fetched.content
        except Exception as exc:
            raise RuntimeError(f"Pocket TTS audio fetch from {audio_url} failed: {exc}") from exc

    if not body:
        raise RuntimeError(f"Pocket TTS returned no audio from {endpoint}.")

    stamp = time.strftime("%Y%m%d-%H%M%S")
    filename = f"briefing-{stamp}.wav"
    out_path = tts_output_dir() / filename
    out_path.write_bytes(body)
    return {
        "audio_file": filename,
        "bytes": len(body),
        "voice": resolved_voice,
        "endpoint": endpoint,
    }
