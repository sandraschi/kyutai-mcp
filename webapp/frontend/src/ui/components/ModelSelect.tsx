import type { LlmProvider } from "../../lib/dashboardSettings";
import { modelCatalogProvider } from "../../lib/dashboardSettings";

export function ModelSelect(props: {
  label: string;
  provider: LlmProvider;
  value: string | null;
  models: string[];
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  const v = props.value ?? "";
  const missing = Boolean(props.value && !props.models.includes(props.value));
  return (
    <label className="block text-xs text-slate-500">
      {props.label}
      <select
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm"
        value={v}
        disabled={props.disabled}
        onChange={(e) => {
          const x = e.target.value;
          props.onChange(x === "" ? null : x);
        }}
      >
        <option value="">Default (server picks first available)</option>
        {missing ? (
          <option value={props.value!}>{props.value} (not in current list)</option>
        ) : null}
        {props.models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <div className="mt-1 text-[11px] text-slate-600">
        List: {modelCatalogProvider(props.provider) === "ollama" ? "Ollama" : "LM Studio"}
      </div>
    </label>
  );
}
