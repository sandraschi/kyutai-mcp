# Moshi service (upstream)

The dashboard does **not** embed the full Moshi training/inference stack. It **supervises a process** you configure: typically the upstream **moshi** Python or Rust server from [kyutai-labs/moshi](https://github.com/kyutai-labs/moshi).

## Configuration

In **Settings → Moshi Service** (persisted to `webapp/backend/moshi-service-config.json`):

- **command** — Executable path (e.g. `D:\...\moshi\.venv\Scripts\python.exe`).
- **args** — e.g. `-m`, `moshi.server`, `--hf-repo`, `kyutai/moshiko-pytorch-bf16`.
- **cwd** — Working directory (often the `moshi` clone).
- **http_url** — Base URL used for **health probes** and the **Talk** page (default `http://127.0.0.1:8998`).

## Operations

- **Start / stop:** `POST /api/moshi/service/start`, `POST /api/moshi/service/stop`.
- **Status:** `GET /api/moshi/service/status` — process state + HTTP GET probe to `http_url`.
- **Logs:** `GET /api/moshi/service/logs` — tail of the service log file under `webapp/backend/logs/`.

First boot may **download large weights**; the HTTP probe stays **down** until the server listens.

## Talk page vs Moshi UI

The **Talk** route opens or iframes the **upstream** Moshi web UI. That UI owns microphone capture and playback. The dashboard’s **session Logger** is separate (client-side events from this browser session).
