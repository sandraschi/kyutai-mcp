"""Moshi service discovery and configuration validation.

The dashboard lets the user point at a Moshi binary/server (command + args +
working directory + HTTP URL). This module finds a usable Moshi installation
when nothing is configured and validates a candidate configuration before
the dashboard tries to start it. Probes are live (``shutil.which``,
filesystem checks, HTTP); nothing is hardcoded as present.
"""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable


@dataclass
class MoshiDiscovery:
    """A discovered Moshi installation candidate."""

    source: str | None
    command: str = ""
    args: list[str] = field(default_factory=list)
    cwd: str | None = None
    http_url: str = "http://127.0.0.1:8998"


_CANDIDATE_COMMANDS = ("moshi", "moshi-server", "moshi_moshi")

_CANDIDATE_PATHS = (
    Path.home() / ".cargo" / "bin" / "moshi",
    Path.home() / ".cargo" / "bin" / "moshi-server",
    Path("/usr/local/bin/moshi"),
    Path("/usr/local/bin/moshi-server"),
)


def discover_moshi() -> MoshiDiscovery | None:
    """Look for a Moshi binary/server without starting anything.

    Returns a ``MoshiDiscovery`` (with ``source`` describing where it came
    from) or ``None`` when nothing is found.
    """
    env_command = os.environ.get("MOSHI_COMMAND", "").strip()
    if env_command:
        resolved = shutil.which(env_command) or (str(Path(env_command)) if Path(env_command).exists() else None)
        if resolved:
            return MoshiDiscovery(source="env:MOSHI_COMMAND", command=resolved)
    for name in _CANDIDATE_COMMANDS:
        resolved = shutil.which(name)
        if resolved:
            return MoshiDiscovery(source=f"PATH:{name}", command=resolved)
    for candidate in _CANDIDATE_PATHS:
        if candidate.exists():
            return MoshiDiscovery(source=f"path:{candidate}", command=str(candidate))
    return None


def validate_config(
    command: str,
    args: list[str] | None,
    cwd: str | None,
) -> dict[str, Any]:
    """Validate a Moshi service configuration without starting it."""
    issues: list[str] = []
    resolved: str | None = None
    cleaned_command = (command or "").strip()
    if not cleaned_command:
        issues.append("Moshi command is not configured. Set it in Settings (Moshi Service).")
    else:
        resolved = shutil.which(cleaned_command)
        if not resolved:
            candidate = Path(cleaned_command)
            if candidate.exists():
                resolved = str(candidate)
        if not resolved:
            issues.append(f"Command not found: {cleaned_command!r}.")

    cleaned_cwd = (cwd or "").strip() or None
    if cleaned_cwd and not Path(cleaned_cwd).is_dir():
        issues.append(f"Working directory does not exist: {cleaned_cwd!r}.")

    return {
        "ready_to_start": not issues,
        "command": cleaned_command,
        "resolved": resolved,
        "args": [str(a) for a in (args or []) if str(a).strip()],
        "cwd": cleaned_cwd,
        "issues": issues,
    }


def apply_discovered_if_needed(
    command: str,
    args: list[str] | None,
    cwd: str | None,
    http_url: str,
    save: Callable[[str, list[str], str | None, str], None],
) -> dict[str, Any]:
    """Fill an empty command from discovery and persist it via ``save``.

    Returns ``{"discovery", "validation", "applied"}``. Never overwrites an
    explicitly configured command.
    """
    cleaned = (command or "").strip()
    if cleaned:
        validation = validate_config(cleaned, args, cwd)
        return {"discovery": None, "validation": validation, "applied": False}

    discovered = discover_moshi()
    if discovered is None:
        validation = validate_config("", args, cwd)
        return {"discovery": None, "validation": validation, "applied": False}

    final_args = [str(a) for a in (args or discovered.args) if str(a).strip()]
    save(discovered.command, final_args, cwd, http_url or discovered.http_url)
    validation = validate_config(discovered.command, final_args, cwd)
    return {
        "discovery": {
            "source": discovered.source,
            "command": discovered.command,
            "args": final_args,
            "http_url": http_url or discovered.http_url,
        },
        "validation": validation,
        "applied": True,
    }
