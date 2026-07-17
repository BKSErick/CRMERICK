"use client";

import { useEffect, useMemo, useState } from "react";

// Aba Achados = repositorio dos aprendizados do loop (tabela insights).
// Registro manual de achados (copy, funil, dor, objecao, conversao), edicao inline,
// insights gerados pelo Webson no card do deal, e compilacao via IA (plano de melhoria).

type Insight = {
  id: number;
  deal_id: number | null;
  company: string | null;
  type: string | null;
  content: string;
  created_at: string;
};

const TYPES = ["todos", "geral", "copy", "funil", "dor", "objecao", "converteu", "compilado"] as const;
const NEW_TYPES = ["geral", "copy", "funil", "dor", "objecao", "converteu"] as const;

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("todos");

  // form de novo achado
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState<string>("copy");
  const [newCompany, setNewCompany] = useState("");
  const [saving, setSaving] = useState(false);

  // edicao inline
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editType, setEditType] = useState<string>("geral");

  // compilacao IA
  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/insights");
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao carregar achados");
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

  async function createAchado() {
    const content = newContent.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, type: newType, company: newCompany.trim() || undefined }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error);
      setInsights((prev) => [body.insight as Insight, ...prev]);
      setNewContent("");
      setNewCompany("");
    } catch {
      // mantem o texto digitado para o usuario tentar de novo
    } finally {
      setSaving(false);
    }
  }

  function startEdit(ins: Insight) {
    setEditingId(ins.id);
    setEditContent(ins.content);
    setEditType(ins.type ?? "geral");
  }

  async function saveEdit() {
    if (editingId === null) return;
    const content = editContent.trim();
    if (!content) return;
    try {
      const response = await fetch("/api/insights", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, content, type: editType }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error);
      setInsights((prev) => prev.map((i) => (i.id === editingId ? (body.insight as Insight) : i)));
      setEditingId(null);
    } catch {
      // mantem o modo de edicao aberto em caso de erro
    }
  }

  async function remove(id: number) {
    try {
      await fetch(`/api/insights?id=${id}`, { method: "DELETE" });
      setInsights((prev) => prev.filter((i) => i.id !== id));
    } catch {
      // mantem o estado atual em caso de erro
    }
  }

  async function compile() {
    if (compiling) return;
    setCompiling(true);
    setCompileError("");
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "compile-achados" }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao compilar");
      setInsights((prev) => [body.insight as Insight, ...prev]);
      setTypeFilter("compilado");
    } catch (e) {
      setCompileError(e instanceof Error ? e.message : "Falha ao compilar os achados.");
    } finally {
      setCompiling(false);
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
          <h1>Achados</h1>
          <div className="subtitle">
            Tudo que voce descobre sobre copy, funil, dores e objecoes. Registre aqui e compile com IA num plano de melhoria.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Achados</div>
          <div className="value">{insights.length}</div>
        </div>
      </div>

      <div className="card" style={{ padding: "14px", marginBottom: "16px" }}>
        <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "8px" }}>Novo achado</div>
        <textarea
          className="settings-input"
          placeholder="Ex.: Mencionar o nome do comprador na primeira linha dobrou a taxa de resposta nos leads de usinagem"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          rows={3}
          style={{ width: "100%", resize: "vertical", marginBottom: "8px" }}
        />
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <select className="settings-input" value={newType} onChange={(e) => setNewType(e.target.value)} style={{ width: "auto" }}>
            {NEW_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            className="settings-input"
            placeholder="Empresa (opcional)"
            value={newCompany}
            onChange={(e) => setNewCompany(e.target.value)}
            style={{ flex: "1 1 160px", minWidth: "140px" }}
          />
          <button type="button" className="topbar-btn" onClick={createAchado} disabled={saving || !newContent.trim()}>
            {saving ? "Salvando..." : "Salvar achado"}
          </button>
          <button
            type="button"
            className="topbar-btn"
            onClick={compile}
            disabled={compiling || insights.filter((i) => i.type !== "compilado").length === 0}
            style={{ background: "var(--color-brand-violet)", color: "#fff", borderColor: "var(--color-brand-violet)" }}
          >
            {compiling ? "Compilando..." : "Compilar com IA (plano de melhoria)"}
          </button>
        </div>
        {compileError && (
          <div className="portfolio-status warning" style={{ marginTop: "8px" }}>{compileError}</div>
        )}
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
        <div className="connection-status fallback">Carregando achados...</div>
      ) : status === "error" ? (
        <div className="portfolio-status warning">Nao foi possivel carregar os achados.</div>
      ) : filtered.length === 0 ? (
        <div className="connection-status fallback">
          {insights.length === 0
            ? "Nenhum achado ainda. Registre o primeiro no formulario acima ou gere um no card de um cliente."
            : "Nenhum achado bate com o filtro/busca."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtered.map((ins) => (
            <article
              key={ins.id}
              className="card"
              style={{
                padding: "14px",
                borderLeft: ins.type === "compilado" ? "3px solid var(--color-brand-violet)" : undefined,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", minWidth: 0 }}>
                  <span className="status-pill">{ins.type ?? "geral"}</span>
                  {ins.company && <strong style={{ fontSize: "13px" }}>{ins.company}</strong>}
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexShrink: 0 }}>
                  <span className="muted-copy" style={{ fontSize: "11px" }}>
                    {new Date(ins.created_at).toLocaleDateString("pt-BR")}
                  </span>
                  {editingId !== ins.id && (
                    <button type="button" className="topbar-btn" onClick={() => startEdit(ins)} style={{ fontSize: "11px" }}>
                      Editar
                    </button>
                  )}
                  <button type="button" className="topbar-btn" onClick={() => remove(ins.id)} style={{ fontSize: "11px" }}>
                    Excluir
                  </button>
                </div>
              </div>
              {editingId === ins.id ? (
                <div>
                  <textarea
                    className="settings-input"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={4}
                    style={{ width: "100%", resize: "vertical", marginBottom: "8px" }}
                  />
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <select className="settings-input" value={editType} onChange={(e) => setEditType(e.target.value)} style={{ width: "auto" }}>
                      {[...NEW_TYPES, "compilado"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <button type="button" className="topbar-btn" onClick={saveEdit} disabled={!editContent.trim()}>
                      Salvar
                    </button>
                    <button type="button" className="topbar-btn" onClick={() => setEditingId(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "13px", lineHeight: "1.5", whiteSpace: "pre-wrap", color: "var(--color-charcoal)" }}>
                  {ins.content}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
