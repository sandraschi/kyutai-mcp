"""
persona.py — Persona-aware reasoner callback for the Moshi proxy.

Plugs into moshi_proxy.set_persona_callback() to process intercepted
Moshi text segments through a local LLM with persona/system prompt injection.

The reasoner uses the same Glom-On LLM discovery as the rest of kyutai-mcp:
  1. Probes Ollama (11434) and LM Studio (1234)
  2. Picks the best available model
  3. Sends the Moshi transcript segment + persona system prompt
  4. Returns augmented text for injection back to the client

This is the module that closes Gap #5: persona control over Moshi conversations.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger("kyutai_mcp.proxy.persona")

# ---------------------------------------------------------------------------
# LLM provider discovery (reuse Glom-On pattern)
# ---------------------------------------------------------------------------

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
LMSTUDIO_URL = os.environ.get("LMSTUDIO_URL", "http://127.0.0.1:1234")

_TIMEOUT = httpx.Timeout(connect=3.0, read=30.0, write=5.0, pool=3.0)


async def _find_provider() -> tuple[str, str, str] | None:
    """Probe Ollama / LM Studio and return (provider, base_url, model_name) or None."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(3.0)) as client:
        # Try Ollama first
        try:
            r = await client.get(f"{OLLAMA_URL}/api/tags")
            if r.status_code == 200:
                models = r.json().get("models", [])
                if models:
                    # Prefer smaller conversational models for speed
                    preferred = ["gemma3:4b", "phi4-mini", "llama3.2:3b", "mistral:7b"]
                    name = models[0].get("name", models[0].get("model", ""))
                    for pref in preferred:
                        for m in models:
                            n = m.get("name", m.get("model", ""))
                            if pref in n.lower():
                                name = n
                                break
                    return ("ollama", OLLAMA_URL, name)
        except Exception:
            pass

        # Try LM Studio
        try:
            r = await client.get(f"{LMSTUDIO_URL}/v1/models")
            if r.status_code == 200:
                models = r.json().get("data", [])
                if models:
                    return ("lmstudio", LMSTUDIO_URL, models[0]["id"])
        except Exception:
            pass

    return None


# ---------------------------------------------------------------------------
# Persona callback
# ---------------------------------------------------------------------------

DEFAULT_PERSONA = """You are a helpful, warm assistant with a dry Viennese wit.
You are augmenting a real-time voice conversation happening through the Moshi speech model.
You receive transcript segments from Moshi and can inject brief, contextually relevant
annotations, corrections, or persona-flavored responses.

Rules:
- Keep responses VERY short (1-2 sentences max) — this is real-time
- Only respond when you have something genuinely useful to add
- If the transcript segment is just filler/noise, respond with exactly: SKIP
- Match the conversational energy — don't be overly formal
"""

# Rate limiting — don't flood the conversation
_last_persona_call = 0.0
_MIN_INTERVAL_SECONDS = 5.0


async def persona_reasoner(
    moshi_segment: str, session: Any
) -> str | None:
    """Process a Moshi text segment through the persona-aware LLM.

    Returns augmented text to inject, or None to skip.
    """
    import time

    global _last_persona_call

    # Rate limit
    now = time.time()
    if now - _last_persona_call < _MIN_INTERVAL_SECONDS:
        return None
    _last_persona_call = now

    # Skip very short segments (noise)
    if len(moshi_segment.strip()) < 10:
        return None

    provider_info = await _find_provider()
    if not provider_info:
        logger.debug("No LLM provider available for persona augmentation")
        return None

    provider, base_url, model_name = provider_info
    system_prompt = session.persona_system_prompt or DEFAULT_PERSONA

    # Build conversation context from recent transcript
    context_segments = session.transcript_segments[-5:]  # last 5 segments
    messages = [{"role": "system", "content": system_prompt}]
    for seg in context_segments:
        role = "assistant" if seg["speaker"] == "persona" else "user"
        messages.append({"role": role, "content": seg["text"]})
    messages.append({"role": "user", "content": f"[Moshi said]: {moshi_segment}"})

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            if provider == "ollama":
                r = await client.post(
                    f"{base_url}/api/chat",
                    json={
                        "model": model_name,
                        "messages": messages,
                        "stream": False,
                        "options": {"temperature": 0.7, "num_predict": 60},
                    },
                )
                r.raise_for_status()
                reply = r.json().get("message", {}).get("content", "").strip()
            else:
                # LM Studio (OpenAI-compatible)
                r = await client.post(
                    f"{base_url}/v1/chat/completions",
                    json={
                        "model": model_name,
                        "messages": messages,
                        "temperature": 0.7,
                        "max_tokens": 60,
                    },
                )
                r.raise_for_status()
                reply = (
                    r.json()
                    .get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                    .strip()
                )

        # If LLM says SKIP, don't inject
        if not reply or reply.upper() == "SKIP":
            return None

        logger.info("Persona injection: %s", reply[:80])
        return reply

    except Exception as exc:
        logger.warning("Persona reasoner failed: %s", exc)
        return None
