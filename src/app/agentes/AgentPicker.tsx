"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AiAgentPublic } from "@/lib/aiAgentRegistry";

export default function AgentPicker({ agents, selectedId, onSelect }: { agents: AiAgentPublic[]; selectedId: string; onSelect: (id: AiAgentPublic["id"]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = agents.find((agent) => agent.id === selectedId) ?? agents[0];
  const filtered = useMemo(() => agents.filter((agent) => `${agent.name} ${agent.alias} ${agent.specialty}`.toLowerCase().includes(query.toLowerCase())), [agents, query]);
  useEffect(() => { if (open) searchRef.current?.focus(); }, [open]);
  useEffect(() => {
    const openPicker = () => setOpen(true);
    window.addEventListener("ai-agent-picker", openPicker);
    return () => window.removeEventListener("ai-agent-picker", openPicker);
  }, []);

  return (
    <div className="agent-picker">
      <button type="button" className="agent-picker-trigger" aria-label="Escolher especialista de IA" onClick={() => setOpen(true)}>
        <span>{selected?.name}</span><strong>{selected?.alias}</strong>
      </button>
      {open ? (
        <div className="agent-picker-backdrop" onMouseDown={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Lista de especialistas de IA" className="agent-picker-dialog" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
            <header><div><strong>Chamar especialista</strong><small>O atalho vale para a proxima resposta.</small></div><button type="button" aria-label="Fechar lista" onClick={() => setOpen(false)}>×</button></header>
            <input ref={searchRef} aria-label="Pesquisar especialista" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, atalho ou especialidade" />
            <div className="agent-picker-list">
              {filtered.map((agent) => (
                <button type="button" key={agent.id} className={agent.id === selectedId ? "active" : ""} onClick={() => { onSelect(agent.id); setOpen(false); setQuery(""); }}>
                  <span><strong>{agent.name}</strong><small>{agent.specialty}</small></span><code>{agent.alias}</code>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
