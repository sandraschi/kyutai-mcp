# Glom-On (local LLM)

**Glom-On** is the optional attachment of **local** chat APIs so the dashboard can refine prompts and answer in **Chat** without a cloud key—when a provider is reachable.

## Providers (auto-discovery)

The backend probes:

| Provider | Default probe URL | Condition |
|----------|-------------------|-----------|
| **Ollama** | `http://127.0.0.1:11434/api/tags` | HTTP 200, non-empty `models` list |
| **LM Studio** | `http://127.0.0.1:1234/v1/models` | HTTP 200, `data` array |

**Endpoint:** `GET /api/glom/status`

Response includes `healthy_any`, `preferred_provider` (`ollama` if healthy, else `lmstudio` if healthy), and per-provider `details`.

## Routing

Chat and refine requests accept `provider`: `auto` | `ollama` | `lmstudio`.

- **`auto`** picks Ollama if healthy, otherwise LM Studio if healthy; otherwise the API returns an error explaining nothing is up.

## Usage in the app

- **Status** page shows provider rows and recommendations.
- **Chat** page sends messages to the backend, which forwards to the OpenAI-compatible chat API of the selected stack.
- **Chat modal (Ctrl+K)** uses **Refine** with `provider: auto` by default.

## Operational tips

1. Start **Ollama** or open **LM Studio** and enable the local server **before** using Chat.
2. If both run, **Ollama wins** `preferred_provider` when healthy.
3. Model selection may be automatic from the first listed model; see backend `_select_model` in `webapp/backend/app.py` for exact behavior.
