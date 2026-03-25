import { useMemo, useState } from "react";
import { X } from "lucide-react";

type Persona = "reductionist" | "debugger" | "explainer";

export function ChatModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLog: (entry: { ts: number; level: "DEBUG" | "INFO" | "SOTA-WARN" | "ERROR"; message: string }) => void;
}) {
  const [persona, setPersona] = useState<Persona>("reductionist");
  const [prompt, setPrompt] = useState("");
  const [refined, setRefined] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canRefine = useMemo(() => prompt.trim().length > 0 && !busy, [prompt, busy]);

  const refine = async () => {
    setBusy(true);
    props.onLog({ ts: Date.now(), level: "INFO", message: "Refining prompt (provider=auto)" });
    try {
      const res = await fetch("/api/chat/refine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ persona, prompt, provider: "auto" })
      });
      const data = (await res.json()) as { ok: boolean; refined_prompt?: string };
      if (!data.ok || !data.refined_prompt) throw new Error("Refine failed");
      setRefined(data.refined_prompt);
      props.onLog({ ts: Date.now(), level: "DEBUG", message: "Refined prompt ready" });
    } catch (e) {
      props.onLog({ ts: Date.now(), level: "ERROR", message: String(e) });
    } finally {
      setBusy(false);
    }
  };

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur sm:items-center">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="text-sm font-semibold">SOTA Chat</div>
          <button
            type="button"
            className="rounded-md border border-white/10 bg-white/5 p-2 hover:bg-white/10"
            onClick={() => props.onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Persona</div>
            <select
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
              value={persona}
              onChange={(e) => setPersona(e.target.value as Persona)}
            >
              <option value="reductionist">Reductionist</option>
              <option value="debugger">Debugger</option>
              <option value="explainer">Explainer</option>
            </select>

            <div className="pt-2 text-xs text-slate-400">Prompt</div>
            <textarea
              className="h-40 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400/40"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What do you want to do?"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/10 bg-amber-400/10 px-3 py-2 text-sm text-amber-200 hover:bg-amber-400/15 disabled:opacity-50"
                onClick={refine}
                disabled={!canRefine}
              >
                Refine
              </button>
              <button
                type="button"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                onClick={() => {
                  setPrompt("");
                  setRefined(null);
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-slate-400">Refined prompt</div>
            <div className="min-h-[240px] rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
              {refined ? (
                <pre className="whitespace-pre-wrap break-words font-sans">{refined}</pre>
              ) : (
                <div className="text-slate-500">No refined prompt yet.</div>
              )}
            </div>
            <div className="text-xs text-slate-500">
              Tip: press Ctrl+K (or Cmd+K) to open this panel.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

