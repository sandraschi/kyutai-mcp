import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

type MoshiConfig = {
  command: string;
  args: string[];
  cwd: string | null;
  http_url: string;
};

type MoshiStatus = {
  running?: boolean;
  http_probe?: { url?: string; ok?: boolean; detail?: string };
};

export function MoshiTalkPage() {
  const [cfg, setCfg] = useState<MoshiConfig | null>(null);
  const [st, setSt] = useState<MoshiStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    setErr(null);
    try {
      const [cRes, sRes] = await Promise.all([
        fetch("/api/moshi/service/config"),
        fetch("/api/moshi/service/status")
      ]);
      const cj = (await cRes.json()) as { ok?: boolean; config?: MoshiConfig };
      const sj = (await sRes.json()) as MoshiStatus & { config?: MoshiConfig };
      setCfg(sj.config ?? cj.config ?? null);
      setSt(sj);
    } catch (e) {
      setErr(String(e));
    }
  };

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(id);
  }, []);

  const url = cfg?.http_url?.trim() || "http://127.0.0.1:8998";
  const probe = st?.http_probe;
  const httpStatusFromDetail =
    probe?.detail?.startsWith("HTTP ") === true ? probe.detail.slice(5).trim() : null;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <h2 className="text-xl font-semibold">Talk with Moshi</h2>
        <p className="mt-2 text-sm text-slate-400">
          The upstream Moshi stack serves its own browser UI (mic, playback, session) on the configured HTTP URL.
          This page links to it and shows whether the probe sees the service. It is not a replacement for Moshi’s
          full-duplex audio pipeline.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            onClick={() => void refresh()}
          >
            Refresh status
          </button>
          <a
            className="inline-flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100 hover:bg-amber-400/15"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            Open Moshi UI <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </section>

      {err ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{err}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="text-sm text-slate-400">Probe</div>
          <div className="mt-3 space-y-2 text-sm text-slate-200">
            <div>
              HTTP URL: <span className="font-mono text-amber-100">{url}</span>
            </div>
            <div>
              Process:{" "}
              {st?.running ? (
                <span className="text-emerald-200">running</span>
              ) : (
                <span className="text-slate-400">not running</span>
              )}
            </div>
            <div>
              HTTP reachable:{" "}
              {probe?.ok ? <span className="text-emerald-200">yes</span> : <span className="text-rose-200">no</span>}
              {httpStatusFromDetail ? (
                <span className="text-slate-500"> ({httpStatusFromDetail})</span>
              ) : null}
            </div>
            {probe?.detail ? <div className="text-xs text-slate-500">{probe.detail}</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="text-sm text-slate-400">Embedded preview</div>
          <p className="mt-2 text-xs text-slate-500">
            Some Moshi builds send X-Frame-Options and cannot be embedded. If the frame stays blank, use “Open Moshi
            UI”.
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-slate-950/50">
            <iframe title="Moshi UI" className="h-[420px] w-full" src={url} />
          </div>
        </div>
      </div>
    </div>
  );
}
