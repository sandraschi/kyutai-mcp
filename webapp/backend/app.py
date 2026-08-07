from __future__ import annotations

import asyncio
import json
import os
import platform
import shutil
import subprocess
import threading
import time
import urllib.parse
import xml.etree.ElementTree as ET
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator

from kyutai_mcp.backends.common import tts_output_dir
from kyutai_mcp.backends.manager import (
    backends_status,
    get_backends_config,
    maybe_synthesize_briefing,
    pocket_tts_start,
    pocket_tts_stop,
    save_backends_config,
    set_active_voice_backend,
)
from kyutai_mcp.backends.pocket_tts import pocket_tts_synthesize
from kyutai_mcp.backends.unmute import unmute_status
from kyutai_mcp.config import DEFAULT_CONFIG
from kyutai_mcp.moshi_discovery import apply_discovered_if_needed, discover_moshi, validate_config
from kyutai_mcp.server import moshi_ops_impl
from kyutai_mcp.tools.voice_pipeline import moshi_service_status_impl


@dataclass
class MoshiServiceConfig:
    command: str
    args: list[str]
    cwd: str | None
    http_url: str


@dataclass
class MoshiServiceState:
    proc: subprocess.Popen[str] | None
    log_path: str | None
    started_at_ms: int | None
    last_exit_code: int | None


_moshi_config = MoshiServiceConfig(
    command="",
    args=[],
    cwd=None,
    http_url="http://127.0.0.1:8998",
)
_moshi_state = MoshiServiceState(proc=None, log_path=None, started_at_ms=None, last_exit_code=None)
_moshi_lock = threading.Lock()
_moshi_start_lock = threading.Lock()
_moshi_last_start_attempt_ms: int = 0
_MOSHI_START_COOLDOWN_MS = 30_000
_moshi_config_path = Path(__file__).parent / "moshi-service-config.json"
_dashboard_settings_path = Path(__file__).parent / "dashboard-settings.json"
_settings_lock = threading.Lock()
_DEFAULT_DASHBOARD_SETTINGS: dict[str, Any] = {
    "chat_persona": "reductionist",
    "chat_provider": "auto",
    "chat_model": None,
    "voice_provider": "auto",
    "voice_model": None,
    "refine_provider": "auto",
    "refine_model": None,
}
_dashboard_settings: dict[str, Any] = dict(_DEFAULT_DASHBOARD_SETTINGS)
_voice_session_lock = threading.Lock()
_voice_sessions: dict[str, dict[str, Any]] = {}


class MoshiOpsRequest(BaseModel):
    operation: Literal["status", "local_viability", "references", "recommend_runtime"]
    include_env: bool = False


class ChatRefineRequest(BaseModel):
    persona: Literal["reductionist", "debugger", "explainer"] = "reductionist"
    prompt: str = Field(min_length=1, max_length=20_000)
    provider: Literal["auto", "ollama", "lmstudio"] = "auto"
    model: str | None = None


class ChatMessageRequest(BaseModel):
    persona: Literal["reductionist", "debugger", "explainer"] = "reductionist"
    message: str = Field(min_length=1, max_length=20_000)
    provider: Literal["auto", "ollama", "lmstudio"] = "auto"
    model: str | None = None


class VoiceTurnRequest(BaseModel):
    session_id: str = Field(default="default", min_length=1, max_length=128)
    utterance: str = Field(min_length=1, max_length=20_000)
    provider: Literal["auto", "ollama", "lmstudio"] = "auto"
    model: str | None = None
    use_deep_reasoner: bool = True
    deep_provider: Literal["same", "ollama", "lmstudio"] = "same"
    deep_model: str | None = None
    location_hint: str | None = None


class SpeakBoilerplateRequest(BaseModel):
    topic: Literal["weather", "world_news", "stock_market", "ai_news"]
    location: str = Field(default="Vienna", max_length=200)
    symbols: list[str] = Field(default_factory=lambda: ["^GSPC", "^IXIC", "^DJI"])
    provider: Literal["auto", "ollama", "lmstudio"] = "auto"
    model: str | None = None
    style: Literal["brief", "normal", "detailed"] = "normal"


class GlomProbeResult(BaseModel):
    provider: Literal["ollama", "lmstudio"]
    url: str
    healthy: bool
    details: str


class KyutaiBackendsConfigRequest(BaseModel):
    active_voice_backend: Literal["moshi", "pocket_tts", "unmute"] | None = None
    tts_on_briefing: bool | None = None
    pocket_tts: dict[str, Any] | None = None
    unmute: dict[str, Any] | None = None


class PocketTtsSynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)
    voice: str | None = None


class MoshiServiceConfigRequest(BaseModel):
    command: str = Field(default="", max_length=4000)
    args: list[str] = Field(default_factory=list)
    cwd: str | None = Field(default=None, max_length=4000)
    http_url: str = Field(default="http://127.0.0.1:8998", max_length=4000)


