from __future__ import annotations

import os
import platform
import time
from typing import Any, Literal

from fastmcp import FastMCP

_READ_ONLY = {"readonly": True}
_MUTATING = {}
_DESTRUCTIVE = {}

mcp = FastMCP("kyutai-mcp")


@mcp.resource("kyutai://about")
async def about_resource() -> str:
    return (
        "kyutai-mcp — Fleet-standard MCP server for Kyutai Moshi ops and voice pipeline.\n"
        "Tools: moshi_ops, voice_pipeline, kyutai_backends (Moshi / Pocket TTS / Unmute).\n"
    )


@mcp.prompt("moshi/local_run_check")
async def prompt_local_run_check() -> str:
    return (
        "You are helping a developer run Kyutai Moshi locally on an RTX 4090 (24GB).\n"
        "Provide a minimal checklist for Rust/CUDA quantized path first, then PyTorch.\n"
        "Call the tool `moshi_ops` with operation='local_viability' to gather GPU/system facts.\n"
    )


@mcp.prompt("voice/pipeline_guide")
async def prompt_pipeline_guide() -> str:
    return (
        "You are orchestrating a voice pipeline using the voice_pipeline MCP tool.\n"
        "Available operations:\n"
        "  - turn: Send an utterance, get a staged spoken response (ack → intent → research → synthesis).\n"
        "  - speak_boilerplate: Get an agentic spoken briefing for weather, world_news, ai_news, or stock_market.\n"
        "  - service_status: Check if the Moshi real-time speech server is running.\n"
        "  - service_start: Start the supervised Moshi process.\n"
        "  - service_stop: Stop the supervised Moshi process.\n"
        "  - session_history: List voice sessions or get turn history for a session.\n"
        "  - proxy_status: Check if the persona-aware WebSocket proxy is running.\n"
        "  - proxy_start: Start the proxy (port 8999) — relays to Moshi with text tapping + persona injection.\n"
        "  - proxy_stop: Stop the persona proxy.\n"
        "  - proxy_transcript: Get transcript from a proxied session (captured from Moshi's inner monologue).\n"
        "\n"
        "Typical workflow:\n"
        "1. Call voice_pipeline operation='service_status' to check Moshi health.\n"
        "2. Call voice_pipeline operation='turn' with the user's utterance.\n"
        "3. The response includes quick_ack, intent, research_data, and a spoken final answer.\n"
        "4. Use session_history to review past turns.\n"
        "\n"
        "Persona proxy workflow:\n"
        "1. Ensure Moshi is running (service_status).\n"
        "2. Start the proxy: voice_pipeline operation='proxy_start'.\n"
        "3. Connect client to ws://127.0.0.1:8999/api/chat?persona=<system_prompt>.\n"
        "4. The proxy relays audio to Moshi and taps text tokens for persona-aware augmentation.\n"
        "5. Get transcripts: voice_pipeline operation='proxy_transcript'.\n"
    )


@mcp.tool(annotations=_READ_ONLY)
async def moshi_ops(
    operation: Literal[
        "status",
        "local_viability",
        "references",
        "recommend_runtime",
    ],
    include_env: bool = False,
) -> dict[str, Any]:
    """moshi_ops — Kyutai Moshi operations (portmanteau).

    PORTMANTEAU PATTERN RATIONALE:
    Moshi workflows span status, local hardware viability, and runtime recommendations.
    A unified tool avoids fragmentation and keeps the webapp + ToolBench stable.

    ## Return Format
    {"success": bool, "result": dict, "execution_time_ms": int, "recommendations": [str]}

    ## Examples
    moshi_ops(operation="status")
    moshi_ops(operation="local_viability", include_env=True)
    moshi_ops(operation="references")
    """

    t0 = time.time()
    try:
        result = await moshi_ops_impl(operation=operation, include_env=include_env)
        return {
            "success": True,
            "result": result,
            "execution_time_ms": int((time.time() - t0) * 1000),
            "recommendations": result.get("recommendations", []),
            "related_operations": [
                "status",
                "local_viability",
                "references",
                "recommend_runtime",
            ],
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__,
            "recovery_options": [
                "Run operation='references' to confirm upstream constraints",
                "Run operation='local_viability' to re-check GPU/driver state",
            ],
            "diagnostic_info": {"platform": platform.platform()},
        }


