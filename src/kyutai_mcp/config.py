from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class KyutaiConfig:
    web_backend_port: int = 10924
    web_frontend_port: int = 10925
    mcp_http_host: str = "127.0.0.1"
    mcp_http_port: int = 10926


DEFAULT_CONFIG = KyutaiConfig()

