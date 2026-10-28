"""Voice-backend configuration store, lifecycle and status aggregation.

Configuration persists as JSON at ``~/.kyutai-mcp/backends-config.json``
(override with ``KYUTAI_BACKENDS_CONFIG``)::

    {
      "active_voice_backend": "moshi | pocket_tts | unmute",
      "tts_on_briefing": bool,
      "pocket_tts": {"command": ..., "http_url": ..., ...},
      "unmute": {"backend_url": ..., ...}
    }

``pocket_tts_start`` / ``pocket_tts_stop`` manage a real subprocess tracked in
this module; status functions probe live state and never hardcode answers.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

import httpx

from kyutai_mcp.backends.common import tts_output_dir
from kyutai_mcp.backends.pocket_tts import pocket_tts_synthesize

_VALID_BACKENDS = ("moshi", "pocket_tts", "unmute")

_DEFAULTS: dict[str, Any] = {
    "active_voice_backend": "moshi",
    "tts_on_briefing": False,
    "pocket_tts": {},
    "unmute": {},
}

_lock = threading.Lock()
_ptts_lock = threading.Lock()
_ptts_proc: subprocess.Popen[str] | None = None
_ptts_started_at_ms: int | None = None
_ptts_log_path: str | None = None


def _config_path() -> Path:
    override = os.environ.get("KYUTAI_BACKENDS_CONFIG", "").strip()
    return Path(override) if override else Path.home() / ".kyutai-mcp" / "backends-config.json"


def _read_file() -> dict[str, Any]:
    path = _config_path()
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def get_backends_config() -> dict[str, Any]:
    """Return the persisted voice-backend config merged over defaults."""
    with _lock:
        merged: dict[str, Any] = dict(_DEFAULTS)
        stored = _read_file()
        for key in _DEFAULTS:
            if key in stored:
                merged[key] = stored[key]
        # Preserve any extra keys the dashboard stored.
        for key, value in stored.items():
            if key not in merged:
                merged[key] = value
        return merged


def save_backends_config(payload: dict[str, Any]) -> dict[str, Any]:
    """Merge ``payload`` into the persisted config and return the result."""
    if not isinstance(payload, dict):
        raise ValueError("Backend config payload must be an object.")
    with _lock:
        stored = _read_file()
        for key, value in payload.items():
            stored[key] = value
        path = _config_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(stored, indent=2), encoding="utf-8")
        merged: dict[str, Any] = dict(_DEFAULTS)
        merged.update(stored)
        return merged


def set_active_voice_backend(backend: str) -> dict[str, Any]:
    """Persist the active voice backend and return the applied selection."""
    if backend not in _VALID_BACKENDS:
        raise ValueError(f"Unknown voice backend: {backend!r}. Expected one of {_VALID_BACKENDS}.")
    save_backends_config({"active_voice_backend": backend})
    return {"active_voice_backend": backend}


def _ptts_snapshot() -> dict[str, Any]:
    with _ptts_lock:
        proc = _ptts_proc
    if proc is None:
        return {"running": False, "pid": None, "exit_code": None}
    exit_code = proc.poll()
    return {"running": exit_code is None, "pid": proc.pid, "exit_code": exit_code}


def pocket_tts_start(cfg: dict[str, Any]) -> dict[str, Any]:
    """Start the Pocket TTS process from ``cfg`` (``command`` + ``args``).

    Returns ``{"started", "pid", ...}``. Raises ``RuntimeError`` when no
    command is configured or it cannot be resolved.
    """
    cfg = cfg if isinstance(cfg, dict) else {}
    snapshot = _ptts_snapshot()
    if snapshot["running"]:
        return {"started": False, "already_running": True, **snapshot}

    command = str(cfg.get("command") or "").strip()
    if not command:
        raise RuntimeError("Pocket TTS command is not configured. Set pocket_tts.command in Settings first.")
    resolved = shutil.which(command)
    if not resolved:
        candidate = Path(command)
        if candidate.exists():
            resolved = str(candidate)
    if not resolved:
        raise RuntimeError(f"Pocket TTS command not found: {command!r}.")

    args = [str(a) for a in (cfg.get("args") or []) if str(a).strip()]
    cwd = str(cfg.get("cwd") or "").strip() or None
    if cwd and not Path(cwd).is_dir():
        raise RuntimeError(f"Pocket TTS working directory does not exist: {cwd!r}.")

    log_path = Path.home() / ".kyutai-mcp" / "pocket-tts.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_file = log_path.open("ab")
    try:
        proc = subprocess.Popen(  # noqa: S603 - user-configured local TTS command
            [resolved, *args],
            cwd=cwd,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=False,
        )
    finally:
        log_file.close()

    with _ptts_lock:
        global _ptts_proc, _ptts_started_at_ms, _ptts_log_path
        # Reap a stale handle first so a second start cannot orphan anything.
        _ptts_proc = proc
        _ptts_started_at_ms = int(time.time() * 1000)
        _ptts_log_path = str(log_path)
    return {"started": True, "pid": proc.pid, "log_path": str(log_path)}


def pocket_tts_stop() -> dict[str, Any]:
    """Stop the tracked Pocket TTS process, if any."""
    with _ptts_lock:
        global _ptts_proc
        proc = _ptts_proc
        _ptts_proc = None
    if proc is None:
        return {"stopped": False, "detail": "not running"}
    try:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        return {"stopped": True, "exit_code": proc.poll()}
    except Exception as exc:
        return {"stopped": False, "detail": str(exc)}


async def _probe_url(url: str, timeout: float = 3.0) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=timeout)
            return {"ok": resp.status_code < 500, "http_status": resp.status_code}
    except Exception as exc:
        return {"ok": False, "detail": str(exc)}


async def backends_status(include_moshi: dict[str, Any] | None = None) -> dict[str, Any]:
    """Aggregate live availability for moshi / pocket_tts / unmute."""
    config = get_backends_config()
    ptts_cfg = config.get("pocket_tts", {})
    unmute_cfg = config.get("unmute", {})

    ptts_snapshot = _ptts_snapshot()
    ptts_url = str(ptts_cfg.get("http_url") or "").strip() if isinstance(ptts_cfg, dict) else ""
    ptts_http: dict[str, Any] = {"ok": None}
    if ptts_url:
        ptts_http = await _probe_url(ptts_url)
    pocket_tts = {
        "available": bool(ptts_snapshot["running"] or ptts_http.get("ok")),
        "process": ptts_snapshot,
        "http": ptts_http,
        "configured": bool(ptts_cfg),
    }

    unmute_url = ""
    if isinstance(unmute_cfg, dict):
        unmute_url = str(unmute_cfg.get("backend_url") or unmute_cfg.get("status_url") or "").strip()
    unmute_http: dict[str, Any] = {"ok": None}
    if unmute_url:
        unmute_http = await _probe_url(unmute_url)
    unmute = {
        "available": bool(unmute_http.get("ok")),
        "http": unmute_http,
        "configured": bool(unmute_cfg),
    }

    moshi = dict(include_moshi) if isinstance(include_moshi, dict) else {}
    return {
        "active_voice_backend": config.get("active_voice_backend", "moshi"),
        "tts_on_briefing": bool(config.get("tts_on_briefing", False)),
        "moshi": moshi,
        "pocket_tts": pocket_tts,
        "unmute": unmute,
    }


async def maybe_synthesize_briefing(spoken: str) -> dict[str, Any] | None:
    """Synthesize a briefing when TTS-on-briefing is enabled, else skip.

    Returns ``None`` when there is nothing to do, ``{"skipped": True, ...}``
    when disabled/unavailable, or the synthesis result dict.
    """
    text = (spoken or "").strip()
    if not text:
        return None
    config = get_backends_config()
    if not config.get("tts_on_briefing", False):
        return {"skipped": True, "reason": "tts_on_briefing is off"}
    active = config.get("active_voice_backend", "moshi")
    if active != "pocket_tts":
        return {"skipped": True, "reason": f"active voice backend is {active!r}"}
    ptts_cfg = config.get("pocket_tts", {})
    if not isinstance(ptts_cfg, dict) or not ptts_cfg:
        return {"skipped": True, "reason": "pocket_tts is not configured"}
    try:
        result = await pocket_tts_synthesize(text, ptts_cfg)
    except Exception as exc:
        return {"skipped": True, "reason": str(exc)}
    # Ensure the dashboard stores audio where /api/backends/tts/audio serves it.
    audio_file = result.get("audio_file")
    if audio_file:
        src = Path(audio_file)
        if not src.is_absolute():
            dst = tts_output_dir() / src.name
            if src.exists() and src.resolve() != dst.resolve():
                dst.write_bytes(src.read_bytes())
            result["audio_file"] = dst.name
    return result