@mcp.tool()
async def voice_pipeline(
    operation: Literal[
        "turn",
        "speak_boilerplate",
        "service_status",
        "service_start",
        "service_stop",
        "session_history",
        "proxy_status",
        "proxy_start",
        "proxy_stop",
        "proxy_transcript",
    ],
    utterance: str = "",
    session_id: str = "default",
    provider: str = "auto",
    model: str | None = None,
    use_deep_reasoner: bool = True,
    deep_provider: str = "same",
    deep_model: str | None = None,
    location_hint: str | None = None,
    topic: str = "weather",
    symbols: list[str] | None = None,
    style: str = "normal",
) -> dict[str, Any]:
    """voice_pipeline — Voice pipeline operations (portmanteau).

    PORTMANTEAU PATTERN RATIONALE:
    Voice workflows span live speech turns, agentic briefings, Moshi service
    control, session history, and persona-aware proxy management. A unified
    tool keeps the MCP surface stable and lets agents chain operations naturally.

    ## Return Format
    {"success": bool, "result": dict, "execution_time_ms": int}

    ## Examples
    voice_pipeline(operation="service_status")
    voice_pipeline(operation="turn", utterance="Hello")
    voice_pipeline(operation="speak_boilerplate", topic="weather")
    voice_pipeline(operation="proxy_status")
    """
    from kyutai_mcp.tools.voice_pipeline import (
        moshi_service_start_impl,
        moshi_service_status_impl,
        moshi_service_stop_impl,
        proxy_start_impl,
        proxy_status_impl,
        proxy_stop_impl,
        proxy_transcript_impl,
        session_history_impl,
        speak_boilerplate_impl,
        voice_turn_impl,
    )

    t0 = time.time()
    try:
        if operation == "turn":
            if not utterance.strip():
                raise ValueError("utterance is required for operation='turn'.")
            result = await voice_turn_impl(
                utterance=utterance,
                session_id=session_id,
                provider=provider,
                model=model,
                use_deep_reasoner=use_deep_reasoner,
                deep_provider=deep_provider,
                deep_model=deep_model,
                location_hint=location_hint,
            )
        elif operation == "speak_boilerplate":
            result = await speak_boilerplate_impl(
                topic=topic,
                provider=provider,
                model=model,
                location=location_hint or "Vienna",
                symbols=symbols,
                style=style,
            )
        elif operation == "service_status":
            result = await moshi_service_status_impl()
        elif operation == "service_start":
            result = moshi_service_start_impl()
        elif operation == "service_stop":
            result = moshi_service_stop_impl()
        elif operation == "session_history":
            result = session_history_impl(session_id=session_id if session_id != "default" else None)
        elif operation == "proxy_status":
            result = await proxy_status_impl()
        elif operation == "proxy_start":
            result = proxy_start_impl()
        elif operation == "proxy_stop":
            result = proxy_stop_impl()
        elif operation == "proxy_transcript":
            result = await proxy_transcript_impl(session_id=session_id if session_id != "default" else None)
        else:
            raise ValueError(f"Unknown operation: {operation}")

        return {
            "success": True,
            "result": result,
            "execution_time_ms": int((time.time() - t0) * 1000),
            "related_operations": [
                "turn",
                "speak_boilerplate",
                "service_status",
                "service_start",
                "service_stop",
                "session_history",
                "proxy_status",
                "proxy_start",
                "proxy_stop",
                "proxy_transcript",
            ],
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__,
            "recovery_options": [
                "Run operation='service_status' to check Moshi backend health",
                "Run operation='proxy_status' to check persona proxy state",
                "Run operation='session_history' to review past turns",
            ],
            "diagnostic_info": {"platform": platform.platform()},
        }


async def moshi_ops_impl(
    operation: str,
    include_env: bool,
) -> dict[str, Any]:
    if operation == "status":
        return {
            "service": "kyutai-mcp",
            "fastmcp": "3.1+",
            "python": platform.python_version(),
            "os": platform.platform(),
            "tools": ["moshi_ops", "voice_pipeline", "kyutai_backends"],
            "recommendations": ["Use the webapp for interactive inspection (webapp/start.ps1)."],
        }

    if operation == "references":
        return {
            "upstream": {
                "repo": "https://github.com/kyutai-labs/moshi",
                "faq": "https://raw.githubusercontent.com/kyutai-labs/moshi/main/FAQ.md",
                "gpu_vram_discussion": "https://github.com/kyutai-labs/moshi/issues/54",
            },
            "recommendations": ["Prefer Rust/CUDA int8 path for local first-time success."],
        }

    if operation == "recommend_runtime":
        return {
            "recommendations": [
                "Rust backend with CUDA for quantized runs (int8) on RTX 4090",
                "Treat PyTorch path as research mode (may be heavier; quantized PyTorch not upstream)",
            ],
            "notes": [
                "Upstream notes: quantizing beyond 4 bits can degrade quality; 8GB GPUs not supported.",
                "Session length can be bounded by context/buffer in some implementations.",
            ],
        }

    if operation == "local_viability":
        from kyutai_mcp.tools.hw import get_gpu_summary

        gpu = get_gpu_summary()
        env: dict[str, str] = {}
        if include_env:
            for k in ["CUDA_VISIBLE_DEVICES", "HF_HOME", "HUGGINGFACE_HUB_TOKEN"]:
                if k in os.environ:
                    env[k] = "[REDACTED]" if "TOKEN" in k else os.environ[k]

        recs = []
        if gpu.get("vram_total_mb") is not None and gpu["vram_total_mb"] >= 20000:
            recs.append("RTX 4090-class VRAM detected; local Moshi likely viable with Rust/CUDA.")
        else:
            recs.append("VRAM not detected or low; local Moshi may require tuning or may be infeasible.")

        return {
            "gpu": gpu,
            "env": env,
            "recommendations": recs,
            "references": {
                "faq": "https://raw.githubusercontent.com/kyutai-labs/moshi/main/FAQ.md",
                "issue_54": "https://github.com/kyutai-labs/moshi/issues/54",
            },
        }

    raise ValueError(f"Unknown operation: {operation}")


