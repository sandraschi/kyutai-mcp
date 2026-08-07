from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class KyutaiConfig:
    web_backend_port: int = 10924
    web_frontend_port: int = 10925
    mcp_http_host: str = "127.0.0.1"
    mcp_http_port: int = 10926
    pocket_tts_port: int = 10929
    unmute_ui_url: str = "http://127.0.0.1:3000"
    unmute_backend_url: str = "http://127.0.0.1:8000"


DEFAULT_CONFIG = KyutaiConfig()
