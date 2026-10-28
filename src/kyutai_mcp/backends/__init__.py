"""Voice TTS backend adapters for kyutai-mcp.

The web dashboard (``webapp/backend/app.py``) manages three voice backends --
``moshi`` (local Moshi service, managed by the dashboard itself),
``pocket_tts`` (external Pocket TTS process / HTTP endpoint) and ``unmute``
(external Unmute UI + backend). This package holds the process lifecycle,
configuration persistence and availability probing for the latter two, plus
the shared TTS audio output directory.

All availability answers are live probes, never hardcoded: a backend reports
``available: True`` only when its process answers or its HTTP endpoint
responds. Unconfigured backends report honestly instead of pretending.
"""

from __future__ import annotations
