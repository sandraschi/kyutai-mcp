from __future__ import annotations

import os
import platform
import time
from typing import Any, Literal

from fastapi import FastAPI
from fastmcp import FastMCP

from kyutai_mcp.config import DEFAULT_CONFIG
from kyutai_mcp.tools.moshi import moshi_ops

mcp = FastMCP("kyutai-mcp")


@mcp.resource("kyutai://about")
async def about_resource() -> str:
    return (
        "kyutai-mcp — Fleet-standard MCP server for Kyutai Moshi ops.\n"
        "Tools are portmanteau-style to keep the surface stable.\n"
    )


@mcp.prompt("moshi/local_run_check")
async def prompt_local_run_check() -> str:
    return (
        "You are helping a developer run Kyutai Moshi locally on an RTX 4090 (24GB).\n"
        "Provide a minimal checklist for Rust/CUDA quantized path first, then PyTorch.\n"
        "Call the tool `moshi_ops` with operation='local_viability' to gather GPU/system facts.\n"
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
    app = FastAPI(title="kyutai-mcp", version="0.1.0")

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {"ok": True, "service": "kyutai-mcp"}

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

