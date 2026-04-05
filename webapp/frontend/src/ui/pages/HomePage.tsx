import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AudioWaveform,
  Bot,
  Cloud,
  HelpCircle,
  LayoutGrid,
  Mic2,
  Newspaper,
  PlayCircle,
  Radio,
  ScrollText,
  Settings,
  Shield,
  TrendingUp,
  Wrench,
  Zap,
} from "lucide-react";

/* ---------- types ---------- */

type HealthStatus = { ok: boolean };
type MoshiStatus = {
  running: boolean;
  http_probe?: { ok: boolean | null };
};
type GlomStatus = {
  healthy_any: boolean;
  preferred_provider?: string;
};

/* ---------- Waveform visual ---------- */

function WaveformIndicator({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-[3px] h-6">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`waveform-bar ${active ? "bg-violet-400" : "bg-slate-600"}`}
          style={!active ? { animation: "none", height: 8 } : undefined}
        />
      ))}
    </div>
  );
}

/* ---------- service status chips ---------- */

function StatusChip({
  label,
  ok,
  loading,
}: {
  label: string;
  ok: boolean | null;
  loading: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
        loading
          ? "bg-slate-800 text-slate-400"
          : ok
            ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
            : "bg-rose-500/10 text-rose-300 border border-rose-500/20"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          loading
            ? "bg-slate-500 animate-pulse"
            : ok
              ? "bg-emerald-400 animate-pulse"
              : "bg-rose-400"
        }`}
      />
      {label}
    </span>
  );
}

/* ---------- feature card ---------- */

interface FeatureCard {
  to: string;
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
  badge?: string;
}

function FeatureCardComponent({ card }: { card: FeatureCard }) {
  const Icon = card.icon;
  return (
    <Link to={card.to} className="glass-card group rounded-2xl p-5 block">
      <div className="flex items-start justify-between">
        <div
          className={`rounded-xl p-2.5 ${card.color} transition-transform group-hover:scale-110`}
        >
          <Icon className="h-5 w-5" />
        </div>
        {card.badge && (
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
            {card.badge}
          </span>
        )}
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-100">
        {card.title}
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
        {card.description}
      </p>
    </Link>
  );
}

/* ---------- workflow cards ---------- */

const WORKFLOWS = [
  {
    icon: Cloud,
    title: "Weather Briefing",
    body: "Get a spoken forecast for any city, powered by Open-Meteo live data.",
    action: "Try it →",
    to: "/voice",
    gradient: "from-sky-500/10 to-blue-600/10",
  },
  {
    icon: Newspaper,
    title: "News Digest",
    body: "Hear the latest world & AI news compiled from live RSS feeds.",
    action: "Listen now →",
    to: "/voice",
    gradient: "from-amber-500/10 to-orange-600/10",
  },
  {
    icon: TrendingUp,
    title: "Market Snapshot",
    body: "Stock market overview for S&P 500, NASDAQ, and custom tickers.",
    action: "Check markets →",
    to: "/voice",
    gradient: "from-emerald-500/10 to-green-600/10",
  },
  {
    icon: Shield,
    title: "Persona Proxy",
    body: "Give Moshi a personality. Intercept speech tokens and augment with your custom persona.",
    action: "Configure →",
    to: "/voice",
    gradient: "from-violet-500/10 to-purple-600/10",
  },
];

/* ---------- main page ---------- */

export function HomePage() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [moshi, setMoshi] = useState<MoshiStatus | null>(null);
  const [glom, setGlom] = useState<GlomStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const [hRes, mRes, gRes] = await Promise.allSettled([
          fetch("/api/health").then((r) => r.json() as Promise<HealthStatus>),
          fetch("/api/moshi/service/status").then((r) => r.json() as Promise<MoshiStatus>),
          fetch("/api/glom/status").then((r) => r.json() as Promise<GlomStatus>),
        ]);
        setBackendOk(
          hRes.status === "fulfilled" ? Boolean(hRes.value.ok) : false
        );
        setMoshi(mRes.status === "fulfilled" ? mRes.value : null);
        setGlom(gRes.status === "fulfilled" ? gRes.value : null);
      } catch {
        setBackendOk(false);
      } finally {
        setLoading(false);
      }
    };
    void run();
    const interval = setInterval(run, 12000);
    return () => clearInterval(interval);
  }, []);

  const moshiOnline = moshi?.running && moshi?.http_probe?.ok;
  const glomOnline = glom?.healthy_any;

  const FEATURES: FeatureCard[] = [
    {
      to: "/voice",
      icon: AudioWaveform,
      title: "Voice Pipeline",
      description:
        "Talk to Moshi with staged responses — quick acknowledgment, intent detection, deep research, and spoken answers.",
      color: "bg-violet-500/15 text-violet-300",
      badge: "Core",
    },
    {
      to: "/moshi",
      icon: Mic2,
      title: "Talk with Moshi",
      description:
        "Open the real-time Moshi speech interface. Full-duplex conversation — just speak and listen.",
      color: "bg-amber-500/15 text-amber-300",
    },
    {
      to: "/chat",
      icon: Bot,
      title: "Chat Console",
      description:
        "Text-based chat with your local AI models. Auto-routes to Ollama or LM Studio.",
      color: "bg-sky-500/15 text-sky-300",
    },
    {
      to: "/actions",
      icon: PlayCircle,
      title: "Quick Actions",
      description:
        "One-click operations: start Moshi, check services, run diagnostics.",
      color: "bg-emerald-500/15 text-emerald-300",
    },
    {
      to: "/tools",
      icon: Wrench,
      title: "MCP Tools",
      description:
        "Browse and execute moshi_ops and voice_pipeline operations directly.",
      color: "bg-rose-500/15 text-rose-300",
    },
    {
      to: "/status",
      icon: Activity,
      title: "System Status",
      description:
        "Live health dashboard — backend, Moshi, local LLM providers, and proxy state.",
      color: "bg-cyan-500/15 text-cyan-300",
    },
    {
      to: "/apps",
      icon: LayoutGrid,
      title: "Apps & Discovery",
      description:
        "Glama manifest, MCP catalog, and fleet discovery metadata.",
      color: "bg-orange-500/15 text-orange-300",
    },
    {
      to: "/logs",
      icon: ScrollText,
      title: "Session Logger",
      description:
        "Browser-side trace of voice turns, chat events, and API calls.",
      color: "bg-pink-500/15 text-pink-300",
    },
    {
      to: "/settings",
      icon: Settings,
      title: "Settings",
      description: "Configure Moshi service, proxy, and provider preferences.",
      color: "bg-slate-400/15 text-slate-300",
    },
    {
      to: "/help",
      icon: HelpCircle,
      title: "Help & Guide",
      description:
        "Complete reference: voice workflows, API routes, troubleshooting.",
      color: "bg-indigo-500/15 text-indigo-300",
    },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* ── Hero section ── */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 hero-gradient animate-fade-in-up">
        <div className="relative z-10 px-8 py-10 md:px-12 md:py-14">
          <div className="flex items-center gap-4 mb-6">
            <div className="rounded-2xl bg-violet-500/15 p-3 glow-card">
              <Radio className="h-8 w-8 text-violet-400" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-violet-300/80 font-medium">
                Voice AI Platform
              </div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">
                Kyutai Moshi
              </h1>
            </div>
          </div>

          <p className="max-w-2xl text-base leading-relaxed text-slate-300 md:text-lg">
            Your local voice assistant powered by{" "}
            <strong className="text-white font-medium">Moshi</strong> — a
            real-time, full-duplex speech model. Ask questions, get briefings,
            or just have a conversation. No cloud required.
          </p>

          {/* CTA buttons */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/voice"
              className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-500 hover:shadow-violet-500/30"
            >
              <AudioWaveform className="h-4 w-4" />
              Open Voice Pipeline
            </Link>
            <Link
              to="/moshi"
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
            >
              <Mic2 className="h-4 w-4" />
              Talk to Moshi
            </Link>
            <Link
              to="/chat"
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
            >
              <Bot className="h-4 w-4" />
              Chat Console
            </Link>
          </div>
        </div>

        {/* decorative waveform */}
        <div className="absolute right-8 bottom-8 opacity-30 hidden lg:flex items-end gap-1">
          <WaveformIndicator active={!!moshiOnline} />
        </div>
      </section>

      {/* ── Live status bar ── */}
      <section className="animate-fade-in-up animate-delay-100">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-3 backdrop-blur">
          <span className="mr-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            System
          </span>
          <StatusChip label="Backend" ok={backendOk} loading={loading} />
          <StatusChip
            label={`Moshi ${moshiOnline ? "online" : moshi?.running ? "starting" : "offline"}`}
            ok={moshiOnline ?? false}
            loading={loading}
          />
          <StatusChip
            label={`AI ${glomOnline ? (glom?.preferred_provider ?? "ready") : "no model"}`}
            ok={glomOnline ?? false}
            loading={loading}
          />
          <div className="hidden sm:flex flex-1" />
          <Link
            to="/status"
            className="text-xs text-slate-500 hover:text-slate-300 transition"
          >
            Full status →
          </Link>
        </div>
      </section>

      {/* ── Quick workflows ── */}
      <section className="animate-fade-in-up animate-delay-200">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Quick Workflows
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {WORKFLOWS.map((wf) => {
            const Icon = wf.icon;
            return (
              <Link
                key={wf.title}
                to={wf.to}
                className={`group rounded-2xl border border-white/8 bg-gradient-to-br ${wf.gradient} p-5 transition hover:border-white/15 hover:scale-[1.02]`}
              >
                <Icon className="h-5 w-5 text-slate-300 mb-3" />
                <h3 className="text-sm font-semibold text-white">
                  {wf.title}
                </h3>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                  {wf.body}
                </p>
                <span className="mt-3 inline-block text-xs font-medium text-violet-300 group-hover:text-violet-200 transition">
                  {wf.action}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Feature grid ── */}
      <section className="animate-fade-in-up animate-delay-300">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
          All Features
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {FEATURES.map((card) => (
            <FeatureCardComponent key={card.title} card={card} />
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="animate-fade-in-up animate-delay-400">
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 md:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-5">
            How the Voice Pipeline Works
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                step: "1",
                title: "You speak",
                desc: "Type or speak your question in natural language.",
              },
              {
                step: "2",
                title: "Quick acknowledgment",
                desc: "Moshi instantly responds so you know it's listening.",
              },
              {
                step: "3",
                title: "Intent detection",
                desc: "Weather? News? Stocks? The system figures out what you need.",
              },
              {
                step: "4",
                title: "Live research",
                desc: "Fetches real-time data from weather APIs, RSS feeds, or financial sources.",
              },
              {
                step: "5",
                title: "Spoken answer",
                desc: "Your local AI synthesizes a clear, natural response.",
              },
            ].map((s) => (
              <div key={s.step} className="flex gap-3">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-violet-500/15 flex items-center justify-center text-xs font-bold text-violet-300">
                  {s.step}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-200">
                    {s.title}
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer info ── */}
      <footer className="animate-fade-in animate-delay-500 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-3">
            <span>kyutai-mcp v0.2.0</span>
            <span>·</span>
            <span>FastMCP 3.1+</span>
            <span>·</span>
            <span>Ports 10924 / 10925 / 10926</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/help" className="hover:text-slate-400 transition">Help & Docs</Link>
            <span>·</span>
            <a
              href="https://github.com/kyutai-labs/moshi"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-400 transition"
            >
              Moshi on GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
