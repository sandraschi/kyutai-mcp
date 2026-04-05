import { useEffect, useMemo, useRef, useState } from "react";
import {
  type LlmProvider,
  type Persona,
  fetchDashboardSettings,
  fetchLlmModels,
  patchDashboardSettings,
} from "../../lib/dashboardSettings";
import { ModelSelect } from "../components/ModelSelect";

type ChatItem = {
  role: "user" | "assistant";
  text: string;
  meta?: string;
};

export function ChatPage() {
  const [persona, setPersona] = useState<Persona>("reductionist");
  const [provider, setProvider] = useState<LlmProvider>("auto");
  const [model, setModel] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [lmstudioModels, setLmstudioModels] = useState<string[]>([]);
  const settingsLoaded = useRef(false);

  const modelsFor = useMemo(
    () => (provider === "lmstudio" ? lmstudioModels : ollamaModels),
    [provider, ollamaModels, lmstudioModels],
  );

  useEffect(() => {
    void (async () => {
      try {
        const s = await fetchDashboardSettings();
        setPersona(s.chat_persona);
        setProvider(s.chat_provider);
        setModel(s.chat_model);
      } catch {
        // keep defaults
      } finally {
        settingsLoaded.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const [o, l] = await Promise.all([
        fetchLlmModels("ollama").catch(() => [] as string[]),
        fetchLlmModels("lmstudio").catch(() => [] as string[]),
      ]);
      setOllamaModels(o);
      setLmstudioModels(l);
    })();
  }, []);

  useEffect(() => {
    if (!settingsLoaded.current) return;
    const t = window.setTimeout(() => {
      void patchDashboardSettings({
        chat_persona: persona,
        chat_provider: provider,
        chat_model: model,
      }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(t);
  }, [persona, provider, model]);

  const canSend = useMemo(() => message.trim().length > 0 && !busy, [message, busy]);

  const send = async () => {
    if (!canSend) return;
    const user = message.trim();
    setItems((xs) => xs.concat({ role: "user", text: user }));
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          persona,
          provider,
          model,
          message: user,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        provider?: string;
        model?: string;
        response?: string;
        detail?: string;
      };
      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Chat request failed");
      }
      if (!payload.ok || typeof payload.response !== "string") {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Chat request failed");
      }
      const answer = payload.response;
      const usedProvider = payload.provider ?? "";
      const usedModel = payload.model ?? "";
      setItems((xs) =>
        xs.concat({
          role: "assistant",
          text: answer,
          meta: `provider=${usedProvider}, model=${usedModel}`,
        }),
      );
    } catch (exc) {
      setItems((xs) =>
        xs.concat({
          role: "assistant",
          text: `Request failed: ${String(exc)}`,
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <h2 className="text-xl font-semibold">Chat Console</h2>
        <p className="mt-1 text-sm text-slate-400">
          Real chat via Ollama or LM Studio. Provider Auto uses Glom discovery. Defaults sync to Settings (saved on the
          backend).
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="text-sm text-slate-400">Session Settings</div>
          <div className="mt-3 space-y-3">
            <label className="block text-xs text-slate-500">
              Persona
              <select
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={persona}
                onChange={(e) => setPersona(e.target.value as Persona)}
              >
                <option value="reductionist">Reductionist</option>
                <option value="debugger">Debugger</option>
                <option value="explainer">Explainer</option>
              </select>
            </label>
            <label className="block text-xs text-slate-500">
              Provider
              <select
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={provider}
                onChange={(e) => setProvider(e.target.value as LlmProvider)}
              >
                <option value="auto">Auto (Glom-On)</option>
                <option value="ollama">Ollama</option>
                <option value="lmstudio">LM Studio</option>
              </select>
            </label>
            <ModelSelect
              label="Model"
              provider={provider}
              value={model}
              models={modelsFor}
              onChange={setModel}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="h-[460px] overflow-auto rounded-lg border border-white/10 bg-slate-950/30 p-3">
            {items.length === 0 ? (
              <div className="text-sm text-slate-500">Start the conversation.</div>
            ) : (
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={index} className={item.role === "user" ? "text-sky-100" : "text-amber-100"}>
                    <div className="text-xs uppercase tracking-wide text-slate-500">{item.role}</div>
                    <div className="text-sm">{item.text}</div>
                    {item.meta ? <div className="mt-1 text-xs text-slate-500">{item.meta}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <textarea
              className="h-24 flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type message..."
            />
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              className="rounded-lg border border-white/10 bg-amber-400/10 px-4 py-2 text-sm text-amber-200 hover:bg-amber-400/15 disabled:opacity-50"
            >
              {busy ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
