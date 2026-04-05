<div align="center">

# kyutai-mcp

### Run **Kyutai Moshi** locally. Drive it from a **glass dashboard**, and plug the same surface into your **agent stack** via **FastMCP**.

[Quick start](#quick-start)  [Web UI](#web-dashboard)  [Technical docs](docs/)

FastMCP **3.1+**  stdio + HTTP `/mcp`  web **10924** / **10925**  MCP HTTP **10926**

</div>

---

## Why this exists

**Moshi** is Kyutais real-time speech model: listen and respond with low latency. Getting the upstream runtime, probes, and operator workflows right takes glueespecially if you also want **MCP tools** for IDEs and automation.

**kyutai-mcp** gives you:

- A **web operator console** (start/stop, status, logs, Glom-On local LLM, chat, session logger).
- A **portmanteau MCP tool** (`moshi_ops`) plus catalog-friendly HTTP discovery.
- **Glom-On**: optional **Ollama** (11434) or **LM Studio** (1234) for in-dashboard chat and prompt refinementno cloud required when local models are up.

---

## Quick start

**Prerequisites:** Python 3.12+, [uv](https://docs.astral.sh/uv/), Node 20+ (for the webapp).

```powershell
cd path\to\kyutai-mcp
uv sync
cd webapp
.\start.ps1
```

- **Dashboard:** http://127.0.0.1:10925  
- **API:** http://127.0.0.1:10924/api/health  
- **MCP HTTP:** http://127.0.0.1:10926/mcp  

Configure your **Moshi** backend under **Settings  Moshi Service**, then use **Actions** to start and **Status** or **Logger** to observe.

---

## Web dashboard

Standard pages: **Home**, **Actions**, **Tools** (ops + MCP catalog), **Apps** (Glama / manifest), **Moshi** (and `/talk`), **Status**, **Chat**, **Logger**, **Settings**, **Help**.

The in-app **Help** page is the full operator manual (routes, Glom-On, APIs, troubleshooting).

---

## MCP server (stdio)

```powershell
uv run python -m kyutai_mcp
```

Wire this in Cursor/your client as a stdio MCP server. See [docs/MCP.md](docs/MCP.md).

---

## Technical documentation

| Doc | Contents |
|-----|----------|
| [docs/WEBAPP.md](docs/WEBAPP.md) | Ports, routes, stack, build |
| [docs/MCP.md](docs/MCP.md) | Tools, transports, discovery |
| [docs/MOSHI_SERVICE.md](docs/MOSHI_SERVICE.md) | Upstream Moshi process, HTTP probe |
| [docs/GLOM.md](docs/GLOM.md) | Local LLM attach (Ollama / LM Studio) |
| [docs/VOICE_WORKFLOWS.md](docs/VOICE_WORKFLOWS.md) | Staged voice orchestration, prompts, examples, agentic boilerplates |

---

## License

See repository `LICENSE` if present; Kyutai/Moshi upstream has its own licenseconsult [Kyutai Moshi](https://github.com/kyutai-labs/moshi) for model and server terms.
