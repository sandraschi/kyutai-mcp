import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Config = {
  web_backend_port: number;
  web_frontend_port: number;
  mcp_http: { host: string; port: number; path: string };
};

export function HomePage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const c = await fetch("/api/config");
        const cfg = (await c.json()) as Config;
        setConfig(cfg);
        const h = await fetch("/api/health");
        const hj = (await h.json()) as { ok?: boolean };
        setHealthOk(Boolean(hj.ok));
      } catch {
        setHealthOk(false);
      }
    };
    void run();
  }, []);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-500/15 via-slate-900/30 to-sky-500/15 p-8 backdrop-blur">
        <div className="text-xs uppercase tracking-[0.2em] text-amber-100/70">Kyutai Operations Hub</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Run Moshi locally. One console for voice ops, MCP, and Glom-On LLMs.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-300">
          Supervise the upstream Moshi backend, probe its HTTP port, and tail service logs. Optional{" "}
          <strong className="font-medium text-slate-200">Glom-On</strong> hooks Ollama or LM Studio for in-dashboard
          chat—no cloud required when your local models are up. Full routes and APIs live in{" "}
          <Link className="text-amber-200 hover:underline" to="/help">
            Help
          </Link>
          .
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15" to="/actions">
            Start Moshi (Actions)
          </Link>
          <Link className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15" to="/chat">
            Open Chat
          </Link>
          <Link className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15" to="/status">
            Open Status
          </Link>
          <Link className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15" to="/help">
            What is Moshi?
          </Link>
          <Link className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15" to="/apps">
            Apps / discovery
          </Link>
          <Link className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15" to="/moshi">
            Talk with Moshi
          </Link>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="text-sm text-slate-400">System</div>
          <div className="mt-2 text-2xl font-semibold">kyutai-mcp</div>
          <div className="mt-3 text-sm text-slate-300">
            Web backend health:{" "}
            {healthOk === null ? (
              <span className="text-slate-500">checking…</span>
            ) : healthOk ? (
              <span className="text-emerald-200">OK</span>
            ) : (
              <span className="text-rose-200">DOWN</span>
            )}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            If DOWN: run <span className="font-mono">webapp\start.ps1</span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur lg:col-span-2">
          <div className="text-sm text-slate-400">Ports and interfaces</div>
          {config ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                <div className="text-xs text-slate-500">Web backend</div>
                <div className="mt-1 font-mono text-sm">{config.web_backend_port}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                <div className="text-xs text-slate-500">Web frontend</div>
                <div className="mt-1 font-mono text-sm">{config.web_frontend_port}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                <div className="text-xs text-slate-500">MCP HTTP</div>
                <div className="mt-1 font-mono text-sm">
                  {config.mcp_http.host}:{config.mcp_http.port}
                  {config.mcp_http.path}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-slate-500">Loading…</div>
          )}
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          { title: "Action Workbench", body: "Guided one-click operations for common workflows.", to: "/actions" },
          { title: "Moshi Tools", body: "Run moshi_ops and inspect the MCP catalog.", to: "/tools" },
          { title: "Apps & discovery", body: "Glama metadata, MCP manifest, and HTTP MCP URL.", to: "/apps" },
          { title: "Talk with Moshi", body: "Open or embed the upstream Moshi browser UI.", to: "/moshi" },
          { title: "Status Observatory", body: "Runtime, ports, and Glom-On provider health in one page.", to: "/status" },
          { title: "Chat Console", body: "Persona chat with provider routing and traceable responses.", to: "/chat" },
          {
            title: "Session logger",
            body: "Filter, copy, and clear the in-browser trace (refine, chat events).",
            to: "/logs"
          },
          { title: "Help & manual", body: "Deep help: Glom-On, routes, Moshi vs logs, API map.", to: "/help" }
        ].map((card) => (
          <Link key={card.title} to={card.to} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur hover:bg-white/10">
            <div className="text-sm font-semibold">{card.title}</div>
            <div className="mt-2 text-sm text-slate-400">{card.body}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}

