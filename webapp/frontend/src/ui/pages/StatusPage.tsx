import { useEffect, useState } from "react";

type ServiceStatus = {
  ok: boolean;
  service: string;
  runtime: { python: string; platform: string };
  ports: { backend: number; frontend: number; mcp_http: number };
  time_ms: number;
};

type GlomProvider = {
  provider: "ollama" | "lmstudio";
  url: string;
  healthy: boolean;
  details: string;
};

type GlomStatus = {
  ok: boolean;
  healthy_any: boolean;
  preferred_provider: "ollama" | "lmstudio" | null;
  providers: GlomProvider[];
  recommendations: string[];
};

type MoshiServiceStatus = {
  ok: boolean;
  running: boolean;
  pid: number | null;
  exit_code: number | null;
  started_at_ms: number | null;
  log_path: string | null;
  http_probe: { url: string; ok: boolean | null; detail: string | null };
  config: { command: string; args: string[]; cwd: string | null; http_url: string };
};

export function StatusPage() {
  const [service, setService] = useState<ServiceStatus | null>(null);
  const [glom, setGlom] = useState<GlomStatus | null>(null);
  const [moshi, setMoshi] = useState<MoshiServiceStatus | null>(null);
  const [moshiLogs, setMoshiLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const [a, b, c, d] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/glom/status"),
        fetch("/api/moshi/service/status"),
        fetch("/api/moshi/service/logs?tail=200")
      ]);
      const sa = (await a.json()) as ServiceStatus;
      const sb = (await b.json()) as GlomStatus;
      const sc = (await c.json()) as MoshiServiceStatus;
      const sd = (await d.json()) as { ok: boolean; lines: string[] };
      setService(sa);
      setGlom(sb);
      setMoshi(sc);
      setMoshiLogs(sd.lines ?? []);
    } catch (exc) {
      setError(String(exc));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">Status Observatory</h2>
            <p className="mt-1 text-sm text-slate-400">
              Runtime health, transport ports, and Glom-On provider detection.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
            onClick={refresh}
            disabled={busy}
          >
            {busy ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-5 text-sm text-rose-200">
          {error}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="text-sm text-slate-400">Service Runtime</div>
          {service ? (
            <div className="mt-3 space-y-2 text-sm">
              <div>Service: <span className="text-slate-200">{service.service}</span></div>
              <div>Python: <span className="font-mono text-slate-200">{service.runtime.python}</span></div>
              <div className="break-all">Platform: <span className="font-mono text-slate-200">{service.runtime.platform}</span></div>
              <div>Backend port: <span className="font-mono text-slate-200">{service.ports.backend}</span></div>
              <div>Frontend port: <span className="font-mono text-slate-200">{service.ports.frontend}</span></div>
              <div>MCP HTTP port: <span className="font-mono text-slate-200">{service.ports.mcp_http}</span></div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-500">Loading...</div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="text-sm text-slate-400">Glom-On Discovery</div>
          {glom ? (
            <div className="mt-3 space-y-3">
              <div className="text-sm">
                Preferred provider:{" "}
                <span className="font-mono text-slate-200">{glom.preferred_provider ?? "none"}</span>
              </div>
              {glom.providers.map((provider) => (
                <div key={provider.provider} className="rounded-lg border border-white/10 bg-slate-950/30 p-3">
                  <div className="text-sm">
                    {provider.provider}:{" "}
                    <span className={provider.healthy ? "text-emerald-200" : "text-rose-200"}>
                      {provider.healthy ? "healthy" : "down"}
                    </span>
                  </div>
                  <div className="mt-1 break-all font-mono text-xs text-slate-400">{provider.url}</div>
                  <div className="mt-1 text-xs text-slate-500">{provider.details}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-500">Loading...</div>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="text-sm text-slate-400">Moshi Service</div>
          {moshi ? (
            <div className="mt-3 space-y-2 text-sm">
              <div>
                Process:{" "}
                <span className={moshi.running ? "text-emerald-200" : "text-rose-200"}>
                  {moshi.running ? "running" : "stopped"}
                </span>
              </div>
              <div>PID: <span className="font-mono text-slate-200">{moshi.pid ?? "n/a"}</span></div>
              <div>Exit: <span className="font-mono text-slate-200">{moshi.exit_code ?? "n/a"}</span></div>
              <div className="break-all">
                Probe:{" "}
                <span className="font-mono text-slate-200">{moshi.http_probe.url}</span>{" "}
                <span className={moshi.http_probe.ok ? "text-emerald-200" : "text-rose-200"}>
                  {moshi.http_probe.ok ? "OK" : "FAIL"}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                Command: <span className="font-mono">{moshi.config.command || "(not set)"}</span>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-500">Loading...</div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="text-sm text-slate-400">Moshi Logs (tail)</div>
          <pre className="mt-3 h-64 overflow-auto rounded-lg border border-white/10 bg-slate-950/30 p-3 text-xs text-slate-200">
            {moshiLogs.length ? moshiLogs.join("\n") : "No logs yet."}
          </pre>
        </div>
      </section>
    </div>
  );
}