class DashboardSettingsBody(BaseModel):
    chat_persona: Literal["reductionist", "debugger", "explainer"] = "reductionist"
    chat_provider: Literal["auto", "ollama", "lmstudio"] = "auto"
    chat_model: str | None = None
    voice_provider: Literal["auto", "ollama", "lmstudio"] = "auto"
    voice_model: str | None = None
    refine_provider: Literal["auto", "ollama", "lmstudio"] = "auto"
    refine_model: str | None = None

    @field_validator("chat_model", "voice_model", "refine_model", mode="before")
    @classmethod
    def _empty_model_to_none(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        return str(v)


def _load_moshi_config_from_disk() -> None:
    if not _moshi_config_path.exists():
        return
    try:
        raw = _moshi_config_path.read_text(encoding="utf-8")
        payload = __import__("json").loads(raw)
        if not isinstance(payload, dict):
            return
        with _moshi_lock:
            _moshi_config.command = str(payload.get("command", "")).strip()
            args = payload.get("args", [])
            _moshi_config.args = [str(a) for a in args] if isinstance(args, list) else []
            cwd = payload.get("cwd")
            _moshi_config.cwd = str(cwd).strip() if isinstance(cwd, str) and cwd.strip() else None
            http_url = str(payload.get("http_url", "http://127.0.0.1:8998")).strip()
            _moshi_config.http_url = http_url or "http://127.0.0.1:8998"
    except Exception:
        pass


def _save_moshi_config_to_disk() -> None:
    data = {
        "command": _moshi_config.command,
        "args": _moshi_config.args,
        "cwd": _moshi_config.cwd,
        "http_url": _moshi_config.http_url,
    }
    _moshi_config_path.write_text(__import__("json").dumps(data, indent=2), encoding="utf-8")


_load_moshi_config_from_disk()


def _persist_moshi_config(command: str, args: list[str], cwd: str | None, http_url: str) -> None:
    with _moshi_lock:
        _moshi_config.command = command
        _moshi_config.args = args
        _moshi_config.cwd = cwd
        _moshi_config.http_url = http_url or "http://127.0.0.1:8998"
        _save_moshi_config_to_disk()


def _apply_moshi_discovery() -> dict[str, Any]:
    with _moshi_lock:
        command = _moshi_config.command
        args = list(_moshi_config.args)
        cwd = _moshi_config.cwd
        http_url = _moshi_config.http_url
    return apply_discovered_if_needed(
        command=command,
        args=args,
        cwd=cwd,
        http_url=http_url,
        save=_persist_moshi_config,
    )


def _moshi_status_payload() -> dict[str, Any]:
    with _moshi_lock:
        proc = _moshi_state.proc
        log_path = _moshi_state.log_path
        started_at_ms = _moshi_state.started_at_ms
        last_exit_code = _moshi_state.last_exit_code
        http_url = _moshi_config.http_url
        command = _moshi_config.command
        args = _moshi_config.args
        cwd = _moshi_config.cwd

    pid: int | None = None
    exit_code: int | None = None
    running = False
    if proc is not None:
        pid = proc.pid
        exit_code = proc.poll()
        running = exit_code is None

    return {
        "running": running,
        "pid": pid,
        "exit_code": exit_code if exit_code is not None else last_exit_code,
        "started_at_ms": started_at_ms,
        "log_path": log_path,
        "config": {
            "command": command,
            "args": args,
            "cwd": cwd,
            "http_url": http_url,
        },
    }


async def _probe_moshi_http(http_url: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(http_url, timeout=1.5)
            return {"url": http_url, "ok": resp.status_code < 500, "detail": f"HTTP {resp.status_code}"}
    except Exception as exc:
        return {"url": http_url, "ok": False, "detail": str(exc)}


def _resolve_command(command: str) -> str:
    if not command:
        raise ValueError("Moshi command is not configured. Set it in Settings → Moshi Service.")
    found = shutil.which(command)
    if found:
        return found
    p = Path(command)
    if p.exists():
        return str(p)
    raise ValueError(f"Command not found: {command}")


def _ensure_logs_dir() -> Path:
    logs_dir = Path(__file__).parent / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    return logs_dir


def _moshi_service_start_sync(*, force: bool = False) -> dict[str, Any]:
    global _moshi_last_start_attempt_ms
    _load_moshi_config_from_disk()

    with _moshi_lock:
        if _moshi_state.proc is not None and _moshi_state.proc.poll() is None:
            return {"ok": True, "already_running": True, "pid": _moshi_state.proc.pid}

    now_ms = int(time.time() * 1000)
    with _moshi_start_lock:
        if (
            not force
            and _moshi_last_start_attempt_ms
            and (now_ms - _moshi_last_start_attempt_ms) < _MOSHI_START_COOLDOWN_MS
        ):
            with _moshi_lock:
                last_exit = _moshi_state.last_exit_code
            if last_exit is not None:
                return {
                    "ok": False,
                    "skipped": True,
                    "detail": f"Recent Moshi start failed (exit {last_exit}); cooldown active. Check Status logs.",
                }
        _moshi_last_start_attempt_ms = now_ms

    with _moshi_lock:
        try:
            cmd = _resolve_command(_moshi_config.command)
        except Exception as exc:
            raise ValueError(str(exc)) from exc

        args = _moshi_config.args
        cwd = _moshi_config.cwd
        logs_dir = _ensure_logs_dir()
        log_path = logs_dir / "moshi-service.log"
        log_fh = open(log_path, "a", encoding="utf-8", errors="replace")
        started_at_ms = int(time.time() * 1000)

        env = os.environ.copy()
        env["NO_TORCH_COMPILE"] = "1"

        proc = subprocess.Popen(
            [cmd, *args],
            cwd=cwd,
            env=env,
            stdout=log_fh,
            stderr=log_fh,
            text=True,
            bufsize=1,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
        )
        _moshi_state.proc = proc
        _moshi_state.log_path = str(log_path)
        _moshi_state.started_at_ms = started_at_ms
        _moshi_state.last_exit_code = None

        return {"ok": True, "pid": proc.pid, "log_path": str(log_path)}


def _schedule_moshi_autostart() -> None:
    def _worker() -> None:
        discovery = _apply_moshi_discovery()
        if os.environ.get("KYUTAI_AUTO_START_MOSHI", "1") == "0":
            return
        validation = discovery.get("validation", {})
        if not validation.get("ready_to_start"):
            return
        try:
            _moshi_service_start_sync()
        except Exception:
            pass

    threading.Thread(target=_worker, name="kyutai-moshi-autostart", daemon=True).start()


@asynccontextmanager
async def _app_lifespan(_: FastAPI):
    _schedule_moshi_autostart()
    yield


app = FastAPI(title="kyutai-mcp-web-backend", version="0.2.0", lifespan=_app_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:10924",
        "http://127.0.0.1:10924",
        "http://localhost:10925",
        "http://127.0.0.1:10925",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "tauri://localhost",
    ],
    allow_origin_regex=r"https?://(?:[a-zA-Z0-9-]+\.ts\.net|.*?\.tail-[a-f0-9]+\.ts\.net|tauri\.localhost|localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|100\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?$|^tauri://localhost$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_dashboard_settings_from_disk() -> None:
    global _dashboard_settings
    if not _dashboard_settings_path.exists():
        return
    try:
        payload = json.loads(_dashboard_settings_path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return
        merged = dict(_DEFAULT_DASHBOARD_SETTINGS)
        for key in _DEFAULT_DASHBOARD_SETTINGS:
            if key in payload:
                merged[key] = payload[key]
        for mk in ("chat_model", "voice_model", "refine_model"):
            v = merged.get(mk)
            if isinstance(v, str) and not v.strip():
                merged[mk] = None
        _dashboard_settings = merged
    except Exception:
        pass


def _save_dashboard_settings_to_disk() -> None:
    _dashboard_settings_path.write_text(
        json.dumps(_dashboard_settings, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


_load_dashboard_settings_from_disk()

REPO_ROOT = Path(__file__).resolve().parents[2]


def _ollama_base_url() -> str:
    """HTTP base URL for the Ollama API (no path, no trailing slash).

    Reads ``OLLAMA_HOST`` like the Ollama app/CLI (``host:port`` or ``http://host:port``).
    Use this when Ollama uses a custom port, LAN IP, or WSL. If the env is set to a bind
    address ``0.0.0.0``, it is normalized to ``127.0.0.1`` for client connections.
    """
    raw = (os.environ.get("OLLAMA_HOST") or "127.0.0.1:11434").strip() or "127.0.0.1:11434"
    if "://" not in raw:
        raw = "http://" + raw
    parsed = urllib.parse.urlparse(raw)
    host = parsed.hostname or "127.0.0.1"
    if host == "0.0.0.0":
        host = "127.0.0.1"
    port = parsed.port if parsed.port is not None else 11434
    scheme = parsed.scheme if parsed.scheme else "http"
    return f"{scheme}://{host}:{port}"

MCP_CATALOG: dict[str, Any] = {
    "server": "kyutai-mcp",
    "fastmcp": "3.1+",
    "transports": {"stdio": True, "http": {"host": DEFAULT_CONFIG.mcp_http_host, "port": DEFAULT_CONFIG.mcp_http_port, "path": "/mcp"}},
    "tools": [
        {
            "name": "moshi_ops",
            "summary": "Portmanteau Kyutai Moshi operations (status, viability, references, runtime).",
            "parameters": {
                "operation": {
                    "type": "string",
                    "enum": ["status", "local_viability", "references", "recommend_runtime"],
                    "required": True,
                },
                "include_env": {"type": "boolean", "default": False},
            },
        },
        {
            "name": "voice_pipeline",
            "summary": "Voice pipeline operations: turns, briefings, Moshi service control, session history, persona proxy.",
            "parameters": {
                "operation": {
                    "type": "string",
                    "enum": [
                        "turn", "speak_boilerplate",
                        "service_status", "service_start", "service_stop",
                        "session_history",
                        "proxy_status", "proxy_start", "proxy_stop", "proxy_transcript",
                    ],
                    "required": True,
                },
                "utterance": {"type": "string", "default": ""},
                "session_id": {"type": "string", "default": "default"},
                "provider": {"type": "string", "enum": ["auto", "ollama", "lmstudio"], "default": "auto"},
                "model": {"type": "string", "required": False},
                "use_deep_reasoner": {"type": "boolean", "default": True},
                "topic": {"type": "string", "enum": ["weather", "world_news", "ai_news", "stock_market"], "default": "weather"},
                "style": {"type": "string", "enum": ["brief", "normal", "detailed"], "default": "normal"},
            },
        },
        {
            "name": "kyutai_backends",
            "summary": "Voice backend selector: Moshi, Pocket TTS, Unmute probe.",
            "parameters": {
                "operation": {
                    "type": "string",
                    "enum": [
                        "status",
                        "set_active",
                        "pocket_tts_start",
                        "pocket_tts_stop",
                        "pocket_tts_synthesize",
                        "unmute_probe",
                    ],
                    "required": True,
                },
                "active_backend": {
                    "type": "string",
                    "enum": ["moshi", "pocket_tts", "unmute"],
                    "default": "moshi",
                },
                "text": {"type": "string", "default": ""},
                "voice": {"type": "string", "required": False},
            },
        },
    ],
    "resources": [{"uri": "kyutai://about", "description": "About this MCP server"}],
    "prompts": [
        {"name": "moshi/local_run_check", "description": "Checklist for local Moshi run"},
        {"name": "voice/pipeline_guide", "description": "Voice pipeline orchestration guide for agents"},
    ],
}


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "service": "kyutai-mcp-web-backend", "time_ms": int(time.time() * 1000)}


@app.get("/api/mcp/catalog")
async def mcp_catalog() -> dict[str, Any]:
    return {"ok": True, "catalog": MCP_CATALOG}


@app.get("/api/discovery/glama")
async def discovery_glama() -> dict[str, Any]:
    path = REPO_ROOT / "glama.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="glama.json not found")
    try:
        data = __import__("json").loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"ok": True, "glama": data}


@app.get("/.well-known/mcp/manifest.json")
async def well_known_mcp_manifest() -> dict[str, Any]:
    glama_path = REPO_ROOT / "glama.json"
    glama: dict[str, Any] = {}
    if glama_path.exists():
        try:
            glama = __import__("json").loads(glama_path.read_text(encoding="utf-8"))
        except Exception:
            glama = {}
    return {
        "schema_version": "1.0",
        "name": glama.get("name", "kyutai-mcp"),
        "version": glama.get("version", "0.1.0"),
        "description": glama.get(
            "description",
            "FastMCP server and web dashboard for Kyutai Moshi operations.",
        ),
        "repository": {"type": "git", "url": glama.get("homepage", "https://github.com/sandraschi/kyutai-mcp")},
        "mcp": {
            "http_url": f"http://{DEFAULT_CONFIG.mcp_http_host}:{DEFAULT_CONFIG.mcp_http_port}/mcp",
            "transports": [
                {"type": "stdio", "command": "uv", "args": ["run", "python", "-m", "kyutai_mcp"]},
                {
                    "type": "http",
                    "url": f"http://{DEFAULT_CONFIG.mcp_http_host}:{DEFAULT_CONFIG.mcp_http_port}/mcp",
                },
            ],
        },
    }


@app.get("/api/config")
async def config() -> dict[str, Any]:
    return {
        "web_backend_port": DEFAULT_CONFIG.web_backend_port,
        "web_frontend_port": DEFAULT_CONFIG.web_frontend_port,
        "mcp_http": {
            "host": DEFAULT_CONFIG.mcp_http_host,
            "port": DEFAULT_CONFIG.mcp_http_port,
            "path": "/mcp",
        },
        "ollama": {"base_url": _ollama_base_url()},
    }


@app.get("/api/status")
async def status() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "kyutai-mcp-web-backend",
        "runtime": {"python": platform.python_version(), "platform": platform.platform()},
        "ports": {
            "backend": DEFAULT_CONFIG.web_backend_port,
            "frontend": DEFAULT_CONFIG.web_frontend_port,
            "mcp_http": DEFAULT_CONFIG.mcp_http_port,
        },
        "time_ms": int(time.time() * 1000),
    }


async def _probe_ollama(client: httpx.AsyncClient) -> GlomProbeResult:
    url = f"{_ollama_base_url()}/api/tags"
    try:
        response = await client.get(url, timeout=2.5)
        if response.status_code == 200:
            payload = response.json()
            count = len(payload.get("models", [])) if isinstance(payload, dict) else 0
            return GlomProbeResult(provider="ollama", url=url, healthy=True, details=f"HTTP 200, models={count}")
        return GlomProbeResult(provider="ollama", url=url, healthy=False, details=f"HTTP {response.status_code}")
    except Exception as exc:
        return GlomProbeResult(provider="ollama", url=url, healthy=False, details=str(exc))


async def _probe_lmstudio(client: httpx.AsyncClient) -> GlomProbeResult:
    url = "http://127.0.0.1:1234/v1/models"
    try:
        response = await client.get(url, timeout=2.5)
        if response.status_code == 200:
            payload = response.json()
            count = len(payload.get("data", [])) if isinstance(payload, dict) else 0
            return GlomProbeResult(provider="lmstudio", url=url, healthy=True, details=f"HTTP 200, models={count}")
        return GlomProbeResult(provider="lmstudio", url=url, healthy=False, details=f"HTTP {response.status_code}")
    except Exception as exc:
        return GlomProbeResult(provider="lmstudio", url=url, healthy=False, details=str(exc))


@app.get("/api/glom/status")
async def glom_status() -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        ollama = await _probe_ollama(client)
        lmstudio = await _probe_lmstudio(client)
    healthy_any = ollama.healthy or lmstudio.healthy
    preferred = "ollama" if ollama.healthy else ("lmstudio" if lmstudio.healthy else None)
    return {
        "ok": True,
        "healthy_any": healthy_any,
        "preferred_provider": preferred,
        "providers": [ollama.model_dump(), lmstudio.model_dump()],
        "recommendations": (
            ["Use provider='auto' to route to the detected provider."]
            if healthy_any
            else ["Start Ollama (11434) or LM Studio server (1234), then refresh."]
        ),
    }


@app.get("/api/moshi/service/config")
async def moshi_service_config_get() -> dict[str, Any]:
    with _moshi_lock:
        return {
            "ok": True,
            "config": {
                "command": _moshi_config.command,
                "args": _moshi_config.args,
                "cwd": _moshi_config.cwd,
                "http_url": _moshi_config.http_url,
            },
        }


@app.post("/api/moshi/service/config")
async def moshi_service_config_set(req: MoshiServiceConfigRequest) -> dict[str, Any]:
    with _moshi_lock:
        _moshi_config.command = req.command.strip()
        _moshi_config.args = [a for a in req.args if a.strip()]
        _moshi_config.cwd = (req.cwd.strip() if req.cwd else None)
        _moshi_config.http_url = req.http_url.strip() or "http://127.0.0.1:8998"
        _save_moshi_config_to_disk()
    return {"ok": True}


@app.get("/api/moshi/service/status")
async def moshi_service_status() -> dict[str, Any]:
    payload = _moshi_status_payload()
    http_probe = await _probe_moshi_http(payload["config"]["http_url"])
    validation = validate_config(
        payload["config"]["command"],
        payload["config"]["args"],
        payload["config"]["cwd"],
    )
    discovered = discover_moshi()
    online = bool(payload["running"] and http_probe.get("ok"))
    return {
        "ok": True,
        **payload,
        "http_probe": http_probe,
        "online": online,
        "validation": validation,
        "discovered_source": discovered.source if discovered else None,
    }


@app.post("/api/moshi/service/ensure")
async def moshi_service_ensure(wait_seconds: int = Query(default=0, ge=0, le=120)) -> dict[str, Any]:
    discovery = _apply_moshi_discovery()
    validation = discovery.get("validation", validate_config("", [], None))
    start_result: dict[str, Any] | None = None
    start_error: str | None = None

    if validation.get("ready_to_start"):
        try:
            start_result = _moshi_service_start_sync(force=wait_seconds > 0)
        except Exception as exc:
            start_error = str(exc)

    payload = _moshi_status_payload()
    http_probe = await _probe_moshi_http(payload["config"]["http_url"])

    if wait_seconds > 0 and payload["running"] and not http_probe.get("ok"):
        deadline = time.time() + wait_seconds
        while time.time() < deadline:
            await asyncio.sleep(2)
            http_probe = await _probe_moshi_http(payload["config"]["http_url"])
            if http_probe.get("ok"):
                break
            payload = _moshi_status_payload()
            if not payload["running"]:
                break

    online = bool(payload["running"] and http_probe.get("ok"))
    return {
        "ok": True,
        "discovery": discovery,
        "start": start_result,
        "start_error": start_error,
        **payload,
        "http_probe": http_probe,
        "online": online,
        "validation": validation,
    }


@app.post("/api/moshi/service/start")
async def moshi_service_start() -> dict[str, Any]:
    try:
        result = _moshi_service_start_sync(force=True)
        if result.get("skipped"):
            raise HTTPException(status_code=409, detail=str(result.get("detail")))
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/moshi/service/stop")
async def moshi_service_stop() -> dict[str, Any]:
    with _moshi_lock:
        proc = _moshi_state.proc
        _moshi_state.proc = None
    if proc is None:
        return {"ok": True, "stopped": False, "detail": "not running"}
    try:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()
        with _moshi_lock:
            _moshi_state.last_exit_code = proc.poll()
        return {"ok": True, "stopped": True, "exit_code": proc.poll()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/moshi/service/logs")
async def moshi_service_logs(tail: int = 200) -> dict[str, Any]:
    tail = max(1, min(2000, tail))
    with _moshi_lock:
        log_path = _moshi_state.log_path
    if not log_path:
        return {"ok": True, "lines": [], "log_path": None}
    p = Path(log_path)
    if not p.exists():
        return {"ok": True, "lines": [], "log_path": log_path}
    try:
        text = p.read_text(encoding="utf-8", errors="replace")
        return {"ok": True, "lines": text.splitlines()[-tail:], "log_path": log_path}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/backends/config")
async def backends_config_get() -> dict[str, Any]:
    return {"ok": True, "config": get_backends_config()}


@app.post("/api/backends/config")
async def backends_config_set(req: KyutaiBackendsConfigRequest) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if req.active_voice_backend is not None:
        payload["active_voice_backend"] = req.active_voice_backend
    if req.tts_on_briefing is not None:
        payload["tts_on_briefing"] = req.tts_on_briefing
    if req.pocket_tts is not None:
        payload["pocket_tts"] = req.pocket_tts
    if req.unmute is not None:
        payload["unmute"] = req.unmute
    save_backends_config(payload)
    return {"ok": True, "config": get_backends_config()}


@app.get("/api/backends/status")
async def backends_status_route() -> dict[str, Any]:
    moshi = await moshi_service_status_impl()
    status = await backends_status(include_moshi=moshi)
    return {"ok": True, **status}


@app.post("/api/backends/active")
async def backends_set_active(backend: Literal["moshi", "pocket_tts", "unmute"] = Query(...)) -> dict[str, Any]:
    result = set_active_voice_backend(backend)
    return {"ok": True, **result}


@app.post("/api/backends/pocket-tts/start")
async def pocket_tts_start_route() -> dict[str, Any]:
    cfg = get_backends_config().get("pocket_tts", {})
    try:
        result = pocket_tts_start(cfg)
        return {"ok": True, **result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/backends/pocket-tts/stop")
async def pocket_tts_stop_route() -> dict[str, Any]:
    return {"ok": True, **pocket_tts_stop()}


@app.post("/api/backends/pocket-tts/synthesize")
async def pocket_tts_synthesize_route(req: PocketTtsSynthesizeRequest) -> dict[str, Any]:
    cfg = get_backends_config().get("pocket_tts", {})
    try:
        result = await pocket_tts_synthesize(req.text, cfg, voice=req.voice)
        return {"ok": True, **result}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/backends/unmute/status")
async def unmute_status_route() -> dict[str, Any]:
    cfg = get_backends_config().get("unmute", {})
    result = await unmute_status(cfg)
    return {"ok": True, **result}


@app.get("/api/backends/tts/audio")
async def backends_tts_audio(file: str = Query(..., min_length=1, max_length=200)) -> FileResponse:
    safe = Path(file).name
    path = tts_output_dir() / safe
    if not path.exists():
        raise HTTPException(status_code=404, detail="audio not found")
    return FileResponse(path, media_type="audio/wav", filename=safe)


@app.post("/api/moshi/ops")
async def moshi_ops(req: MoshiOpsRequest) -> dict[str, Any]:
    try:
        result = await moshi_ops_impl(operation=req.operation, include_env=req.include_env)
        return {"ok": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


async def _select_provider(requested: str) -> str:
    if requested != "auto":
        return requested
    probe = await glom_status()
    preferred = probe.get("preferred_provider")
    if not preferred:
        raise HTTPException(
            status_code=503,
            detail="No local LLM provider detected. Start Ollama (11434) or LM Studio server (1234).",
        )
    return str(preferred)


async def _ollama_list_models(client: httpx.AsyncClient) -> list[str]:
    base = _ollama_base_url()
    try:
        resp = await client.get(f"{base}/api/tags", timeout=3.0)
    except httpx.ConnectError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot reach Ollama at {base} (OLLAMA_HOST). Start Ollama and try again.",
        ) from e
    resp.raise_for_status()
    payload = resp.json()
    if not isinstance(payload, dict):
        return []
    models = payload.get("models", [])
    if not isinstance(models, list):
        return []
    out: list[str] = []
    for m in models:
        if isinstance(m, dict) and isinstance(m.get("name"), str):
            out.append(m["name"])
    return out


async def _lmstudio_list_models(client: httpx.AsyncClient) -> list[str]:
    try:
        resp = await client.get("http://127.0.0.1:1234/v1/models", timeout=3.0)
    except httpx.ConnectError as e:
        raise HTTPException(
            status_code=503,
            detail="Cannot reach LM Studio at http://127.0.0.1:1234. Start the local server and try again.",
        ) from e
    resp.raise_for_status()
    payload = resp.json()
    if not isinstance(payload, dict):
        return []
    data = payload.get("data", [])
    if not isinstance(data, list):
        return []
    out: list[str] = []
    for item in data:
        if isinstance(item, dict) and isinstance(item.get("id"), str):
            out.append(item["id"])
    return out


async def _select_model(provider: str, requested: str | None) -> str:
    if requested and requested.strip():
        return requested.strip()
    async with httpx.AsyncClient() as client:
        models = await _ollama_list_models(client) if provider == "ollama" else await _lmstudio_list_models(client)
    if not models:
        raise HTTPException(
            status_code=503,
            detail=f"No models available for provider '{provider}'. Load a model, or specify a model explicitly.",
        )
    return models[0]


async def _call_ollama_chat(model: str, messages: list[dict[str, str]]) -> str:
    base = _ollama_base_url()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{base}/api/chat",
                json={"model": model, "messages": messages, "stream": False},
                timeout=60.0,
            )
            resp.raise_for_status()
            payload = resp.json()
            if isinstance(payload, dict):
                msg = payload.get("message")
                if isinstance(msg, dict) and isinstance(msg.get("content"), str):
                    return msg["content"]
    except httpx.ConnectError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot reach Ollama at {base} (OLLAMA_HOST). Start Ollama and try again.",
        ) from e
    raise HTTPException(status_code=502, detail="Unexpected Ollama response format.")


async def _call_lmstudio_chat(model: str, messages: list[dict[str, str]]) -> str:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "http://127.0.0.1:1234/v1/chat/completions",
                json={"model": model, "messages": messages, "temperature": 0.3},
                timeout=60.0,
            )
            resp.raise_for_status()
            payload = resp.json()
            if isinstance(payload, dict):
                choices = payload.get("choices")
                if isinstance(choices, list) and choices:
                    c0 = choices[0]
                    if isinstance(c0, dict):
                        msg = c0.get("message")
                        if isinstance(msg, dict) and isinstance(msg.get("content"), str):
                            return msg["content"]
    except httpx.ConnectError as e:
        raise HTTPException(
            status_code=503,
            detail="Cannot reach LM Studio at http://127.0.0.1:1234. Start the local server and try again.",
        ) from e
    raise HTTPException(status_code=502, detail="Unexpected LM Studio response format.")


async def _call_provider_chat(provider: str, model: str, messages: list[dict[str, str]]) -> str:
    if provider == "ollama":
        return await _call_ollama_chat(model, messages)
    return await _call_lmstudio_chat(model, messages)


@app.get("/api/llm/models")
async def api_llm_models(
    provider: Literal["ollama", "lmstudio"] = Query("ollama"),
) -> dict[str, Any]:
    """List model IDs from the local Ollama or LM Studio HTTP API."""
    async with httpx.AsyncClient() as client:
        models = (
            await _ollama_list_models(client) if provider == "ollama" else await _lmstudio_list_models(client)
        )
    return {"ok": True, "provider": provider, "models": models}


@app.post("/api/shutdown")
async def api_shutdown() -> dict[str, Any]:
    """Graceful self-termination."""
    import asyncio, os, logging
    logging.getLogger(__name__).warning("Server shutting down via /api/shutdown")
    async def _delayed():
        await asyncio.sleep(1)
        os._exit(0)
    asyncio.create_task(_delayed())
    return {"ok": True, "message": "Shutting down"}

@app.get("/api/dashboard/settings")
async def dashboard_settings_get() -> dict[str, Any]:
    with _settings_lock:
        return {"ok": True, "settings": dict(_dashboard_settings)}


@app.post("/api/dashboard/settings")
async def dashboard_settings_set(body: DashboardSettingsBody) -> dict[str, Any]:
    with _settings_lock:
        global _dashboard_settings
        _dashboard_settings = body.model_dump()
        _save_dashboard_settings_to_disk()
    return {"ok": True, "settings": dict(_dashboard_settings)}


def _infer_intent(utterance: str) -> str:
    text = utterance.lower()
    if "weather" in text:
        return "weather"
    if "ai news" in text or "artificial intelligence news" in text:
        return "ai_news"
    if "world news" in text or "headline" in text or "news" in text:
        return "world_news"
    if "stock" in text or "market" in text or "nasdaq" in text or "s&p" in text:
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


async def _fetch_weather(location: str) -> dict[str, Any]:
    geo_url = "https://geocoding-api.open-meteo.com/v1/search"
    async with httpx.AsyncClient() as client:
        geo = await client.get(geo_url, params={"name": location, "count": 1, "language": "en", "format": "json"}, timeout=8.0)
        geo.raise_for_status()
        payload = geo.json()
        results = payload.get("results", []) if isinstance(payload, dict) else []
        if not results:
            raise HTTPException(status_code=404, detail=f"No location match for '{location}'.")
        item = results[0]
        lat = item.get("latitude")
        lon = item.get("longitude")
        if lat is None or lon is None:
            raise HTTPException(status_code=502, detail="Weather geocoding returned no coordinates.")
        forecast = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
                "daily": "temperature_2m_max,temperature_2m_min",
                "timezone": "auto",
            },
            timeout=8.0,
        )
        forecast.raise_for_status()
        data = forecast.json()
    return {"location": item, "forecast": data}


