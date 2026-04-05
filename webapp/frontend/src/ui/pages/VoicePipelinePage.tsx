import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  AudioWaveform,
  ChevronRight,
  Cloud,
  Loader2,
  Mic2,
  Newspaper,
  Send,
  TrendingUp,
  Zap,
  Radio,
  Power,
  PowerOff,
  ScrollText,
} from "lucide-react";
import { cn } from "../cn";

/* ---------- types ---------- */

type WorkflowStep = string;

interface VoiceTurnResult {
  ok?: boolean;
  intent: string;
  quick_ack?: string;
  response: string;
  workflow_steps?: WorkflowStep[];
  research_data?: any;
  sources?: { name: string; url: string }[];
  requires_clarification?: boolean;
  provider?: string;
  model?: string;
}

interface SessionSummary {
  session_id: string;
  turn_count: number;
  last_activity_ms: number | null;
}

interface TurnRecord {
  timestamp_ms: number;
  utterance: string;
  intent: string;
  response: string;
}

/* ---------- API helpers ---------- */

const API = "http://127.0.0.1:10924";

async function apiVoiceTurn(body: {
  session_id: string;
  utterance: string;
  provider: string;
  use_deep_reasoner: boolean;
}): Promise<VoiceTurnResult> {
  const r = await fetch(`${API}/api/voice/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiSpeakBoilerplate(body: {
  topic: string;
  provider: string;
  style: string;
  location?: string;
}): Promise<any> {
  const r = await fetch(`${API}/api/voice/speak_boilerplate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiSessions(): Promise<{ sessions: SessionSummary[] }> {
  try {
    const r = await fetch(`${API}/api/voice/sessions`);
    if (r.ok) return r.json();
  } catch {}
  return { sessions: [] };
}

async function apiSessionHistory(
  sid: string
): Promise<{ turns: TurnRecord[] }> {
  const r = await fetch(
    `${API}/api/voice/sessions/${encodeURIComponent(sid)}/history`
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiProxyStatus() {
  const r = await fetch(`${API}/api/moshi/proxy/status`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiProxyStart(persona: string, provider: string) {
  const r = await fetch(`${API}/api/moshi/proxy/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      persona: persona || "You are a helpful assistant.",
      provider: provider === "auto" ? null : provider,
    }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiProxyStop() {
  const r = await fetch(`${API}/api/moshi/proxy/stop`, { method: "POST" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiProxyTranscript() {
  const r = await fetch(`${API}/api/moshi/proxy/transcript`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiMoshiStatus(): Promise<any> {
  const r = await fetch(`${API}/api/moshi/service/status`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* ---------- small components ---------- */

function WorkflowSteps({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs text-slate-400">
      {steps.map((s, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 text-slate-600" />}
          <span
            className={cn(
              "rounded-full px-2 py-0.5",
              i === steps.length - 1
                ? "bg-emerald-400/10 text-emerald-300"
                : "bg-white/5 text-slate-400"
            )}
          >
            {s}
          </span>
        </span>
      ))}
    </div>
  );
}

function MoshiServiceBadge() {
  const [status, setStatus] = useState<{
    running: boolean;
    http_probe: { ok: boolean | null; detail: string | null };
  } | null>(null);

  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const s = await apiMoshiStatus();
        if (live) setStatus(s);
      } catch {
        if (live) setStatus(null);
      }
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  if (!status)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs text-slate-400">
        <span className="h-2 w-2 rounded-full bg-slate-600" /> Moshi unknown
      </span>
    );

  const running = status.running && status.http_probe?.ok;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs",
        running
          ? "bg-emerald-400/10 text-emerald-300"
          : "bg-amber-400/10 text-amber-300"
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          running ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
        )}
      />
      Moshi {running ? "online" : status.running ? "starting…" : "offline"}
    </span>
  );
}

/* ---------- boilerplate topics ---------- */

const TOPICS = [
  { id: "weather", label: "Weather", icon: Cloud },
  { id: "world_news", label: "World News", icon: Newspaper },
  { id: "ai_news", label: "AI News", icon: Zap },
  { id: "stock_market", label: "Stocks", icon: TrendingUp },
] as const;

/* ---------- main page ---------- */

export function VoicePipelinePage() {
  /* top-level provider */
  const [provider, setProvider] = useState<"auto" | "ollama" | "lmstudio">(
    "auto"
  );

  /* voice turn state */
  const [utterance, setUtterance] = useState("");
  const [sessionId, setSessionId] = useState("default");
  const [turnResult, setTurnResult] = useState<VoiceTurnResult | null>(null);
  const [turnLoading, setTurnLoading] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);

  /* boilerplate state */
  const [bpTopic, setBpTopic] = useState("weather");
  const [bpStyle, setBpStyle] = useState<"brief" | "normal" | "detailed">(
    "normal"
  );
  const [bpLocation, setBpLocation] = useState("Vienna");
  const [bpResult, setBpResult] = useState<any>(null);
  const [bpLoading, setBpLoading] = useState(false);
  const [bpError, setBpError] = useState<string | null>(null);

  /* proxy state */
  const [proxyStatus, setProxyStatus] = useState<any>(null);
  const [personaPrompt, setPersonaPrompt] = useState(
    "You are Kyutai, a sarcastic AI assistant running on a local desktop. Keep answers brief."
  );
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyError, setProxyError] = useState<string | null>(null);
  const [transcriptData, setTranscriptData] = useState<any>(null);

  /* sessions state */
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionTurns, setSessionTurns] = useState<TurnRecord[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  /* load sessions */
  const refreshSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const d = await apiSessions();
      setSessions(d.sessions ?? []);
    } catch {
      /* ignore */
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  /* load proxy status */
  const refreshProxy = useCallback(async () => {
    try {
      const st = await apiProxyStatus();
      setProxyStatus(st);
    } catch {}
  }, []);

  useEffect(() => {
    refreshSessions();
    refreshProxy();
    const id = setInterval(refreshProxy, 5000);
    return () => clearInterval(id);
  }, [refreshSessions, refreshProxy]);

  /* load session history */
  useEffect(() => {
    if (!selectedSession) {
      setSessionTurns([]);
      return;
    }
    let live = true;
    apiSessionHistory(selectedSession).then((d) => {
      if (live) setSessionTurns(d.turns ?? []);
    });
    return () => {
      live = false;
    };
  }, [selectedSession]);

  /* send voice turn */
  const sendTurn = async () => {
    if (!utterance.trim()) return;
    setTurnLoading(true);
    setTurnError(null);
    try {
      const r = await apiVoiceTurn({
        session_id: sessionId,
        utterance: utterance.trim(),
        provider,
        use_deep_reasoner: true,
      });
      setTurnResult(r);
      setUtterance("");
      refreshSessions();
      if (selectedSession === sessionId) {
        apiSessionHistory(sessionId).then((d) =>
          setSessionTurns(d.turns ?? [])
        );
      }
    } catch (e: any) {
      setTurnError(e.message ?? "Unknown error");
    } finally {
      setTurnLoading(false);
    }
  };

  /* send boilerplate */
  const sendBoilerplate = async () => {
    setBpLoading(true);
    setBpError(null);
    try {
      const r = await apiSpeakBoilerplate({
        topic: bpTopic,
        provider,
        style: bpStyle,
        location: bpLocation,
      });
      setBpResult(r);
    } catch (e: any) {
      setBpError(e.message ?? "Unknown error");
    } finally {
      setBpLoading(false);
    }
  };

  /* proxy controls */
  const toggleProxy = async () => {
    setProxyLoading(true);
    setProxyError(null);
    try {
      if (proxyStatus?.is_running) {
        await apiProxyStop();
      } else {
        await apiProxyStart(personaPrompt, provider);
      }
      await refreshProxy();
    } catch (e: any) {
      setProxyError(e.message ?? "Failed to toggle proxy");
    } finally {
      setProxyLoading(false);
    }
  };

  const loadTranscript = async () => {
    try {
      const t = await apiProxyTranscript();
      setTranscriptData(t);
    } catch (e: any) {
      setProxyError(e.message ?? "Failed to load transcript");
    }
  };

  return (
    <div className="grid h-full gap-6 lg:grid-cols-[1fr_320px]">
      {/* ---------- left column ---------- */}
      <div className="flex min-w-0 flex-col gap-6 overflow-auto pr-2 pb-6">
        {/* header row */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-violet-500/10 p-2">
              <AudioWaveform className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Voice Operations</h2>
              <div className="text-xs text-slate-400 mt-0.5">
                Staged voice pipeline, boilerplate generation, and Moshi Proxy.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
              Provider routing:
              <select
                className="bg-transparent text-slate-200 outline-none"
                value={provider}
                onChange={(e) =>
                  setProvider(e.target.value as "auto" | "ollama" | "lmstudio")
                }
              >
                <option value="auto">Auto</option>
                <option value="ollama">Ollama</option>
                <option value="lmstudio">LM Studio</option>
              </select>
            </label>
            <MoshiServiceBadge />
          </div>
        </div>

        {/* ---------- Persona Proxy Panel ---------- */}
        <section className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 p-6 backdrop-blur">
          <div className="flex items-center justify-between mb-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-violet-300">
              <Radio className="h-4 w-4" /> Persona Proxy
            </h3>
            {proxyStatus?.is_running && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active on port {proxyStatus.port}
              </span>
            )}
          </div>

          <p className="text-sm text-slate-300 mb-4 max-w-3xl">
            Inject personality into the upstream Moshi service. The proxy intercepts incoming transcription text events from Moshi, routes them to the selected local provider, and augments Moshi's behavior in real-time.
          </p>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">
                Persona System Prompt
              </label>
              <textarea
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                rows={2}
                value={personaPrompt}
                onChange={(e) => setPersonaPrompt(e.target.value)}
                disabled={proxyStatus?.is_running || proxyLoading}
                placeholder="You are a helpful assistant..."
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={toggleProxy}
                disabled={proxyLoading}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition",
                  proxyLoading
                    ? "cursor-wait opacity-70"
                    : proxyStatus?.is_running
                    ? "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30"
                    : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30 glow-card"
                )}
              >
                {proxyLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : proxyStatus?.is_running ? (
                  <PowerOff className="h-4 w-4" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
                {proxyStatus?.is_running ? "Stop Proxy" : "Start Persona Proxy"}
              </button>

              {proxyStatus?.is_running && (
                <button
                  type="button"
                  onClick={loadTranscript}
                  className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10"
                >
                  <ScrollText className="h-4 w-4" />
                  View Transcript
                </button>
              )}
            </div>

            {proxyError && (
              <p className="flex items-center gap-2 text-sm text-rose-400">
                <AlertCircle className="h-4 w-4" /> {proxyError}
              </p>
            )}

            {/* Transcript view */}
            {transcriptData && proxyStatus?.is_running && (
              <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-4 max-h-64 overflow-y-auto">
                <h4 className="text-xs font-semibold uppercase text-slate-500 mb-3 border-b border-white/5 pb-2">
                  Live Transcript ({transcriptData.turns} turns captured)
                </h4>
                {transcriptData.transcript?.length > 0 ? (
                  <div className="space-y-3">
                    {transcriptData.transcript.map((item: any, idx: number) => (
                      <div key={idx} className="text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            item.role === "assistant" ? "bg-amber-500/20 text-amber-300" : "bg-sky-500/20 text-sky-300"
                          )}>
                            {item.role}
                          </span>
                          <span className="text-[10px] text-slate-500">{new Date(item.timestamp * 1000).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-slate-200 pl-1 border-l-2 border-white/10">{item.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 italic">No conversation captured yet.</p>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          {/* ---------- Voice Turn Panel ---------- */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur glass-card">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
              <Mic2 className="h-4 w-4" /> Staged Voice Turn
            </h3>

            <div className="space-y-4">
              <label className="block text-xs font-medium text-slate-400">
                Session ID
                <input
                  id="voice-session-id"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-500"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value || "default")}
                />
              </label>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Utterance Text
                </label>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    id="voice-utterance-input"
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-shadow"
                    placeholder="e.g. 'what is the weather in Vienna?'"
                    value={utterance}
                    onChange={(e) => setUtterance(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !turnLoading) sendTurn();
                    }}
                    disabled={turnLoading}
                  />
                  <button
                    id="voice-send-btn"
                    type="button"
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                      turnLoading
                        ? "cursor-wait bg-violet-500/20 text-violet-400"
                        : "bg-violet-600 text-white hover:bg-violet-500 shadow-lg shadow-violet-600/20 hover:shadow-violet-500/30"
                    )}
                    onClick={sendTurn}
                    disabled={turnLoading || !utterance.trim()}
                  >
                    {turnLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send
                  </button>
                </div>
              </div>

              {turnError && (
                <p className="flex items-center gap-2 text-sm text-rose-400">
                  <AlertCircle className="h-4 w-4" /> {turnError}
                </p>
              )}

              {turnResult && (
                <div className="rounded-xl border border-violet-500/10 bg-violet-500/5 p-4 animate-fade-in-up">
                  {turnResult.quick_ack && (
                    <p className="mb-2 text-xs italic text-slate-500">
                      quick ack: "{turnResult.quick_ack}"
                    </p>
                  )}
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-violet-500/20 px-2.5 py-0.5 text-xs font-medium text-violet-300">
                      Intent: {turnResult.intent}
                    </span>
                    {turnResult.provider && (
                      <span className="text-xs text-slate-500">
                        Synthesized by {turnResult.provider}
                        {turnResult.model ? ` / ${turnResult.model}` : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-slate-200 bg-black/20 p-3 rounded-lg">
                    {turnResult.response}
                  </p>
                  
                  {turnResult.workflow_steps && turnResult.workflow_steps.length > 0 && (
                    <div className="mt-3">
                      <WorkflowSteps steps={turnResult.workflow_steps} />
                    </div>
                  )}
                  
                  {turnResult.sources && turnResult.sources.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {turnResult.sources.map((s, i) => (
                        <a
                          key={i}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-[10px] text-slate-300 hover:bg-slate-700 hover:text-white transition"
                        >
                          <Cloud className="h-3 w-3" />
                          {s.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ---------- Boilerplate Panel ---------- */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur glass-card">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
              <Zap className="h-4 w-4" /> Agentic Briefings
            </h3>
            
            <p className="text-xs text-slate-400 mb-4">
              Generate topical briefings (news, weather, markets) using live tools, pre-formatted for text-to-speech engines.
            </p>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={cn(
                        "flex flex-1 min-w-[100px] items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm transition-all",
                        bpTopic === t.id
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                          : "border-white/10 bg-black/40 text-slate-300 hover:bg-white/10"
                      )}
                      onClick={() => setBpTopic(t.id)}
                    >
                      <Icon className="h-4 w-4 mb-0.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                {bpTopic === "weather" && (
                  <label className="flex-1 block text-xs font-medium text-slate-400">
                    Location
                    <input
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 outline-none focus:border-amber-500"
                      value={bpLocation}
                      onChange={(e) => setBpLocation(e.target.value)}
                    />
                  </label>
                )}
                <label className="flex-1 block text-xs font-medium text-slate-400">
                  Style
                  <select
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 outline-none focus:border-amber-500"
                    value={bpStyle}
                    onChange={(e) =>
                      setBpStyle(e.target.value as "brief" | "normal" | "detailed")
                    }
                  >
                    <option value="brief">Brief highlight</option>
                    <option value="normal">Standard detail</option>
                    <option value="detailed">In-depth report</option>
                  </select>
                </label>
              </div>

              <button
                type="button"
                className={cn(
                  "w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition",
                  bpLoading
                    ? "cursor-wait bg-amber-500/10 text-amber-500/50 hidden"
                    : "bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25"
                )}
                onClick={sendBoilerplate}
                disabled={bpLoading}
              >
                {bpLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                {bpLoading ? "Generating Briefing..." : "Generate Briefing"}
              </button>

              {bpError && (
                <p className="flex items-center gap-2 text-sm text-rose-400">
                  <AlertCircle className="h-4 w-4" /> {bpError}
                </p>
              )}

              {bpResult && (
                <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 p-4 animate-fade-in-up">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-300">
                      {bpResult.topic}
                    </span>
                    <span className="text-xs text-slate-500">
                      {bpResult.style} format · {bpResult.provider}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-200 bg-black/20 p-3 rounded-lg italic">
                    {bpResult.spoken_text}
                  </p>
                  
                  {bpResult.sources && bpResult.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-amber-500/10 flex flex-wrap gap-2">
                      <span className="text-[10px] uppercase text-slate-500 w-full mb-1">Live data sources used:</span>
                      {bpResult.sources.map((s: any, i: number) => (
                        <a
                          key={i}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 rounded border border-white/5 bg-black/40 px-2 py-1 text-[10px] text-slate-400 hover:text-amber-200 transition"
                        >
                          {s.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ---------- right column: sessions ---------- */}
      <aside className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/30 p-5 backdrop-blur">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Sessions History
          </h3>
          <button
            type="button"
            className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-slate-300 transition"
            onClick={refreshSessions}
            disabled={sessionsLoading}
            title="Refresh sessions"
          >
            <Loader2 className={cn("h-4 w-4", sessionsLoading ? "animate-spin" : "hidden")} />
            {!sessionsLoading && <Activity className="h-4 w-4" />}
          </button>
        </div>

        {sessions.length === 0 && !sessionsLoading && (
          <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 text-center">
            <ScrollText className="h-6 w-6 text-slate-600 mb-2" />
            <p className="text-xs text-slate-500 max-w-[150px]">
              No sessions yet. Send a voice turn to start.
            </p>
          </div>
        )}

        <div className="flex-1 space-y-2 overflow-auto pr-1">
          {sessions.map((s) => (
            <button
              key={s.session_id}
              type="button"
              className={cn(
                "w-full rounded-xl border p-3 text-left transition-all",
                selectedSession === s.session_id
                  ? "border-violet-500/40 bg-violet-500/10 shadow-sm"
                  : "border-white/5 bg-black/20 hover:bg-white/5 hover:border-white/10"
              )}
              onClick={() =>
                setSelectedSession(
                  selectedSession === s.session_id ? null : s.session_id
                )
              }
            >
              <div className="flex items-center justify-between">
                <span className={cn(
                  "font-medium text-sm truncate",
                  selectedSession === s.session_id ? "text-violet-200" : "text-slate-300"
                )}>
                  {s.session_id}
                </span>
                <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                  {s.turn_count} turns
                </span>
              </div>
              {s.last_activity_ms && (
                <div className="mt-1.5 text-[10px] text-slate-500 flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  {new Date(s.last_activity_ms).toLocaleTimeString()}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* session turn history */}
        {selectedSession && sessionTurns.length > 0 && (
          <div className="flex-shrink-0 max-h-[40%] flex flex-col pt-3 border-t border-white/10 animate-fade-in">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 truncate">
              {selectedSession}
            </h4>
            <div className="space-y-3 overflow-auto pr-1 pb-1">
              {sessionTurns.map((t, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/5 bg-black/30 p-3 text-xs"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] uppercase font-bold text-violet-300">
                      {t.intent}
                    </span>
                    <span className="text-[10px] text-slate-600">
                      {new Date(t.timestamp_ms).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-white mb-2 pb-2 border-b border-white/5">
                    "{t.utterance}"
                  </p>
                  <p className="text-slate-400 leading-relaxed italic">
                    {t.response.slice(0, 100)}{t.response.length > 100 ? "..." : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
