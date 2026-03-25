from __future__ import annotations

from typing import Any


async def moshi_ops(operation: str, include_env: bool) -> dict[str, Any]:
    # Placeholder for future deep integration (Rust backend control, model downloads, etc.)
    # For now, tool logic lives in kyutai_mcp.server.moshi_ops_impl
    return {"operation": operation, "include_env": include_env}

