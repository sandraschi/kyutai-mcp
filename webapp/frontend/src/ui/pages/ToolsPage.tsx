import { useEffect, useMemo, useState } from "react";
import { cn } from "../cn";

type Ops = "status" | "local_viability" | "references" | "recommend_runtime";

type McpCatalog = {
  server?: string;
  fastmcp?: string;
  transports?: unknown;
  tools?: Array<{ name: string; summary?: string; parameters?: unknown }>;
  resources?: unknown[];
  prompts?: unknown[];
};

export function ToolsPage() {
  const [tab, setTab] = useState<"ops" | "catalog">("ops");

  const ops: Ops[] = useMemo(
    () => ["status", "local_viability", "references", "recommend_runtime"],
    []
  );

  const [operation, setOperation] = useState<Ops>("local_viability");
  const [includeEnv, setIncludeEnv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<object | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<McpCatalog | null>(null);
  const [catalogErr, setCatalogErr] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);

  useEffect(() => {
    if (tab !== "catalog") return;
    const run = async () => {
      setCatalogLoading(true);
      setCatalogErr(null);
      try {
        const res = await fetch("/api/mcp/catalog");
        const data = (await res.json()) as { ok?: boolean; catalog?: McpCatalog };
        if (!data.ok || !data.catalog) throw new Error("Catalog unavailable");
        setCatalog(data.catalog);
      } catch (e) {
        setCatalogErr(String(e));
        setCatalog(null);
      } finally {
        setCatalogLoading(false);
      }
    };
    void run();
  }, [tab]);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/moshi/ops", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation, include_env: includeEnv })
      });
      const data = (await res.json()) as { ok: boolean; result?: object; detail?: string };
      if (!data.ok) throw new Error(data.detail ?? "Request failed");
      setResult(data.result ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            tab === "ops"
              ? "border-amber-400/40 bg-amber-400/15 text-amber-100"
              : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          )}
          onClick={() => setTab("ops")}
        >
          Moshi ops
        </button>
        <button
          type="button"
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            tab === "catalog"
              ? "border-amber-400/40 bg-amber-400/15 text-amber-100"
              : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          )}
          onClick={() => setTab("catalog")}
        >
          MCP catalog
        </button>
      </div>

      {tab === "ops" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="text-sm text-slate-400">Moshi ops (dashboard bridge)</div>
            <div className="mt-3 space-y-3">
              <div>
                <div className="text-xs text-slate-500">Operation</div>
                <select
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  value={operation}
                  onChange={(e) => setOperation(e.target.value as Ops)}
                >
                  {ops.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={includeEnv}
                  onChange={(e) => setIncludeEnv(e.target.checked)}
                />
                include_env (safe subset)
              </label>

              <button
                type="button"
                className="w-full rounded-lg border border-white/10 bg-amber-400/10 px-3 py-2 text-sm text-amber-200 hover:bg-amber-400/15 disabled:opacity-50"
                disabled={busy}
                onClick={run}
              >
                {busy ? "Running…" : "Run"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur lg:col-span-2">
            <div className="text-sm text-slate-400">Result</div>
            {error ? (
              <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">
                {error}
              </div>
            ) : result ? (
              <pre className="mt-3 overflow-auto rounded-lg border border-white/10 bg-slate-950/30 p-3 text-xs text-slate-200">
                {JSON.stringify(result, null, 2)}
              </pre>
            ) : (
              <div className="mt-3 text-slate-500">Run an operation to see output.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {catalogLoading ? (
            <div className="text-sm text-slate-500">Loading catalog…</div>
          ) : catalogErr ? (
            <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">
              {catalogErr}
            </div>
          ) : catalog ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="text-sm text-slate-400">Server</div>
                <div className="mt-2 font-mono text-sm text-slate-200">
                  {catalog.server} {catalog.fastmcp ? `· ${catalog.fastmcp}` : ""}
                </div>
                {catalog.transports != null ? (
                  <pre className="mt-3 overflow-auto rounded-lg border border-white/10 bg-slate-950/30 p-3 text-xs text-slate-300">
                    {JSON.stringify(catalog.transports, null, 2)}
                  </pre>
                ) : null}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                  <div className="text-sm text-slate-400">Tools</div>
                  <ul className="mt-3 space-y-3">
                    {(catalog.tools ?? []).map((t) => (
                      <li key={t.name} className="rounded-lg border border-white/10 bg-slate-950/30 p-3 text-sm">
                        <div className="font-mono text-amber-100">{t.name}</div>
                        {t.summary ? <div className="mt-1 text-slate-400">{t.summary}</div> : null}
                        {t.parameters != null ? (
                          <pre className="mt-2 overflow-auto text-xs text-slate-500">
                            {JSON.stringify(t.parameters, null, 2)}
                          </pre>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                    <div className="text-sm text-slate-400">Resources</div>
                    <pre className="mt-3 overflow-auto text-xs text-slate-300">
                      {JSON.stringify(catalog.resources ?? [], null, 2)}
                    </pre>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                    <div className="text-sm text-slate-400">Prompts</div>
                    <pre className="mt-3 overflow-auto text-xs text-slate-300">
                      {JSON.stringify(catalog.prompts ?? [], null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
