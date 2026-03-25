import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "../cn";

type TabId = "mcp" | "webapp" | "moshi" | "japan-ai";

const TABS: { id: TabId; label: string; short: string }[] = [
  { id: "mcp", label: "MCP server", short: "Tools, transports, discovery" },
  { id: "webapp", label: "Webapp", short: "Routes, Glom-On, API, logger" },
  { id: "moshi", label: "Moshi model", short: "Upstream speech stack & service" },
  { id: "japan-ai", label: "Japanese AI", short: "Context, 日本語, local models" }
];

function Block(props: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/35 p-4">
      <h3 className="text-sm font-semibold text-amber-100/95">{props.title}</h3>
      <div className="mt-2 space-y-2 text-sm text-slate-300">{props.children}</div>
    </div>
  );
}

export function HelpPage() {
  const [tab, setTab] = useState<TabId>("mcp");

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-amber-300/25 bg-gradient-to-br from-amber-500/15 via-slate-900/40 to-sky-500/10 p-8 backdrop-blur">
        <div className="text-xs uppercase tracking-[0.2em] text-amber-200/80">Operator manual</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">
          Help — kyutai-mcp dashboard
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-300">
          Pick a tab below: <strong className="text-slate-100">MCP</strong> for agents and IDE wiring,{" "}
          <strong className="text-slate-100">Webapp</strong> for the operator UI and APIs,{" "}
          <strong className="text-slate-100">Moshi</strong> for the upstream voice model and supervised process, and{" "}
          <strong className="text-slate-100">Japanese AI</strong> for ecosystem context and Japanese-language usage tips.
        </p>
      </section>

      <div className="sticky top-0 z-20 -mx-1 border-b border-white/10 bg-slate-950/90 px-1 pb-0 backdrop-blur-md">
        <div
          className="flex gap-1 overflow-x-auto pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Help sections"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={cn(
                  "shrink-0 rounded-t-lg border border-b-0 px-4 py-3 text-left transition",
                  active
                    ? "border-amber-400/35 bg-amber-400/10 text-amber-100"
                    : "border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200"
                )}
                onClick={() => setTab(t.id)}
              >
                <div className="font-medium">{t.label}</div>
                <div className="text-xs text-slate-500">{t.short}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4" role="tabpanel">
        {tab === "mcp" ? <McpTab /> : null}
        {tab === "webapp" ? <WebappTab /> : null}
        {tab === "moshi" ? <MoshiTab /> : null}
        {tab === "japan-ai" ? <JapanAiTab /> : null}
      </div>
    </div>
  );
}

function McpTab() {
  return (
    <div className="space-y-4">
      <Block title="What the MCP server is">
        <p>
          <span className="font-mono text-amber-100/90">kyutai-mcp</span> exposes a{" "}
          <strong className="text-slate-100">FastMCP 3.1+</strong> server so Cursor, Claude Desktop, and other MCP
          clients can call Kyutai operations without reimplementing probes or subprocess glue.
        </p>
      </Block>

      <Block title="Tool: moshi_ops">
        <p>Portmanteau tool with parameter <span className="font-mono">operation</span>:</p>
        <ul className="list-inside list-disc space-y-1 text-slate-400">
          <li>
            <span className="font-mono text-slate-300">status</span> — server / Moshi-oriented status
          </li>
          <li>
            <span className="font-mono text-slate-300">local_viability</span> — environment hints for local runs
          </li>
          <li>
            <span className="font-mono text-slate-300">references</span> — upstream pointers
          </li>
          <li>
            <span className="font-mono text-slate-300">recommend_runtime</span> — runtime guidance
          </li>
        </ul>
        <p>
          Optional <span className="font-mono">include_env</span> returns a safe subset of environment diagnostics.
          From the dashboard, the same logic is available via <span className="font-mono">POST /api/moshi/ops</span> and{" "}
          <Link className="text-amber-200 hover:underline" to="/tools">
            Tools → Moshi ops
          </Link>
          .
        </p>
      </Block>

      <Block title="Transports">
        <ul className="list-inside list-disc space-y-2">
          <li>
            <strong className="text-slate-200">Stdio</strong> — run{" "}
            <span className="font-mono text-xs">uv run python -m kyutai_mcp</span> (or your venv equivalent) and point
            the client at the process.
          </li>
          <li>
            <strong className="text-slate-200">HTTP</strong> — streamable MCP at{" "}
            <span className="font-mono text-xs">http://127.0.0.1:10926/mcp</span> when the server is started with HTTP
            transport (see repo config).
          </li>
        </ul>
      </Block>

      <Block title="Discovery & catalog">
        <ul className="list-inside list-disc space-y-2">
          <li>
            <span className="font-mono">GET /api/mcp/catalog</span> (web backend) — JSON summary of tools, resources,
            prompts.
          </li>
          <li>
            <span className="font-mono">GET /api/discovery/glama</span> — parsed <span className="font-mono">glama.json</span>.
          </li>
          <li>
            <span className="font-mono">GET /.well-known/mcp/manifest.json</span> — fleet discovery manifest.
          </li>
        </ul>
        <p className="text-slate-400">
          In the UI: <Link className="text-amber-200 hover:underline" to="/apps">Apps</Link> and{" "}
          <Link className="text-amber-200 hover:underline" to="/tools">
            Tools → MCP catalog
          </Link>
          .
        </p>
      </Block>

      <Block title="Repository docs">
        <p>
          See <span className="font-mono">docs/MCP.md</span> in the repo for the full MCP-focused write-up alongside{" "}
          <span className="font-mono">README.md</span>.
        </p>
      </Block>
    </div>
  );
}

