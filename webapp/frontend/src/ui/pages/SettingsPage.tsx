import { useCallback, useEffect, useState } from "react";
import {
  type DashboardSettings,
  type LlmProvider,
  type Persona,
  fetchDashboardSettings,
  fetchLlmModels,
  saveDashboardSettings,
} from "../../lib/dashboardSettings";
import { ModelSelect } from "../components/ModelSelect";

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

type VoiceBackend = "moshi" | "pocket_tts" | "unmute";

type BackendsConfig = {
  active_voice_backend: VoiceBackend;
  tts_on_briefing: boolean;
  pocket_tts: {
    command: string;
    args: string[];
    cwd: string | null;
    http_url: string;
    auto_start: boolean;
    default_voice: string;
  };
  unmute: {
    ui_url: string;
    backend_url: string;
    notes: string;
  };
};

type BackendsStatus = {
  active_voice_backend: VoiceBackend;
  tts_on_briefing: boolean;
  pocket_tts: {
    http_probe?: { ok: boolean; detail: string };
    process?: { running: boolean; pid: number | null };
  };
  unmute: {
    healthy: boolean;
    probes?: { ui: { ok: boolean }; backend: { ok: boolean } };
  };
  recommendations: string[];
};

export function SettingsPage() {
  const [glom, setGlom] = useState<GlomStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [moshi, setMoshi] = useState<MoshiServiceConfig | null>(null);
  const [moshiBusy, setMoshiBusy] = useState(false);
  const [moshiError, setMoshiError] = useState<string | null>(null);
  const [backends, setBackends] = useState<BackendsConfig | null>(null);
  const [backendsStatus, setBackendsStatus] = useState<BackendsStatus | null>(null);
  const [backendsBusy, setBackendsBusy] = useState(false);
  const [backendsError, setBackendsError] = useState<string | null>(null);

  const [dash, setDash] = useState<DashboardSettings | null>(null);
  const [dashBusy, setDashBusy] = useState(false);
  const [dashError, setDashError] = useState<string | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [lmstudioModels, setLmstudioModels] = useState<string[]>([]);

  const modelsFor = useCallback(
    (p: LlmProvider) => (p === "lmstudio" ? lmstudioModels : ollamaModels),
    [ollamaModels, lmstudioModels],
  );

  const refreshModels = useCallback(async () => {
    const [o, l] = await Promise.all([
      fetchLlmModels("ollama").catch(() => [] as string[]),
      fetchLlmModels("lmstudio").catch(() => [] as string[]),
    ]);
    setOllamaModels(o);
    setLmstudioModels(l);
  }, []);

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

  const refreshBackends = async () => {
    setBackendsBusy(true);
    setBackendsError(null);
    try {
      const [cfgRes, statusRes] = await Promise.all([
        fetch("/api/backends/config"),
        fetch("/api/backends/status"),
      ]);
      const cfgPayload = (await cfgRes.json()) as { ok: boolean; config: BackendsConfig };
      const statusPayload = (await statusRes.json()) as { ok: boolean } & BackendsStatus;
      setBackends(cfgPayload.config);
      setBackendsStatus(statusPayload);
    } catch (e) {
      setBackendsError(String(e));
    } finally {
      setBackendsBusy(false);
    }
  };

  const saveBackends = async () => {
    if (!backends) return;
    setBackendsBusy(true);
    setBackendsError(null);
    try {
      await fetch("/api/backends/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backends),
      });
      await refreshBackends();
    } catch (e) {
      setBackendsError(String(e));
    } finally {
      setBackendsBusy(false);
    }
  };

  const pocketTtsAction = async (action: "start" | "stop") => {
    setBackendsBusy(true);
    setBackendsError(null);
    try {
      await fetch(`/api/backends/pocket-tts/${action}`, { method: "POST" });
      await refreshBackends();
    } catch (e) {
      setBackendsError(String(e));
    } finally {
      setBackendsBusy(false);
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

  const loadDashboard = async () => {
    setDashBusy(true);
    setDashError(null);
    try {
      const s = await fetchDashboardSettings();
      setDash(s);
      await refreshModels();
    } catch (e) {
      setDashError(String(e));
    } finally {
      setDashBusy(false);
    }
  };

  const saveDashboard = async () => {
    if (!dash) return;
    setDashBusy(true);
    setDashError(null);
    try {
      const saved = await saveDashboardSettings(dash);
      setDash(saved);
    } catch (e) {
      setDashError(String(e));
    } finally {
      setDashBusy(false);
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
        body: JSON.stringify(moshi),
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
    void refreshBackends();
    void loadDashboard();
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <div className="text-sm text-slate-300">Dashboard defaults (persistent)</div>
        <p className="mt-2 text-sm text-slate-300">
          Model lists are queried live from Ollama and LM Studio. Values are stored in{" "}
          <span className="font-mono text-slate-300">webapp/backend/dashboard-settings.json</span> on the machine
          running this backend.
        </p>
        {dashError ? (
          <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200">
            {dashError}
          </div>
        ) : null}
        {dash ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="space-y-3">
              <div className="text-sm font-medium uppercase tracking-wide text-slate-400">Chat</div>
              <label className="block text-sm text-slate-400">
                Persona
                <select
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  value={dash.chat_persona}
                  onChange={(e) => setDash({ ...dash, chat_persona: e.target.value as Persona })}
                >
                  <option value="reductionist">Reductionist</option>
                  <option value="debugger">Debugger</option>
                  <option value="explainer">Explainer</option>
                </select>
              </label>
              <label className="block text-sm text-slate-400">
                Provider
                <select
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  value={dash.chat_provider}
                  onChange={(e) => setDash({ ...dash, chat_provider: e.target.value as LlmProvider })}
                >
                  <option value="auto">Auto (Glom)</option>
                  <option value="ollama">Ollama</option>
                  <option value="lmstudio">LM Studio</option>
                </select>
              </label>
              <ModelSelect
                label="Model"
                provider={dash.chat_provider}
                value={dash.chat_model}
                models={modelsFor(dash.chat_provider)}
                onChange={(chat_model) => setDash({ ...dash, chat_model })}
              />
            </div>
            <div className="space-y-3">
              <div className="text-sm font-medium uppercase tracking-wide text-slate-400">Voice workflows</div>
              <label className="block text-sm text-slate-400">
                Provider
                <select
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  value={dash.voice_provider}
                  onChange={(e) => setDash({ ...dash, voice_provider: e.target.value as LlmProvider })}
                >
                  <option value="auto">Auto (Glom)</option>
                  <option value="ollama">Ollama</option>
                  <option value="lmstudio">LM Studio</option>
                </select>
              </label>
              <ModelSelect
                label="Model"
                provider={dash.voice_provider}
                value={dash.voice_model}
                models={modelsFor(dash.voice_provider)}
                onChange={(voice_model) => setDash({ ...dash, voice_model })}
              />
            </div>
            <div className="space-y-3">
              <div className="text-sm font-medium uppercase tracking-wide text-slate-400">Prompt refine (modal)</div>
              <label className="block text-sm text-slate-400">
                Provider
                <select
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  value={dash.refine_provider}
                  onChange={(e) => setDash({ ...dash, refine_provider: e.target.value as LlmProvider })}
                >
                  <option value="auto">Auto (Glom)</option>
                  <option value="ollama">Ollama</option>
                  <option value="lmstudio">LM Studio</option>
                </select>
              </label>
              <ModelSelect
                label="Model"
                provider={dash.refine_provider}
                value={dash.refine_model}
                models={modelsFor(dash.refine_provider)}
                onChange={(refine_model) => setDash({ ...dash, refine_model })}
              />
            </div>
          </div>
        ) : (
          <div className="mt-3 text-sm text-slate-400">{dashBusy ? "Loading defaults…" : "No defaults loaded."}</div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshModels()}
            disabled={dashBusy}
            className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
          >
            Refresh model lists
          </button>
          <button
            type="button"
            onClick={() => void saveDashboard()}
            disabled={dashBusy || !dash}
            className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200 hover:bg-amber-400/15 disabled:opacity-50"
          >
            {dashBusy ? "Saving…" : "Save dashboard defaults"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="text-sm text-slate-300">Local LLM &quot;Glom On&quot;</div>
          <div className="mt-3 text-sm text-slate-200">
            Auto-discovery checks local Ollama and LM Studio endpoints and selects a preferred provider when
            available.
          </div>
          <div className="mt-2 text-sm text-slate-400">
            Discovery targets match <span className="font-mono">/api/config</span> (Ollama base URL + LM Studio{" "}
            <span className="font-mono">127.0.0.1:1234</span>).
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
              <div className="text-sm text-slate-300">
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
                  <div className="font-mono text-sm text-slate-400">{provider.details}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="text-sm text-slate-300">Voice Backends</div>
          <div className="mt-3 text-sm text-slate-200">
            Moshi (GPU duplex), Pocket TTS (CPU briefings), or Unmute (WSL/Docker probe). See docs/KYUTAI_BACKENDS.md.
          </div>

          {backendsError ? (
            <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200">
              {backendsError}
            </div>
          ) : null}

          {backends ? (
            <div className="mt-3 space-y-3">
              <label className="block text-sm text-slate-400">
                Active voice backend
                <select
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  value={backends.active_voice_backend}
                  onChange={(e) =>
                    setBackends({ ...backends, active_voice_backend: e.target.value as VoiceBackend })
                  }
                >
                  <option value="moshi">moshi (GPU duplex)</option>
                  <option value="pocket_tts">pocket_tts (CPU TTS)</option>
                  <option value="unmute">unmute (WSL probe)</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={backends.tts_on_briefing}
                  onChange={(e) => setBackends({ ...backends, tts_on_briefing: e.target.checked })}
                />
                Synthesize WAV on speak_boilerplate when Pocket TTS is active
              </label>

              <label className="block text-sm text-slate-400">
                Pocket TTS URL
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  value={backends.pocket_tts.http_url}
                  onChange={(e) =>
                    setBackends({
                      ...backends,
                      pocket_tts: { ...backends.pocket_tts, http_url: e.target.value },
                    })
                  }
                />
              </label>

              {backendsStatus ? (
                <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3 text-sm text-slate-300">
                  <div>
                    Pocket TTS:{" "}
                    <span
                      className={
                        backendsStatus.pocket_tts.http_probe?.ok ? "text-emerald-200" : "text-amber-200"
                      }
                    >
                      {backendsStatus.pocket_tts.http_probe?.ok ? "online" : "offline"}
                    </span>
                    {backendsStatus.pocket_tts.process?.pid
                      ? ` (pid ${backendsStatus.pocket_tts.process.pid})`
                      : ""}
                  </div>
                  <div>
                    Unmute:{" "}
                    <span className={backendsStatus.unmute.healthy ? "text-emerald-200" : "text-slate-400"}>
                      {backendsStatus.unmute.healthy ? "reachable" : "not reachable (expected on Windows)"}
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveBackends}
                  disabled={backendsBusy}
                  className="rounded-lg border border-white/10 bg-amber-400/10 px-3 py-2 text-sm text-amber-200 hover:bg-amber-400/15 disabled:opacity-50"
                >
                  {backendsBusy ? "Saving..." : "Save backends"}
                </button>
                <button
                  type="button"
                  onClick={() => pocketTtsAction("start")}
                  disabled={backendsBusy}
                  className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
                >
                  Start Pocket TTS
                </button>
                <button
                  type="button"
                  onClick={() => pocketTtsAction("stop")}
                  disabled={backendsBusy}
                  className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
                >
                  Stop Pocket TTS
                </button>
                <button
                  type="button"
                  onClick={refreshBackends}
                  disabled={backendsBusy}
                  className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-400">{backendsBusy ? "Loading..." : "No config loaded."}</div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="text-sm text-slate-300">Moshi Service</div>
          <div className="mt-3 text-sm text-slate-200">
            Configure how this dashboard starts and monitors the upstream Moshi backend process. After saving, go to
            Actions to start it.
          </div>
          <div className="mt-2 text-sm text-slate-400">
            Tip: set <span className="font-mono">http_url</span> to Moshi&apos;s UI endpoint (default is typically 8998).
          </div>

          {moshiError ? (
            <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200">
              {moshiError}
            </div>
          ) : null}

          {moshi ? (
            <div className="mt-3 space-y-3">
              <label className="block text-sm text-slate-400">
                Command (path or in PATH)
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  value={moshi.command}
                  onChange={(e) => setMoshi({ ...moshi, command: e.target.value })}
                  placeholder="e.g. D:\Dev\repos\moshi\rust\target\release\moshi-backend.exe"
                />
              </label>

              <label className="block text-sm text-slate-400">
                Args (JSON array)
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm"
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

              <label className="block text-sm text-slate-400">
                Working directory (optional)
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  value={moshi.cwd ?? ""}
                  onChange={(e) => setMoshi({ ...moshi, cwd: e.target.value ? e.target.value : null })}
                  placeholder="e.g. D:\Dev\repos\moshi\rust"
                />
              </label>

              <label className="block text-sm text-slate-400">
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
            <div className="mt-3 text-sm text-slate-400">{moshiBusy ? "Loading..." : "No config loaded."}</div>
          )}
        </div>
      </div>
    </div>
  );
}
