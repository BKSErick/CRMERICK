"use client";

import { useEffect, useState } from "react";

export type UiModelPreference =
  | { mode: "auto" }
  | { mode: "fixed"; provider: "OpenRouter"; modelId: string };

type FreeModel = { id: string; name: string; contextLength: number; availability: string };

function contextLabel(value: number) {
  if (!value) return "contexto não informado";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M contexto`;
  return `${Math.round(value / 1000)}K contexto`;
}

export default function AiModelPicker({ value, onSelect }: {
  value: UiModelPreference;
  onSelect: (value: UiModelPreference) => void;
}) {
  const [models, setModels] = useState<FreeModel[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    void fetch("/api/ai/models")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Catálogo gratuito indisponível.");
        if (!ignore) setModels(data.models ?? []);
      })
      .catch((reason) => { if (!ignore) setError(reason instanceof Error ? reason.message : "Catálogo gratuito indisponível."); });
    return () => { ignore = true; };
  }, []);

  const selected = value.mode === "fixed" ? value.modelId : "auto";
  return (
    <label className="ai-model-picker">
      <span>Modelo</span>
      <select
        aria-label="Modelo gratuito"
        value={selected}
        title={error || "Somente modelos gratuitos comprovados pelo servidor"}
        onChange={(event) => onSelect(event.target.value === "auto"
          ? { mode: "auto" }
          : { mode: "fixed", provider: "OpenRouter", modelId: event.target.value })}
      >
        <option value="auto">Automático gratuito</option>
        {models.map((model) => (
          <option key={model.id} value={model.id}>{model.name} · {contextLabel(model.contextLength)}</option>
        ))}
      </select>
      {error ? <small>{error}</small> : null}
    </label>
  );
}
