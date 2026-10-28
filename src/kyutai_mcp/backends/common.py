"""Shared paths for TTS voice backends.

``tts_output_dir`` is where synthesized briefing audio (WAV) is stored before
the dashboard serves it at ``GET /api/backends/tts/audio?file=...``. The
directory is created on first use. Override with ``KYUTAI_TTS_OUTPUT_DIR``.
"""

from __future__ import annotations

import os
from pathlib import Path


def tts_output_dir() -> Path:
    """Return the TTS audio output directory, creating it if needed."""
    override = os.environ.get("KYUTAI_TTS_OUTPUT_DIR", "").strip()
    directory = Path(override) if override else Path.home() / ".kyutai-mcp" / "tts-output"
    directory.mkdir(parents=True, exist_ok=True)
    return directory
