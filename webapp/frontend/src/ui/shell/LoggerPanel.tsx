import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../cn";

export type LogLevel = "DEBUG" | "INFO" | "SOTA-WARN" | "ERROR";

export type LogEntry = {
  ts: number;
  level: LogLevel;
  message: string;
};

function levelClass(level: LogLevel) {
  if (level === "ERROR") return "text-rose-200";
  if (level === "SOTA-WARN") return "text-amber-200";
  if (level === "DEBUG") return "text-slate-300";
  return "text-emerald-200";
}

export function LoggerPanel(props: { logs: LogEntry[]; onClear: () => void }) {
  const [open, setOpen] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const lines = useMemo(() => props.logs.slice(-500), [props.logs]);

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length, autoScroll]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < 20;
    setAutoScroll(nearBottom);
  };

  return (
    <div className="border-t border-white/10 bg-slate-950/60 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide logs" : "Show logs"}
          </button>
          <button
            type="button"
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
            onClick={() => setAutoScroll((v) => !v)}
          >
            Auto-scroll: {autoScroll ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
            onClick={props.onClear}
          >
            Clear
          </button>
        </div>
        <div className="text-xs text-slate-400">{lines.length} entries</div>
      </div>

      <div className={cn("transition-all", open ? "h-44" : "h-0 overflow-hidden")}>
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="h-44 overflow-auto px-4 pb-3 font-mono text-xs"
        >
          {lines.length === 0 ? (
            <div className="pt-2 text-slate-500">No logs yet.</div>
          ) : (
            lines.map((l, idx) => (
              <div key={idx} className={cn("pt-1", levelClass(l.level))}>
                <span className="text-slate-500">
                  {new Date(l.ts).toLocaleTimeString()}
                </span>{" "}
                <span className="text-slate-400">[{l.level}]</span> {l.message}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

