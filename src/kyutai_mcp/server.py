from __future__ import annotations

import os
import platform
import time
from typing import Any, Literal

from fastapi import FastAPI
from fastmcp import FastMCP

from kyutai_mcp.config import DEFAULT_CONFIG

mcp = FastMCP("kyutai-mcp")


@mcp.resource("kyutai://about")
async def about_resource() -> str:
    return (
        "kyutai-mcp — Fleet-standard MCP server for Kyutai Moshi ops and voice pipeline.\n"
        "Tools: moshi_ops (hardware/runtime advisory), voice_pipeline (voice turns, briefings, service control, persona proxy).\n"
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


@mcp.tool()
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

    Args:
        operation: The sub-operation to run.
        include_env: Include selected environment diagnostics (safe subset).

    Returns:
        dict with success/result plus recommendations and related operations.
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

    Args:
        operation: The sub-operation to run.
        utterance: User utterance text (required for 'turn').
        session_id: Session identifier for turn tracking / proxy transcript lookup.
        provider: LLM provider — 'auto', 'ollama', or 'lmstudio'.
        model: Specific model name, or None for auto-select.
        use_deep_reasoner: Use deeper model for final synthesis.
        deep_provider: Provider for deep reasoner — 'same', 'ollama', 'lmstudio'.
        deep_model: Specific model for deep reasoner, or None.
        location_hint: Override location for weather queries.
        topic: Topic for speak_boilerplate — 'weather', 'world_news', 'ai_news', 'stock_market'.
        symbols: Stock symbols for stock_market topic.
        style: Briefing style — 'brief', 'normal', 'detailed'.

    Returns:
        dict with operation results, workflow steps, and related operations.
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
            result = await proxy_transcript_impl(
                session_id=session_id if session_id != "default" else None
            )
        else:
            raise ValueError(f"Unknown operation: {operation}")

        return {
            "success": True,
            "result": result,
            "execution_time_ms": int((time.time() - t0) * 1000),
            "related_operations": [
                "turn", "speak_boilerplate", "service_status",
                "service_start", "service_stop", "session_history",
                "proxy_status", "proxy_start", "proxy_stop", "proxy_transcript",
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
            "tools": ["moshi_ops", "voice_pipeline"],
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
                    env[k] = ("[REDACTED]" if "TOKEN" in k else os.environ[k])

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


def build_http_app() -> FastAPI:
    app = FastAPI(title="kyutai-mcp", version="0.2.0")

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {"ok": True, "service": "kyutai-mcp", "tools": ["moshi_ops", "voice_pipeline"]}

    return app


def run() -> None:
    mcp_http_host = DEFAULT_CONFIG.mcp_http_host
    mcp_http_port = DEFAULT_CONFIG.mcp_http_port

    # Dual transport:
    # - STDIO for IDE integration
    # - HTTP (streamable) for the webapp backend bridge
    http_app = build_http_app()
    mcp.run(
        transport="stdio",
        http_app=http_app,
        http_host=mcp_http_host,
        http_port=mcp_http_port,
        http_path="/mcp",
    )