async def _fetch_rss_headlines(url: str, max_items: int = 6) -> list[dict[str, str]]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, timeout=8.0, follow_redirects=True)
        resp.raise_for_status()
    root = ET.fromstring(resp.text)
    out: list[dict[str, str]] = []
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        if title:
            out.append({"title": title, "url": link})
        if len(out) >= max_items:
            break
    return out


async def _fetch_stock_snapshot(symbols: list[str]) -> list[dict[str, Any]]:
    """Fetch stock quotes via Finnhub (free tier, requires FINNHUB_API_KEY).

    If no key is set, returns a stub rather than hitting Yahoo Finance's
    unofficial v7 endpoint which is rate-limited and intermittently blocked.

    Free key: https://finnhub.io/register (60 req/min, no CC required)
    Set FINNHUB_API_KEY in your environment to enable this feature.
    """
    api_key = os.environ.get("FINNHUB_API_KEY", "").strip()
    if not api_key:
        return [{"error": "FINNHUB_API_KEY not set", "hint": "Get a free key at https://finnhub.io/register"}]

    normalized = [s.strip().upper() for s in symbols if s.strip()]
    if not normalized:
        normalized = ["SPY", "QQQ", "AAPL", "NVDA"]

    results: list[dict[str, Any]] = []
    async with httpx.AsyncClient() as client:
        for symbol in normalized[:5]:  # cap at 5 — free tier is 60 req/min
            try:
                r = await client.get(
                    "https://finnhub.io/api/v1/quote",
                    params={"symbol": symbol, "token": api_key},
                    timeout=5.0,
                )
                r.raise_for_status()
                q = r.json()
                results.append({
                    "symbol": symbol,
                    "price": q.get("c"),
                    "change": q.get("d"),
                    "change_percent": q.get("dp"),
                    "high": q.get("h"),
                    "low": q.get("l"),
                    "prev_close": q.get("pc"),
                })
            except Exception as e:
                results.append({"symbol": symbol, "error": str(e)})
    return results