function WebappTab() {
  return (
    <div className="space-y-4">
      <Block title="Ports & stack">
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-slate-950/50">
          <table className="w-full min-w-[20rem] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Default</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs text-slate-300">
              <tr className="border-b border-white/5">
                <td className="px-3 py-2">Web backend</td>
                <td className="px-3 py-2">10924</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="px-3 py-2">Vite frontend</td>
                <td className="px-3 py-2">10925</td>
              </tr>
              <tr>
                <td className="px-3 py-2">MCP HTTP</td>
                <td className="px-3 py-2">10926 /mcp</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Start: <span className="font-mono">webapp\start.ps1</span>. Health:{" "}
          <span className="font-mono">GET /api/health</span> on the backend.
        </p>
      </Block>

      <Block title="Standard routes">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["/", "Home"],
            ["/actions", "Actions"],
            ["/tools", "Tools (ops + catalog)"],
            ["/apps", "Apps / discovery"],
            ["/moshi", "Moshi UI (alias /talk)"],
            ["/status", "Status"],
            ["/chat", "Chat"],
            ["/logs", "Logger"],
            ["/settings", "Settings"],
            ["/help", "Help"]
          ].map(([path, label]) => (
            <div key={path} className="rounded-lg border border-white/10 bg-slate-950/30 px-2 py-1.5 font-mono text-xs">
              <span className="text-amber-100/90">{path}</span>
              <span className="text-slate-500"> — </span>
              <span className="text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Glom-On (local LLM)">
        <p>
          Dashboard chat and refine call <strong className="text-slate-200">Ollama</strong> (11434) or{" "}
          <strong className="text-slate-200">LM Studio</strong> (1234) when probed healthy. Check{" "}
          <Link className="text-amber-200 hover:underline" to="/status">
            Status
          </Link>{" "}
          for <span className="font-mono">GET /api/glom/status</span>.
        </p>
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-slate-950/50">
          <table className="w-full min-w-[24rem] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Probe</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              <tr className="border-b border-white/5">
                <td className="px-3 py-2 font-mono">ollama</td>
                <td className="px-3 py-2 font-mono text-xs">127.0.0.1:11434/api/tags</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">lmstudio</td>
                <td className="px-3 py-2 font-mono text-xs">127.0.0.1:1234/v1/models</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Block>

      <Block title="Logger: session vs Moshi">
        <p>
          <Link className="text-amber-200 hover:underline" to="/logs">
            /logs
          </Link>{" "}
          and the bottom dock share an in-memory <strong className="text-slate-200">session</strong> buffer (e.g. Chat
          refine). Moshi process logs are on disk — use Status and <span className="font-mono">GET /api/moshi/service/logs</span>.
        </p>
      </Block>

      <Block title="Shortcuts & recovery">
        <ul className="list-inside list-disc space-y-1 text-slate-400">
          <li>
            <span className="font-mono">Ctrl+K</span> / <span className="font-mono">Cmd+K</span> — Chat modal
          </li>
          <li>Frontend down → confirm <span className="font-mono">10925</span>; backend down → <span className="font-mono">10924/api/health</span></li>
        </ul>
      </Block>

      <Block title="Backend API (summary)">
        <div className="grid gap-1 font-mono text-[11px] text-slate-400 sm:grid-cols-2">
          <span>GET /api/health</span>
          <span>GET /api/config</span>
          <span>GET /api/status</span>
          <span>GET /api/glom/status</span>
          <span>GET /api/mcp/catalog</span>
          <span>GET /api/discovery/glama</span>
          <span>GET /.well-known/mcp/manifest.json</span>
          <span>GET/POST …/moshi/service/*</span>
          <span>POST /api/moshi/ops</span>
          <span>POST /api/chat/refine</span>
          <span>POST /api/chat/message</span>
        </div>
      </Block>

      <Block title="Repo">
        <p className="text-slate-400">
          <span className="font-mono">docs/WEBAPP.md</span>, <span className="font-mono">docs/GLOM.md</span>.
        </p>
      </Block>
    </div>
  );
}

function MoshiTab() {
  return (
    <div className="space-y-4">
      <Block title="What Moshi is">
        <p>
          <strong className="text-slate-100">Moshi</strong> (Kyutai) is a <strong>real-time speech dialogue</strong>{" "}
          model: audio in, audio out, with latency aimed at natural conversation. It is not the same as chaining
          wake-word → cloud STT → external LLM → TTS unless you wire that explicitly.
        </p>
      </Block>

      <Block title="This repo vs upstream">
        <p>
          <strong className="text-slate-200">kyutai-mcp</strong> does not replace the upstream training/inference server.
          You install Moshi from{" "}
          <a
            className="text-amber-200 hover:underline"
            href="https://github.com/kyutai-labs/moshi"
            target="_blank"
            rel="noreferrer"
          >
            kyutai-labs/moshi
          </a>
          . The dashboard <strong>supervises</strong> your chosen command, probes <span className="font-mono">http_url</span>, and links to Moshi’s browser UI for mic and playback (
          <Link className="text-amber-200 hover:underline" to="/moshi">
            Talk
          </Link>
          ).
        </p>
      </Block>

      <Block title="Moshi service configuration">
        <p>
          <Link className="text-amber-200 hover:underline" to="/settings">
            Settings → Moshi Service
          </Link>
          : executable path, args (e.g. <span className="font-mono">-m moshi.server</span>, HF repo), cwd, and{" "}
          <span className="font-mono">http_url</span> for probes (often <span className="font-mono">http://127.0.0.1:8998</span>).
        </p>
      </Block>

      <Block title="Start, status, logs">
        <ul className="list-inside list-disc space-y-1 text-slate-400">
          <li>
            <Link className="text-amber-200 hover:underline" to="/actions">
              Actions
            </Link>{" "}
            — start/stop workflows
          </li>
          <li>
            <Link className="text-amber-200 hover:underline" to="/status">
              Status
            </Link>{" "}
            — process state, HTTP GET probe, log tail
          </li>
          <li>First run may download large weights; HTTP stays red until the server listens.</li>
        </ul>
      </Block>

      <Block title="Hardware & runtimes">
        <p className="text-slate-400">
          Upstream supports PyTorch and Rust/CUDA paths depending on build. VRAM needs vary by checkpoint; large models
          may need a high-memory GPU. Consult Moshi’s README for the exact recipe you are running.
        </p>
      </Block>

      <Block title="Repo">
        <p className="text-slate-400">
          <span className="font-mono">docs/MOSHI_SERVICE.md</span>
        </p>
      </Block>
    </div>
  );
}

function JapanAiTab() {
  return (
    <div className="space-y-4">
      <Block title="Japan & AI context">
        <p>
          Japan has a strong ecosystem of <strong className="text-slate-200">open-weight LLMs</strong>, on-prem
          inference, and vendor offerings aimed at enterprises that need data residency. For <strong>voice</strong>,
          Kyutai’s Moshi is a European research artifact, but it is often discussed in Japanese ML communities alongside
          domestic LLM and speech work.
        </p>
        <p>
          This dashboard’s <strong className="text-slate-200">Glom-On</strong> path lets you keep refinement and chat on{" "}
          <strong className="text-slate-200">local</strong> Ollama or LM Studio—useful when you want prompts and
          transcripts to stay off third-party clouds.
        </p>
      </Block>

      <Block title="日本語での利用">
        <p className="text-slate-200">
          このダッシュボードは、Moshi（音声）とオプションのローカルLLM（Glom-On）をまとめて扱うためのオペレータ向けUIです。
        </p>
        <ul className="list-inside list-disc space-y-1 text-slate-400">
          <li>
            <strong className="text-slate-300">Moshi</strong>
            ：上流のブラウザUIでマイク→応答。音声対話は日本語でも利用可能な場合があります（上流の設定とモデルに依存）。
          </li>
          <li>
            <strong className="text-slate-300">チャット／Refine</strong>
            ：OllamaやLM Studioに
            <strong className="text-slate-300">日本語に強いモデル</strong>
            （各コミュニティのオープンウェイト系など）を入れれば、日本語プロンプトで補助的に利用できます。
          </li>
          <li>
            <strong className="text-slate-300">データの扱い</strong>
            ：機密を扱う場合は、クラウドAPIではなくローカル推論（Glom-On）とMoshiのローカル実行を組み合わせる運用を検討してください。
          </li>
        </ul>
      </Block>

      <Block title="Practical tips (JP-facing workflows)">
        <ul className="list-inside list-disc space-y-2 text-slate-400">
          <li>
            Pull a <strong className="text-slate-300">Japanese-capable</strong> chat model into Ollama/LM Studio if you
            want help text and refine in Japanese; the backend only requires a working OpenAI-compatible chat API.
          </li>
          <li>
            Keep <Link className="text-amber-200 hover:underline" to="/status">Status</Link> open while testing: Glom
            probes and Moshi HTTP probe fail for different reasons (wrong port vs. model still loading).
          </li>
        </ul>
      </Block>

      <Block title="Disclaimer">
        <p className="text-xs text-slate-500">
          This tab is general guidance, not legal or compliance advice. For regulated deployments, follow your
          organization’s policies and applicable law.
        </p>
      </Block>
    </div>
  );
}
