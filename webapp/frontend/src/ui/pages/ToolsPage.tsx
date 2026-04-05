import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchDashboardSettings,
  fetchLlmModels,
  patchDashboardSettings,
} from "../../lib/dashboardSettings";
import { ModelSelect } from "../components/ModelSelect";
import { cn } from "../cn";

type Ops = "status" | "local_viability" | "references" | "recommend_runtime";
type VoiceTopic = "weather" | "world_news" | "stock_market" | "ai_news";
type VoiceProvider = "auto" | "ollama" | "lmstudio";
type VoiceMode = "turn" | "boilerplate";

type McpCatalog = {
  server?: string;
  fastmcp?: string;
  transports?: unknown;
  tools?: Array<{ name: string; summary?: string; parameters?: unknown }>;
  resources?: unknown[];
  prompts?: unknown[];
};

export function ToolsPage() {
  const [tab, setTab] = useState<"ops" | "voice" | "catalog">("ops");

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

  const [voiceMode, setVoiceMode] = useState<VoiceMode>("turn");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceResult, setVoiceResult] = useState<object | null>(null);
  const [voiceWorkflow, setVoiceWorkflow] = useState<object | null>(null);
  const [voiceSessionId, setVoiceSessionId] = useState("default");
  const [voiceUtterance, setVoiceUtterance] = useState("hi moshi weather report please for vienna");
  const [voiceTopic, setVoiceTopic] = useState<VoiceTopic>("weather");
  const [voiceLocation, setVoiceLocation] = useState("Vienna");
  const [voiceSymbols, setVoiceSymbols] = useState("^GSPC,^IXIC,^DJI");
  const [voiceStyle, setVoiceStyle] = useState<"brief" | "normal" | "detailed">("normal");
  const [voiceProvider, setVoiceProvider] = useState<VoiceProvider>("auto");
  const [voiceModel, setVoiceModel] = useState<string | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [lmstudioModels, setLmstudioModels] = useState<string[]>([]);
  const voiceSettingsLoaded = useRef(false);

  const voiceModelsFor = useMemo(
    () => (voiceProvider === "lmstudio" ? lmstudioModels : ollamaModels),
    [voiceProvider, ollamaModels, lmstudioModels],
  );

  useEffect(() => {
    void (async () => {
      try {
        const s = await fetchDashboardSettings();
        setVoiceProvider(s.voice_provider);
        setVoiceModel(s.voice_model);
      } catch {
        // defaults
      } finally {
        voiceSettingsLoaded.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    if (!voiceSettingsLoaded.current) return;
    const t = window.setTimeout(() => {
      void patchDashboardSettings({
        voice_provider: voiceProvider,
        voice_model: voiceModel,
      }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(t);
  }, [voiceProvider, voiceModel]);

  useEffect(() => {
    if (tab !== "catalog" && tab !== "voice") return;
    const run = async () => {
      if (tab === "catalog") {
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
      }
      if (tab === "voice") {
        try {
          const res = await fetch("/api/voice/workflows");
          const data = (await res.json()) as { ok?: boolean } & Record<string, unknown>;
          if (data.ok) setVoiceWorkflow(data as object);
        } catch {
          // non-blocking
        }
        const [o, l] = await Promise.all([
          fetchLlmModels("ollama").catch(() => [] as string[]),
          fetchLlmModels("lmstudio").catch(() => [] as string[]),
        ]);
        setOllamaModels(o);
        setLmstudioModels(l);
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

  const runVoice = async () => {
    setVoiceBusy(true);
    setVoiceError(null);
    setVoiceResult(null);
    try {
      if (voiceMode === "turn") {
        const res = await fetch("/api/voice/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            session_id: voiceSessionId.trim() || "default",
            utterance: voiceUtterance.trim(),
            provider: voiceProvider,
            model: voiceModel,
            use_deep_reasoner: true,
            deep_provider: "same"
          })
        });
        const data = (await res.json()) as { ok?: boolean; detail?: string } & Record<string, unknown>;
        if (!data.ok) throw new Error(data.detail ?? "Voice turn failed");
        setVoiceResult(data);
      } else {
        const symbols = voiceSymbols
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const res = await fetch("/api/voice/speak_boilerplate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            topic: voiceTopic,
            location: voiceLocation.trim() || "Vienna",
            symbols,
            provider: voiceProvider,
            model: voiceModel,
            style: voiceStyle
          })
        });
        const data = (await res.json()) as { ok?: boolean; detail?: string } & Record<string, unknown>;
        if (!data.ok) throw new Error(data.detail ?? "Speak boilerplate failed");
        setVoiceResult(data);
      }
    } catch (e) {
      setVoiceError(String(e));
    } finally {
      setVoiceBusy(false);
    }
  };

  const usePreset = (preset: VoiceTopic) => {
    setVoiceMode("boilerplate");
    setVoiceTopic(preset);
    if (preset === "weather") {
      setVoiceLocation("Vienna");
    } else if (preset === "stock_market") {
      setVoiceSymbols("^GSPC,^IXIC,^DJI");
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
        <button
          type="button"
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            tab === "voice"
              ? "border-amber-400/40 bg-amber-400/15 text-amber-100"
              : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          )}
          onClick={() => setTab("voice")}
        >
          LLM staging (not audio)
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
      ) : tab === "voice" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-5 backdrop-blur">
            <div className="text-sm font-medium text-amber-100">Real Moshi audio is not here</div>
            <p className="mt-2 text-sm text-slate-200">
              Kyutai Moshi full-duplex speech (mic → model → speaker) runs in the{" "}
              <strong className="text-slate-100">upstream Moshi browser UI</strong>, supervised from this dashboard.
              The controls below call <span className="font-mono text-xs">/api/voice/*</span> and only produce{" "}
              <strong className="text-slate-100">text</strong> via local Ollama/LM Studio (TTS-ready copy, no audio
              stream).
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <Link
                className="rounded-lg border border-amber-400/40 bg-amber-400/15 px-3 py-2 text-amber-100 hover:bg-amber-400/25"
                to="/moshi"
              >
                Open Talk with Moshi (audio)
              </Link>
              <Link className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-slate-200 hover:bg-white/15" to="/actions">
                Start/stop Moshi process
              </Link>
              <Link className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-slate-200 hover:bg-white/15" to="/settings">
                Moshi command &amp; URL
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="text-sm text-slate-400">LLM staging (API testbench)</div>
            <p className="mt-2 text-sm text-slate-300">
              Exercise <span className="font-mono text-xs">/api/voice/turn</span> and{" "}
              <span className="font-mono text-xs">/api/voice/speak_boilerplate</span> for scripted demos or automation.
              Optional pairing with Moshi: use this text as a script, or run research separately—still not a substitute
              for Moshi&apos;s neural audio stack.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10" onClick={() => usePreset("weather")}>
                Weather preset
              </button>
              <button type="button" className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10" onClick={() => usePreset("world_news")}>
                World news preset
              </button>
              <button type="button" className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10" onClick={() => usePreset("stock_market")}>
                Stock preset
              </button>
              <button type="button" className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10" onClick={() => usePreset("ai_news")}>
                AI news preset
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <div className="text-sm text-slate-400">Request</div>
              <div className="mt-3 space-y-3">
                <label className="block text-xs text-slate-500">
                  Mode
                  <select
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={voiceMode}
                    onChange={(e) => setVoiceMode(e.target.value as VoiceMode)}
                  >
                    <option value="turn">voice/turn (staged)</option>
                    <option value="boilerplate">voice/speak_boilerplate</option>
                  </select>
                </label>

                <label className="block text-xs text-slate-500">
                  Provider
                  <select
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    value={voiceProvider}
                    onChange={(e) => setVoiceProvider(e.target.value as VoiceProvider)}
                  >
                    <option value="auto">auto</option>
                    <option value="ollama">ollama</option>
                    <option value="lmstudio">lmstudio</option>
                  </select>
                </label>

                <ModelSelect
                  label="Model"
                  provider={voiceProvider}
                  value={voiceModel}
                  models={voiceModelsFor}
                  onChange={setVoiceModel}
                />

                {voiceMode === "turn" ? (
                  <>
                    <label className="block text-xs text-slate-500">
                      Session ID
                      <input
                        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={voiceSessionId}
                        onChange={(e) => setVoiceSessionId(e.target.value)}
                      />
                    </label>
                    <label className="block text-xs text-slate-500">
                      Utterance
                      <textarea
                        className="mt-1 h-28 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={voiceUtterance}
                        onChange={(e) => setVoiceUtterance(e.target.value)}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="block text-xs text-slate-500">
                      Topic
                      <select
                        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={voiceTopic}
                        onChange={(e) => setVoiceTopic(e.target.value as VoiceTopic)}
                      >
                        <option value="weather">weather</option>
                        <option value="world_news">world_news</option>
                        <option value="stock_market">stock_market</option>
                        <option value="ai_news">ai_news</option>
                      </select>
                    </label>
                    <label className="block text-xs text-slate-500">
                      Location
                      <input
                        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={voiceLocation}
                        onChange={(e) => setVoiceLocation(e.target.value)}
                      />
                    </label>
                    <label className="block text-xs text-slate-500">
                      Symbols (comma-separated)
                      <input
                        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={voiceSymbols}
                        onChange={(e) => setVoiceSymbols(e.target.value)}
                      />
                    </label>
                    <label className="block text-xs text-slate-500">
                      Style
                      <select
                        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                        value={voiceStyle}
                        onChange={(e) => setVoiceStyle(e.target.value as "brief" | "normal" | "detailed")}
                      >
                        <option value="brief">brief</option>
                        <option value="normal">normal</option>
                        <option value="detailed">detailed</option>
                      </select>
                    </label>
                  </>
                )}

                <button
                  type="button"
                  className="w-full rounded-lg border border-white/10 bg-amber-400/10 px-3 py-2 text-sm text-amber-200 hover:bg-amber-400/15 disabled:opacity-50"
                  disabled={voiceBusy}
                  onClick={runVoice}
                >
                  {voiceBusy ? "Running..." : "Run voice workflow"}
                </button>
              </div>
            </div>

            <div className="space-y-4 lg:col-span-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="text-sm text-slate-400">Result</div>
                {voiceError ? (
                  <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">
                    {voiceError}
                  </div>
                ) : voiceResult ? (
                  <pre className="mt-3 max-h-[420px] overflow-auto rounded-lg border border-white/10 bg-slate-950/30 p-3 text-xs text-slate-200">
                    {JSON.stringify(voiceResult, null, 2)}
                  </pre>
                ) : (
                  <div className="mt-3 text-slate-500">Run a staged turn or boilerplate request.</div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="text-sm text-slate-400">Workflow metadata</div>
                {voiceWorkflow ? (
                  <pre className="mt-3 max-h-[280px] overflow-auto rounded-lg border border-white/10 bg-slate-950/30 p-3 text-xs text-slate-300">
                    {JSON.stringify(voiceWorkflow, null, 2)}
                  </pre>
                ) : (
                  <div className="mt-3 text-slate-500">Open this tab to load `/api/voice/workflows` metadata.</div>
                )}
              </div>
            </div>
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