def _workflow_prompts() -> dict[str, Any]:
    return {
        "voice_ack_prompt": (
            "You produce the immediate spoken acknowledgment in <= 18 words. "
            "Tone: calm operator assistant. No markdown. No long explanations."
        ),
        "voice_reasoner_prompt": (
            "You are the deep reasoner for a voice assistant. "
            "Use provided tool outputs only. Return concise, spoken-friendly text (2-5 sentences). "
            "If uncertainty exists, state it plainly."
        ),
        "speak_boilerplate_prompt": (
            "Convert tool data into a polished spoken briefing. Keep factual, current, and concise. "
            "Output plain text suitable for TTS."
        ),
    }


async def _agentic_speak_boilerplate(
    topic: str,
    provider: str,
    model: str,
    location: str,
    symbols: list[str],
    style: str,
) -> dict[str, Any]:
    sources: list[dict[str, Any]] = []
    gathered: dict[str, Any] = {}
    if topic == "weather":
        gathered = await _fetch_weather(location)
        sources.append({"name": "Open-Meteo", "url": "https://api.open-meteo.com/v1/forecast"})
    elif topic == "world_news":
        headlines = await _fetch_rss_headlines("https://feeds.bbci.co.uk/news/world/rss.xml", max_items=7)
        gathered = {"headlines": headlines}
        sources.append({"name": "BBC World RSS", "url": "https://feeds.bbci.co.uk/news/world/rss.xml"})
    elif topic == "ai_news":
        headlines = await _fetch_rss_headlines("https://www.artificialintelligence-news.com/feed/", max_items=7)
        gathered = {"headlines": headlines}
        sources.append({"name": "AI News RSS", "url": "https://www.artificialintelligence-news.com/feed/"})
    elif topic == "stock_market":
        snapshot = await _fetch_stock_snapshot(symbols)
        gathered = {"quotes": snapshot}
        sources.append({"name": "Yahoo Finance quote API", "url": "https://query1.finance.yahoo.com/v7/finance/quote"})
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported topic: {topic}")

    prompts = _workflow_prompts()
    system = (
        prompts["speak_boilerplate_prompt"]
        + f"\nStyle: {style}\n"
        + "End with one short line: 'Next update available on request.'"
    )
    user = (
        f"Topic: {topic}\n"
        f"Location: {location}\n"
        f"Raw data JSON:\n{__import__('json').dumps(gathered, ensure_ascii=False)}\n"
        f"Sources JSON:\n{__import__('json').dumps(sources, ensure_ascii=False)}\n"
    )
    text = await _call_provider_chat(provider, model, [{"role": "system", "content": system}, {"role": "user", "content": user}])
    spoken = text.strip()
    result: dict[str, Any] = {
        "topic": topic,
        "style": style,
        "spoken_text": spoken,
        "research_data": gathered,
        "sources": sources,
        "workflow": [
            "collect_live_sources",
            "normalize_topic_data",
            "llm_synthesize_spoken_briefing",
        ],
    }
    tts = await maybe_synthesize_briefing(spoken)
    if tts:
        result["tts"] = tts
        if not tts.get("skipped"):
            result["workflow"].append("pocket_tts_synthesize")
    return result


