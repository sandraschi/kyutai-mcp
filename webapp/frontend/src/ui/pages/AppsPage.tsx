import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

type Config = {
  mcp_http: { host: string; port: number; path: string };
};

type GlamaPayload = {
  name?: string;
  version?: string;
  description?: string;
  homepage?: string;
};

export function AppsPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [glama, setGlama] = useState<GlamaPayload | null>(null);
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setErr(null);
      try {
        const [cRes, gRes, mRes] = await Promise.all([
          fetch("/api/config"),
          fetch("/api/discovery/glama"),
          fetch("/.well-known/mcp/manifest.json")
        ]);
        const cfg = (await cRes.json()) as Config;
        setConfig(cfg);
        if (gRes.ok) {
          const gj = (await gRes.json()) as { glama?: GlamaPayload };
          setGlama(gj.glama ?? null);
        } else {
          setGlama(null);
        }
        if (mRes.ok) {
          setManifest((await mRes.json()) as Record<string, unknown>);
        } else {
          setManifest(null);
        }
      } catch (e) {
        setErr(String(e));
      }
    };
    void run();
  }, []);

  const mcpHttpUrl =
    config != null
      ? `http://${config.mcp_http.host}:${config.mcp_http.port}${config.mcp_http.path}`
      : null;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <h2 className="text-xl font-semibold">Apps and discovery</h2>
        <p className="mt-2 text-sm text-slate-400">
          Fleet-facing hooks: Glama metadata, well-known MCP manifest, and the HTTP MCP endpoint this server
          exposes for clients that support streamable HTTP.
        </p>
      </section>

      {err ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{err}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="text-sm text-slate-400">Glama (repo)</div>
          {glama ? (
            <div className="mt-3 space-y-2 text-sm text-slate-200">
              <div>
                <span className="text-slate-500">Name:</span> {glama.name ?? "—"}
              </div>
              <div>
                <span className="text-slate-500">Version:</span> {glama.version ?? "—"}
              </div>
              <div className="text-slate-300">{glama.description ?? ""}</div>
              {glama.homepage ? (
                <a
                  className="inline-flex items-center gap-1 text-amber-200 hover:underline"
                  href={glama.homepage}
                  target="_blank"
                  rel="noreferrer"
                >
                  Homepage <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-500">No glama.json loaded (optional).</div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="text-sm text-slate-400">MCP HTTP (this machine)</div>
          {mcpHttpUrl ? (
            <div className="mt-3 space-y-3 text-sm">
              <div className="break-all font-mono text-amber-100">{mcpHttpUrl}</div>
              <div className="text-slate-400">
                Use from MCP clients that support HTTP transport to <span className="font-mono">/mcp</span> on
                this host and port.
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-500">Loading…</div>
          )}
        </div>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <div className="text-sm text-slate-400">/.well-known/mcp/manifest.json</div>
        {manifest ? (
          <pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-200">
            {JSON.stringify(manifest, null, 2)}
          </pre>
        ) : (
          <div className="mt-3 text-sm text-slate-500">Not available.</div>
        )}
      </section>
    </div>
  );
}
