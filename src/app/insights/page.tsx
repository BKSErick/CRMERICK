"use client";

import { useEffect, useMemo, useState } from "react";

// Aba Insights = repositorio dos aprendizados destilados pelo Webson (tabela insights).
// Etapa 2 do loop: lista + filtro por tipo + busca, pra puxar de la e afiar as copies.
// Os insights sao gerados no card do deal (botao "Webson gera insight") e caem aqui.

type Insight = {
  id: number;
  deal_id: number | null;
  company: string | null;
  type: string | null;
  content: string;
  created_at: string;
};

const TYPES = ["todos", "geral", "dor", "objecao", "converteu"] as const;

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("todos");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/insights");
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao carregar insights");
        if (!cancelled) {
          setInsights((body.insights ?? []) as Insight[]);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function remove(id: number) {
    try {
      await fetch(`/api/insights?id=${id}`, { method: "DELETE" });
      setInsights((prev) => prev.filter((i) => i.id !== id));
    } catch {
      // mantem o estado atual em caso de erro
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return insights.filter((i) => {
      if (typeFilter !== "todos" && (i.type ?? "geral") !== typeFilter) return false;
      if (!q) return true;
      return `${i.content} ${i.company ?? ""}`.toLowerCase().includes(q);
    });
  }, [insights, query, typeFilter]);

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Insights</h1>
          <div className="subtitle">
            Repositorio de aprendizados destilados pelo Webson. Puxe daqui para afiar as copies.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Insights</div>
          <div className="value">{insights.length}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        <input
          className="settings-input"
          placeholder="Buscar por conteudo ou empresa"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: "1 1 260px", minWidth: "200px" }}
        />
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className="topbar-btn"
              onClick={() => setTypeFilter(t)}
              style={
                typeFilter === t
                  ? { background: "var(--color-brand-violet)", color: "#fff", borderColor: "var(--color-brand-violet)" }
                  : undefined
              }
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {status === "loading" ? (
        <div className="connection-status fallback">Carregando insights...</div>
      ) : status === "error" ? (
        <div className="portfolio-status warning">Nao foi possivel carregar os insights.</div>
      ) : filtered.length === 0 ? (
        <div className="connection-status fallback">
          {insights.length === 0
            ? "Nenhum insight ainda. Gere um no card de um cliente (botao 'Webson gera insight')."
            : "Nenhum insight bate com o filtro/busca."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtered.map((ins) => (
            <article key={ins.id} className="card" style={{ padding: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", minWidth: 0 }}>
                  <span className="status-pill">{ins.type ?? "geral"}</span>
                  {ins.company && <strong style={{ fontSize: "13px" }}>{ins.company}</strong>}
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexShrink: 0 }}>
                  <span className="muted-copy" style={{ fontSize: "11px" }}>
                    {new Date(ins.created_at).toLocaleDateString("pt-BR")}
                  </span>
                  <button type="button" className="topbar-btn" onClick={() => remove(ins.id)} style={{ fontSize: "11px" }}>
                    Excluir
                  </button>
                </div>
              </div>
              <div style={{ fontSize: "13px", lineHeight: "1.5", whiteSpace: "pre-wrap", color: "var(--color-charcoal)" }}>
                {ins.content}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