@app.post("/api/chat/refine")
async def chat_refine(req: ChatRefineRequest) -> dict[str, Any]:
    provider = await _select_provider(req.provider)
    model = await _select_model(provider, req.model)
    system = (
        "Refine the user's prompt.\n"
        "Make it unambiguous, actionable, and concise.\n"
        "Return ONLY the refined prompt as plain text.\n"
    )
    user = f"Persona: {req.persona}\nPrompt:\n{req.prompt.strip()}"
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    refined = await _call_ollama_chat(model, messages) if provider == "ollama" else await _call_lmstudio_chat(model, messages)
    refined = refined.replace("\r\n", "\n").strip()
    if not refined:
        raise HTTPException(status_code=502, detail="Refinement returned empty text.")
    return {"ok": True, "provider": provider, "model": model, "refined_prompt": refined}


@app.post("/api/chat/message")
async def chat_message(req: ChatMessageRequest) -> dict[str, Any]:
    provider = await _select_provider(req.provider)
    model = await _select_model(provider, req.model)
    system = (
        "You are the assistant for kyutai-mcp.\n"
        "Be direct and practical.\n"
        "When the user asks about Moshi talk/listen, tell them to configure and start the Moshi Service.\n"
    )
    user = f"Persona: {req.persona}\nUser message: {req.message.strip()}"
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    text = await _call_ollama_chat(model, messages) if provider == "ollama" else await _call_lmstudio_chat(model, messages)
    text = text.replace("\r\n", "\n").strip()
    if not text:
        raise HTTPException(status_code=502, detail="Chat returned empty text.")
    return {"ok": True, "provider": provider, "model": model, "response": text}


