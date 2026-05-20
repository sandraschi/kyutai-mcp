[![FastMCP Version](https://img.shields.io/badge/FastMCP-3.1+-blue?style=flat-square&logo=python&logoColor=white)](https://github.com/sandraschi/fastmcp) [![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff) [![Linted with Biome](https://img.shields.io/badge/Linted_with-Biome-60a5fa?style=flat-square&logo=biome&logoColor=white)](https://biomejs.dev/) [![Built with Just](https://img.shields.io/badge/Built_with-Just-000000?style=flat-square&logo=gnu-bash&logoColor=white)](https://github.com/casey/just)

<div align="center">

# kyutai-mcp

<p align="center">
  <a href="https://github.com/casey/just"><img src="https://img.shields.io/badge/just-ready_to_go-7c5cfc?style=flat-square&logo=just&logoColor=white" alt="Just"></a>
  <a href="https://github.com/astral-sh/ruff"><img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json" alt="Ruff"></a>
  <a href="https://python.org"><img src="https://img.shields.io/badge/Python-3.13+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python"></a>
  <a href="https://biomejs.dev"><img src="https://img.shields.io/badge/Linted_with-Biome-60a5fa?style=flat-square&logo=biome&logoColor=white" alt="Biome"></a>
  <a href="https://github.com/PrefectHQ/fastmcp"><img src="https://img.shields.io/badge/FastMCP-3.2-7c5cfc?style=flat-square" alt="FastMCP"></a>
</p>


> 📖 **[Installation Guide](INSTALL.md)** — quick start, manual setup, and troubleshooting

### Run **Kyutai Moshi** locally. Drive it from a **glass dashboard**, and plug the same surface into your **agent stack** via **FastMCP**.

[Quick start](#quick-start)  [Web UI](#web-dashboard)  [Technical docs](docs/)

FastMCP **3.1+**  stdio + HTTP `/mcp`  web **10924** / **10925**  MCP HTTP **10926**

</div>

---

## Quick Start

```powershell
git clone https://github.com/sandraschi/kyutai-mcp
cd kyutai-mcp
just
```

This opens an interactive dashboard showing all available commands. Run `just bootstrap` to install dependencies, then `just serve` or `just dev` to start.

### Manual Setup

If you don't have `just` installed:

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


## Related: speech-mcp (cloud voice)

**[speech-mcp](https://github.com/sandraschi/speech-mcp)** is the cloud counterpart to this project. Where kyutai-mcp runs Moshi locally on your GPU, speech-mcp connects to cloud speech APIs.

| | kyutai-mcp (this repo) | speech-mcp |
|---|---|---|
| Engine | Moshi (Kyutai, open-source) | Gemini Live, Gemini TTS, Hume, ElevenLabs |
| Runs on | Local GPU (RTX 4090, CUDA) | Cloud APIs |
| Privacy | Fully offline | Cloud |
| Latency | Low (local) | Sub-second (Gemini Live) |
| Voice quality | Good | Very good to highest |
| Voice cloning | No | Yes (ElevenLabs IVC) |
| Multilingual | Limited | 100+ languages (Gemini TTS) |
| Cost | Free after hardware | API usage costs |

Use kyutai-mcp when privacy or offline operation matters. Use speech-mcp when voice quality, multilingual coverage, or voice cloning is the priority. Both expose the same portmanteau MCP tool pattern and can be run simultaneously on different ports.

---



This project adheres to **SOTA 14.1** industrial standards for high-fidelity agentic orchestration:

- **Python (Core)**: [Ruff](https://astral.sh/ruff) for linting and formatting. Zero-tolerance for `print` statements in core handlers (`T201`).
- **Webapp (UI)**: [Biome](https://biomejs.dev/) for sub-millisecond linting. Strict `noConsoleLog` enforcement.
- **Protocol Compliance**: Hardened `stdout/stderr` isolation to ensure crash-resistant JSON-RPC communication.
- **Automation**: [Justfile](./justfile) recipes for all fleet operations (`just lint`, `just fix`, `just dev`).
- **Security**: Automated audits via `bandit` and `safety`.

## License

See repository `LICENSE` if present; Kyutai/Moshi upstream has its own licenseconsult [Kyutai Moshi](https://github.com/kyutai-labs/moshi) for model and server terms.