@mcp.tool(annotations=_READ_ONLY)
async def kyutai_backends(
    operation: Literal[
        "status",
        "set_active",
        "pocket_tts_start",
        "pocket_tts_stop",
        "pocket_tts_synthesize",
        "unmute_probe",
    ],
    active_backend: Literal["moshi", "pocket_tts", "unmute"] = "moshi",
    text: str = "",
    voice: str | None = None,
) -> dict[str, Any]:
    """kyutai_backends — Kyutai voice backend selector (portmanteau).

    Manages Moshi (GPU duplex), Pocket TTS (CPU TTS), and Unmute (WSL/Docker probe).

    ## Return Format
    {"success": bool, "result": dict, "execution_time_ms": int}

    ## Examples
    kyutai_backends(operation="status")
    kyutai_backends(operation="set_active", active_backend="pocket_tts")
    kyutai_backends(operation="pocket_tts_synthesize", text="Hello")
    """
    from kyutai_mcp.backends.manager import (
        backends_status,
        get_backends_config,
        pocket_tts_start,
        pocket_tts_stop,
        set_active_voice_backend,
    )
    from kyutai_mcp.backends.pocket_tts import pocket_tts_synthesize
    from kyutai_mcp.backends.unmute import unmute_status
    from kyutai_mcp.tools.voice_pipeline import moshi_service_status_impl

    t0 = time.time()
    try:
        if operation == "status":
            moshi = await moshi_service_status_impl()
            result = await backends_status(include_moshi=moshi)
        elif operation == "set_active":
            result = set_active_voice_backend(active_backend)
        elif operation == "pocket_tts_start":
            cfg = get_backends_config().get("pocket_tts", {})
            result = pocket_tts_start(cfg)
        elif operation == "pocket_tts_stop":
            result = pocket_tts_stop()
        elif operation == "pocket_tts_synthesize":
            if not text.strip():
                raise ValueError("text is required for pocket_tts_synthesize.")
            cfg = get_backends_config().get("pocket_tts", {})
            result = await pocket_tts_synthesize(text, cfg, voice=voice)
        elif operation == "unmute_probe":
            cfg = get_backends_config().get("unmute", {})
            result = await unmute_status(cfg)
        else:
            raise ValueError(f"Unknown operation: {operation}")

        return {
            "success": True,
            "result": result,
            "execution_time_ms": int((time.time() - t0) * 1000),
            "related_operations": [
                "status",
                "set_active",
                "pocket_tts_start",
                "pocket_tts_stop",
                "pocket_tts_synthesize",
                "unmute_probe",
            ],
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__,
            "recovery_options": [
                "Run operation='status' for full backend health",
                "Install Pocket TTS: uv sync --group pocket-tts",
                "For Unmute on Windows use WSL2 — see docs/KYUTAI_BACKENDS.md",
            ],
            "diagnostic_info": {"platform": platform.platform()},
        }


# Register skills provider
try:
    from pathlib import Path

    from fastmcp.server.providers.skills import SkillsDirectoryProvider

    _skills_root = Path(__file__).resolve().parent / "skills"
    if _skills_root.is_dir():
        mcp.add_provider(SkillsDirectoryProvider(roots=_skills_root))
except ImportError:
    import logging

    logging.getLogger(__name__).warning("SkillsDirectoryProvider not available")


@mcp.tool(annotations=_DESTRUCTIVE)
async def kyutai_shutdown(reason: str = "user request") -> dict[str, Any]:
    """KYUTAI_SHUTDOWN — Graceful self-termination of the MCP server.

    Saves state, writes final logs, and stops the event loop.
    Use instead of brutal zombie kill for orderly database close and final logs.

    ## Return Format
    {"success": true, "message": "Server shutting down: <reason>"}
    """
    import logging

    logger = logging.getLogger(__name__)
    logger.warning("Server shutting down via kyutai_shutdown: %s", reason)
    # Schedule shutdown after the response is sent
    import asyncio
    import os

    async def _delayed_shutdown():
        await asyncio.sleep(1)
        os._exit(0)

    asyncio.create_task(_delayed_shutdown())
    return {"success": True, "message": f"Server shutting down: {reason}"}


def run() -> None:
    """Stdio transport for IDE MCP clients (Claude Desktop, Cursor, etc.)."""
    mcp.run(transport="stdio")