@app.get("/api/voice/workflows")
async def voice_workflows() -> dict[str, Any]:
    return {
        "ok": True,
        "prompts": _workflow_prompts(),
        "skills": {
            "staged_voice_response": [
                "quick_ack",
                "intent_resolution",
                "tool_research_if_needed",
                "deep_reasoner_final_answer",
                "tts_ready_output",
            ],
            "agentic_speak_boilerplate": [
                "topic_select",
                "source_fetch",
                "llm_synthesis",
            ],
        },
        "examples": [
            {
                "utterance": "hi moshi weather report please for vienna",
                "result": "intent=weather, quick_ack + weather research + spoken report",
            },
            {
                "utterance": "hi moshi world news update",
                "result": "intent=world_news, RSS research + spoken bulletin",
            },
        ],
    }


@app.post("/api/voice/speak_boilerplate")
async def speak_boilerplate(req: SpeakBoilerplateRequest) -> dict[str, Any]:
    provider = await _select_provider(req.provider)
    model = await _select_model(provider, req.model)
    result = await _agentic_speak_boilerplate(
        topic=req.topic,
        provider=provider,
        model=model,
        location=req.location,
        symbols=req.symbols,
        style=req.style,
    )
    return {"ok": True, "provider": provider, "model": model, **result}


@app.get("/api/voice/sessions")
async def voice_sessions_list() -> dict[str, Any]:
    """List all voice sessions with turn counts and last activity."""
    with _voice_session_lock:
        summary = []
        for sid, data in _voice_sessions.items():
            turns = data.get("_turns", [])
            summary.append({
                "session_id": sid,
                "turn_count": len(turns),
                "last_activity_ms": turns[-1].get("timestamp_ms") if turns else None,
            })
    return {"ok": True, "sessions": summary, "total": len(summary)}


