import { useEffect, useState } from "react";

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

type MoshiServiceConfig = {
  command: string;
  args: string[];
  cwd: string | null;
  http_url: string;
};

export function SettingsPage() {
  const [glom, setGlom] = useState<GlomStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [moshi, setMoshi] = useState<MoshiServiceConfig | null>(null);
  const [moshiBusy, setMoshiBusy] = useState(false);
  const [moshiError, setMoshiError] = useState<string | null>(null);

  const refresh = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/glom/status");
      const payload = (await response.json()) as GlomStatus;
      setGlom(payload);
    } finally {
      setBusy(false);
    }
  };

  const refreshMoshi = async () => {
    setMoshiBusy(true);
    setMoshiError(null);
    try {
      const response = await fetch("/api/moshi/service/config");
      const payload = (await response.json()) as { ok: boolean; config: MoshiServiceConfig };
      setMoshi(payload.config);
    } catch (e) {
      setMoshiError(String(e));
    } finally {
      setMoshiBusy(false);
    }
  };

  const saveMoshi = async () => {
    if (!moshi) return;
    setMoshiBusy(true);
    setMoshiError(null);
    try {
      const response = await fetch("/api/moshi/service/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(moshi)
      });
      const payload = (await response.json()) as { ok: boolean; detail?: string };
      if (!payload.ok) throw new Error(payload.detail ?? "Save failed");
    } catch (e) {
      setMoshiError(String(e));
    } finally {
      setMoshiBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    void refreshMoshi();
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <div className="text-sm text-slate-400">Local LLM "Glom On"</div>
        <div className="mt-3 text-sm text-slate-200">
          Auto-discovery checks local Ollama and LM Studio endpoints and selects a preferred
          provider when available.
        </div>
        <div className="mt-2 text-xs text-slate-500">
          Planned auto-discovery targets: <span className="font-mono">127.0.0.1:11434</span>{" "}
          (Ollama), <span className="font-mono">127.0.0.1:1234</span> (LM Studio)
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="mt-3 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
        >
          {busy ? "Refreshing..." : "Refresh discovery"}
        </button>
        {glom ? (
          <div className="mt-3 space-y-2">
            <div className="text-xs text-slate-400">
              Preferred: <span className="font-mono text-slate-200">{glom.preferred_provider ?? "none"}</span>
            </div>
            {glom.providers.map((provider) => (
              <div key={provider.provider} className="rounded-lg border border-white/10 bg-slate-950/30 p-3">
                <div className="text-sm">
                  {provider.provider}:{" "}
                  <span className={provider.healthy ? "text-emerald-200" : "text-rose-200"}>
                    {provider.healthy ? "healthy" : "down"}
                  </span>
                </div>
                <div className="font-mono text-xs text-slate-500">{provider.details}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <div className="text-sm text-slate-400">Moshi Service</div>
        <div className="mt-3 text-sm text-slate-200">
          Configure how this dashboard starts and monitors the upstream Moshi backend process.
          After saving, go to Actions to start it.
        </div>
        <div className="mt-2 text-xs text-slate-500">
          Tip: set <span className="font-mono">http_url</span> to Moshi's UI endpoint (default is typically 8998).
        </div>

        {moshiError ? (
          <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200">
            {moshiError}
          </div>
        ) : null}

        {moshi ? (
          <div className="mt-3 space-y-3">
            <label className="block text-xs text-slate-500">
              Command (path or in PATH)
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={moshi.command}
                onChange={(e) => setMoshi({ ...moshi, command: e.target.value })}
                placeholder="e.g. D:\Dev\repos\moshi\rust\target\release\moshi-backend.exe"
              />
            </label>

            <label className="block text-xs text-slate-500">
              Args (JSON array)
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs"
                value={JSON.stringify(moshi.args)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value) as string[];
                    if (Array.isArray(parsed)) setMoshi({ ...moshi, args: parsed.map(String) });
                  } catch {
                    // ignore parse errors while typing
                  }
                }}
                placeholder='["--config","...","standalone"]'
              />
            </label>

            <label className="block text-xs text-slate-500">
              Working directory (optional)
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={moshi.cwd ?? ""}
                onChange={(e) => setMoshi({ ...moshi, cwd: e.target.value ? e.target.value : null })}
                placeholder="e.g. D:\Dev\repos\moshi\rust"
              />
            </label>

            <label className="block text-xs text-slate-500">
              http_url (for probe + open)
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={moshi.http_url}
                onChange={(e) => setMoshi({ ...moshi, http_url: e.target.value })}
                placeholder="http://127.0.0.1:8998"
              />
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveMoshi}
                disabled={moshiBusy}
                className="rounded-lg border border-white/10 bg-amber-400/10 px-3 py-2 text-sm text-amber-200 hover:bg-amber-400/15 disabled:opacity-50"
              >
                {moshiBusy ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={refreshMoshi}
                disabled={moshiBusy}
                className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 text-sm text-slate-500">{moshiBusy ? "Loading..." : "No config loaded."}</div>
        )}
      </div>
    </div>
  );
}

