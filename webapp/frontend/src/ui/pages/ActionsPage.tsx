import { useState } from "react";

type Ops = "status" | "local_viability" | "references" | "recommend_runtime";

type ActionCard = {
  id: string;
  title: string;
  description: string;
  operation: Ops;
};

const ACTIONS: ActionCard[] = [
  {
    id: "local-viability",
    title: "Local Viability Check",
    description: "Validate whether local GPU/runtime can run Moshi effectively.",
    operation: "local_viability"
  },
  {
    id: "runtime-recommend",
    title: "Runtime Recommendation",
    description: "Get a practical recommendation for Rust/CUDA vs research path.",
    operation: "recommend_runtime"
  },
  {
    id: "reference-pack",
    title: "Reference Pack",
    description: "Open upstream constraints and docs links for operations guidance.",
    operation: "references"
  },
  {
    id: "service-status",
    title: "Service Runtime Summary",
    description: "Inspect current service and platform metadata.",
    operation: "status"
  }
];

export function ActionsPage() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<object | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moshiStatus, setMoshiStatus] = useState<object | null>(null);

  const runAction = async (card: ActionCard) => {
    setBusyId(card.id);
    setError(null);
    try {
      const response = await fetch("/api/moshi/ops", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: card.operation, include_env: false })
      });
      const payload = (await response.json()) as { ok: boolean; result?: object; detail?: string };
      if (!payload.ok) {
        throw new Error(payload.detail ?? "Action failed");
      }
      setResult(payload.result ?? null);
    } catch (exc) {
      setError(String(exc));
    } finally {
      setBusyId(null);
    }
  };

  const moshiStart = async () => {
    setBusyId("moshi-start");
    setError(null);
    try {
      const response = await fetch("/api/moshi/service/start", { method: "POST" });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.detail ?? "Failed to start Moshi");
      setResult(payload);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const moshiStop = async () => {
    setBusyId("moshi-stop");
    setError(null);
    try {
      const response = await fetch("/api/moshi/service/stop", { method: "POST" });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.detail ?? "Failed to stop Moshi");
      setResult(payload);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const moshiRefresh = async () => {
    setBusyId("moshi-refresh");
    setError(null);
    try {
      const response = await fetch("/api/moshi/service/status");
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.detail ?? "Failed to read Moshi status");
      setMoshiStatus(payload);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <h2 className="text-xl font-semibold">Action Workbench</h2>
        <p className="mt-2 text-sm text-slate-400">
          Start/stop Moshi and run curated checks without hand-building every request.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm text-slate-400">Moshi listener/talker</div>
            <div className="mt-1 text-sm text-slate-200">
              This controls the upstream Moshi backend process. Configure it in Settings first.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={moshiRefresh}
              disabled={busyId !== null}
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
            >
              Refresh status
            </button>
            <button
              type="button"
              onClick={moshiStart}
              disabled={busyId !== null}
              className="rounded-lg border border-white/10 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-400/15 disabled:opacity-50"
            >
              Start Moshi
            </button>
            <button
              type="button"
              onClick={moshiStop}
              disabled={busyId !== null}
              className="rounded-lg border border-white/10 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/15 disabled:opacity-50"
            >
              Stop Moshi
            </button>
          </div>
        </div>
        {moshiStatus ? (
          <pre className="mt-3 overflow-auto rounded-lg border border-white/10 bg-slate-950/30 p-3 text-xs">
            {JSON.stringify(moshiStatus, null, 2)}
          </pre>
        ) : (
          <div className="mt-3 text-sm text-slate-500">No status yet. Click “Refresh status”.</div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {ACTIONS.map((card) => (
          <div key={card.id} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="text-base font-semibold">{card.title}</div>
            <div className="mt-2 text-sm text-slate-400">{card.description}</div>
            <button
              type="button"
              onClick={() => runAction(card)}
              disabled={busyId !== null}
              className="mt-4 rounded-lg border border-white/10 bg-amber-400/10 px-3 py-2 text-sm text-amber-200 hover:bg-amber-400/15 disabled:opacity-50"
            >
              {busyId === card.id ? "Running..." : "Run action"}
            </button>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <div className="text-sm text-slate-400">Action Result</div>
        {error ? (
          <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        ) : result ? (
          <pre className="mt-3 overflow-auto rounded-lg border border-white/10 bg-slate-950/30 p-3 text-xs">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : (
          <div className="mt-3 text-sm text-slate-500">Run an action to view output.</div>
        )}
      </section>
    </div>
  );
}