@app.get("/api/voice/sessions/{session_id}/history")
async def voice_session_history(session_id: str) -> dict[str, Any]:
    """Return full turn history for a session."""
    with _voice_session_lock:
        data = _voice_sessions.get(session_id, {})
        turns = list(data.get("_turns", []))
    return {"ok": True, "session_id": session_id, "turn_count": len(turns), "turns": turns}


@app.post("/api/voice/turn")
async def voice_turn(req: VoiceTurnRequest) -> dict[str, Any]:  # noqa: C901
    provider = await _select_provider(req.provider)
    model = await _select_model(provider, req.model)
    deep_provider = provider if req.deep_provider == "same" else req.deep_provider
    deep_model = model if req.deep_provider == "same" and not req.deep_model else await _select_model(deep_provider, req.deep_model)

    utterance = req.utterance.strip()
    intent = _infer_intent(utterance)
    extracted_location = _extract_location(utterance)
    with _voice_session_lock:
        session = _voice_sessions.setdefault(req.session_id, {})
        remembered_location = session.get("last_location")
    chosen_location = (req.location_hint or extracted_location or remembered_location or "").strip()

    ack_messages = [
        {"role": "system", "content": _workflow_prompts()["voice_ack_prompt"]},
        {"role": "user", "content": f"Intent={intent}; User said: {utterance}"},
    ]
    try:
        quick_ack = (await _call_provider_chat(provider, model, ack_messages)).strip()
    except Exception:
        quick_ack = "Got it. Working on that now."

    if intent == "weather" and not chosen_location:
        result = {
            "ok": True,
            "intent": intent,
            "requires_clarification": True,
            "quick_ack": quick_ack,
            "response": "Sure — which city should I use for the weather report?",
            "workflow_steps": ["quick_ack", "slot_check(location)", "clarification"],
        }
        with _voice_session_lock:
            _voice_sessions.setdefault(req.session_id, {}).setdefault("_turns", []).append({
                "timestamp_ms": int(time.time() * 1000),
                "utterance": utterance,
                "intent": intent,
                "response": result["response"],
            })
        return result

    if intent in {"weather", "world_news", "ai_news", "stock_market"}:
        topic = "stock_market" if intent == "stock_market" else intent
        report = await _agentic_speak_boilerplate(
            topic=topic,
            provider=deep_provider if req.use_deep_reasoner else provider,
            model=deep_model if req.use_deep_reasoner else model,
            location=chosen_location or "Vienna",
            symbols=["SPY", "QQQ", "AAPL", "NVDA"],
            style="normal",
        )
        if topic == "weather" and chosen_location:
            with _voice_session_lock:
                _voice_sessions.setdefault(req.session_id, {})["last_location"] = chosen_location
        result = {
            "ok": True,
            "intent": intent,
            "quick_ack": quick_ack,
            "response": report["spoken_text"],
            "provider": provider,
            "model": model,
            "deep_provider": deep_provider,
            "deep_model": deep_model,
            "research_data": report["research_data"],
            "sources": report["sources"],
            "workflow_steps": [
                "quick_ack",
                "intent_resolution",
                "agentic_research",
                "deep_reasoner_synthesis",
                "tts_ready_output",
            ],
        }
        with _voice_session_lock:
            _voice_sessions.setdefault(req.session_id, {}).setdefault("_turns", []).append({
                "timestamp_ms": int(time.time() * 1000),
                "utterance": utterance,
                "intent": intent,
                "response": report["spoken_text"],
            })
        return result

    deep_system = (
        _workflow_prompts()["voice_reasoner_prompt"]
        + "\nThis is a general turn, no external tool results are attached."
    )
    deep_user = f"User utterance: {utterance}"
    response = await _call_provider_chat(
        deep_provider if req.use_deep_reasoner else provider,
        deep_model if req.use_deep_reasoner else model,
        [{"role": "system", "content": deep_system}, {"role": "user", "content": deep_user}],
    )
    result = {
        "ok": True,
        "intent": "general",
        "quick_ack": quick_ack,
        "response": response.strip(),
        "provider": provider,
        "model": model,
        "deep_provider": deep_provider,
        "deep_model": deep_model,
        "workflow_steps": ["quick_ack", "deep_reasoner_final_answer", "tts_ready_output"],
    }
    with _voice_session_lock:
        _voice_sessions.setdefault(req.session_id, {}).setdefault("_turns", []).append({
            "timestamp_ms": int(time.time() * 1000),
            "utterance": utterance,
            "intent": "general",
            "response": response.strip(),
        })
    return result

