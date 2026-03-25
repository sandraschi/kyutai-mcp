import { useEffect, useMemo, useRef, useState } from "react";
import { useLogs } from "../log/LogContext";
import { cn } from "../cn";
import type { LogLevel } from "../shell/LoggerPanel";

function levelClass(level: LogLevel) {
  if (level === "ERROR") return "text-rose-200";
  if (level === "SOTA-WARN") return "text-amber-200";
  if (level === "DEBUG") return "text-slate-300";
  return "text-emerald-200";
}

const LEVELS: LogLevel[] = ["DEBUG", "INFO", "SOTA-WARN", "ERROR"];

export function LoggerPage() {
  const { logs, clear } = useLogs();
  const [query, setQuery] = useState("");
  const [levels, setLevels] = useState<Record<LogLevel, boolean>>({
    DEBUG: true,
    INFO: true,
    "SOTA-WARN": true,
    ERROR: true
  });
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < 24;
    setAutoScroll(nearBottom);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((l) => {
      if (!levels[l.level]) return false;
      if (!q) return true;
      return l.message.toLowerCase().includes(q);
    });
  }, [logs, query, levels]);

  const textExport = useMemo(
    () =>
      filtered
        .map(
          (l) =>
            `${new Date(l.ts).toISOString()} [${l.level}] ${l.message}`
        )
        .join("\n"),
    [filtered]
  );

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(textExport);
    } catch {
      // ignore
    }
  };

  const toggleLevel = (lv: LogLevel) => {
    setLevels((prev) => ({ ...prev, [lv]: !prev[lv] }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <h2 className="text-xl font-semibold">Session logger</h2>
        <p className="mt-2 text-sm text-slate-400">
          Client-side trace from this browser session: Chat refine flow, and anything else that writes to the shared
          log buffer. For Moshi process stdout/stderr, use Status or the backend log file path shown there.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            type="search"
            placeholder="Filter messages…"
            className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400/30"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            onClick={() => setAutoScroll((v) => !v)}
          >
            Auto-scroll: {autoScroll ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            onClick={copyAll}
          >
            Copy filtered
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100 hover:bg-rose-400/15"
            onClick={clear}
          >
            Clear session
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {LEVELS.map((lv) => (
            <button
              key={lv}
              type="button"
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                levels[lv]
                  ? "border-amber-400/40 bg-amber-400/15 text-amber-100"
                  : "border-white/10 bg-white/5 text-slate-500"
              )}
              onClick={() => toggleLevel(lv)}
            >
              {lv}
            </button>
          ))}
        </div>
      </section>

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-slate-950/40">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs text-slate-400">
          <span>
            Showing {filtered.length} of {logs.length} entries (session cap 2000)
          </span>
        </div>
        <div
          ref={scrollerRef}
          className="min-h-[50vh] flex-1 overflow-auto p-4 font-mono text-xs"
          onScroll={onScroll}
        >
          {filtered.length === 0 ? (
            <div className="text-slate-500">No log lines match. Use Chat (Ctrl+K) to generate entries.</div>
          ) : (
            filtered.map((l, idx) => (
              <div key={`${l.ts}-${idx}`} className={cn("py-0.5", levelClass(l.level))}>
                <span className="text-slate-500">{new Date(l.ts).toLocaleTimeString()}</span>{" "}
                <span className="text-slate-400">[{l.level}]</span> {l.message}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
