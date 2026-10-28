"""Unmute backend availability probe (async HTTP, no pretending).

Unmute runs externally (its own UI + backend). This module only probes the
configured backend URL and reports what it finds. ``available`` is True only
when the endpoint answers with HTTP < 500.
"""

from __future__ import annotations

from typing import Any

import httpx

from kyutai_mcp.config import DEFAULT_CONFIG


def _status_url(cfg: dict[str, Any]) -> str:
    return str(
        cfg.get("status_url")
        or cfg.get("backend_url")
        or (DEFAULT_CONFIG.unmute_backend_url.rstrip("/") + "/api/health")
    ).strip()


async def unmute_status(cfg: dict[str, Any]) -> dict[str, Any]:
    """Probe the configured Unmute backend URL and report availability."""
    url = _status_url(cfg if isinstance(cfg, dict) else {})
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=5.0)
            ok = resp.status_code < 500
            return {
                "available": ok,
                "url": url,
                "http_status": resp.status_code,
                "detail": f"HTTP {resp.status_code}",
            }
    except Exception as exc:
        return {"available": False, "url": url, "detail": str(exc)}
