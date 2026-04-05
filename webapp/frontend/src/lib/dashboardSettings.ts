export type Persona = "reductionist" | "debugger" | "explainer";
export type LlmProvider = "auto" | "ollama" | "lmstudio";

export type DashboardSettings = {
  chat_persona: Persona;
  chat_provider: LlmProvider;
  chat_model: string | null;
  voice_provider: LlmProvider;
  voice_model: string | null;
  refine_provider: LlmProvider;
  refine_model: string | null;
};

export function modelCatalogProvider(chatProvider: LlmProvider): "ollama" | "lmstudio" {
  return chatProvider === "lmstudio" ? "lmstudio" : "ollama";
}

export async function fetchDashboardSettings(): Promise<DashboardSettings> {
  const res = await fetch("/api/dashboard/settings");
  const data = (await res.json()) as { ok?: boolean; settings?: DashboardSettings; detail?: string };
  if (!data.ok || !data.settings) throw new Error(data.detail ?? "Failed to load dashboard settings");
  return data.settings;
}

export async function saveDashboardSettings(s: DashboardSettings): Promise<DashboardSettings> {
  const res = await fetch("/api/dashboard/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(s),
  });
  const data = (await res.json()) as { ok?: boolean; settings?: DashboardSettings; detail?: string };
  if (!res.ok || !data.ok || !data.settings) throw new Error(data.detail ?? "Failed to save settings");
  return data.settings;
}

export async function patchDashboardSettings(partial: Partial<DashboardSettings>): Promise<DashboardSettings> {
  const cur = await fetchDashboardSettings();
  return saveDashboardSettings({ ...cur, ...partial });
}

export async function fetchLlmModels(provider: "ollama" | "lmstudio"): Promise<string[]> {
  const res = await fetch(`/api/llm/models?provider=${encodeURIComponent(provider)}`);
  const data = (await res.json()) as { ok?: boolean; models?: string[]; detail?: string };
  if (!res.ok || !data.ok || !Array.isArray(data.models)) {
    throw new Error(data.detail ?? "Failed to list models");
  }
  return data.models;
}
