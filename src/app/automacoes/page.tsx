"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AutomationEditor } from "@/components/email-automations/AutomationEditor";
import type { EmailAutomationRow, EmailAutomationStatus } from "@/lib/emailAutomationRepository";

type AutomationListBody = { ok: boolean; error?: string; items: EmailAutomationRow[]; total: number };
type AutomationDetailBody = { ok: boolean; error?: string; automation: EmailAutomationRow };

const filters: Array<{ value: EmailAutomationStatus | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "draft", label: "Rascunhos" },
  { value: "validated", label: "Validadas" },
  { value: "archived", label: "Arquivadas" },
];

function statusLabel(status: EmailAutomationStatus) {
  if (status === "validated") return "Validada";
  if (status === "archived") return "Arquivada";
  return "Rascunho";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function AutomationsPageContent() {
  const currentSearchParams = useSearchParams();
  const [items, setItems] = useState<EmailAutomationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<EmailAutomationStatus | "all">("all");
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => currentSearchParams.get("automation"));
  const [selected, setSelected] = useState<EmailAutomationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    document.body.classList.toggle("automation-editor-mode", Boolean(selectedId));
    return () => document.body.classList.remove("automation-editor-mode");
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ status });
    if (query) params.set("q", query);
    void fetch(`/api/email-automations?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as AutomationListBody;
        if (!response.ok || !body.ok) throw new Error(body.error || "Nao foi possivel carregar as automacoes.");
        setItems(body.items);
        setTotal(body.total);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Nao foi possivel carregar as automacoes.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, refreshKey, selectedId, status]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void fetch(`/api/email-automations/${selectedId}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as AutomationDetailBody;
        if (!response.ok || !body.ok) throw new Error(body.error || "Nao foi possivel abrir a automacao.");
        setSelected(body.automation);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Nao foi possivel abrir a automacao.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedId]);

  function openAutomation(id: string) {
    setLoading(true);
    setError(null);
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("automation", id);
    window.history.replaceState({}, "", url);
  }

  function closeEditor() {
    setSelectedId(null);
    setSelected(null);
    setLoading(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("automation");
    window.history.replaceState({}, "", url);
    setRefreshKey((value) => value + 1);
  }

  async function createAutomation() {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/email-automations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `Automacao ${total + 1}` }),
      });
      const body = await response.json() as { ok: boolean; error?: string; automation?: EmailAutomationRow };
      if (!response.ok || !body.ok || !body.automation) throw new Error(body.error || "Nao foi possivel criar.");
      setSelected(body.automation);
      openAutomation(body.automation.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Nao foi possivel criar a automacao.");
    } finally {
      setCreating(false);
    }
  }

  function applySearch() {
    setLoading(true);
    setError(null);
    setQuery(draftQuery.trim());
  }

  if (selectedId && selected) {
    return <AutomationEditor initialAutomation={selected} key={selected.id} onChanged={setSelected} onExit={closeEditor} />;
  }

  if (selectedId && loading) {
    return <section className="automation-page"><div className="automation-loading">Abrindo editor visual...</div></section>;
  }

  return (
    <section className="automation-page">
      <header className="automation-page-heading">
        <div>
          <span className="card-badge">Fluxos comerciais</span>
          <h1>Automacoes</h1>
          <p>Monte e teste jornadas visuais. Nenhuma automacao envia e-mails nesta versao.</p>
        </div>
        <button className="automation-create-button" disabled={creating} onClick={createAutomation} type="button">
          <span aria-hidden="true">+</span>{creating ? "Criando..." : "Criar automacao"}
        </button>
      </header>

      <nav className="automation-tabs" aria-label="Filtrar automacoes">
        {filters.map((filter) => (
          <button
            aria-current={status === filter.value ? "page" : undefined}
            className={status === filter.value ? "active" : ""}
            key={filter.value}
            onClick={() => { setLoading(true); setError(null); setStatus(filter.value); }}
            type="button"
          >
            {filter.label}
          </button>
        ))}
      </nav>

      <div className="automation-list-toolbar">
        <label className="automation-list-search">
          <span aria-hidden="true">⌕</span>
          <input
            onChange={(event) => setDraftQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") applySearch(); }}
            placeholder="Procurar uma automacao"
            value={draftQuery}
          />
          <button onClick={applySearch} type="button">Buscar</button>
        </label>
        <span>{total} {total === 1 ? "automacao" : "automacoes"}</span>
      </div>

      {error ? <div className="automation-list-error" role="alert">{error}</div> : null}

      {!loading && !error && items.length === 0 ? (
        <div className="automation-empty-state">
          <div className="automation-empty-art" aria-hidden="true"><span>↯</span><i /><b>+</b></div>
          <h2>Suas automacoes aparecerao aqui.</h2>
          <p>Comece com um gatilho, conecte regras e simule a jornada antes de validar.</p>
          <button className="automation-button primary" onClick={createAutomation} type="button">Criar automacao</button>
        </div>
      ) : null}

      {loading && !selectedId ? <div className="automation-loading">Carregando automacoes...</div> : null}

      {!loading && items.length > 0 ? (
        <div className="automation-card-grid">
          {items.map((automation) => (
            <button className="automation-card" key={automation.id} onClick={() => openAutomation(automation.id)} type="button">
              <span className={`automation-card-status ${automation.status}`}>{statusLabel(automation.status)}</span>
              <span className="automation-card-flow" aria-hidden="true">
                <i className="trigger" /><b /><i className="rule" /><b /><i className="action" />
              </span>
              <strong>{automation.name}</strong>
              <p>{automation.description || "Fluxo visual em modo seguro de rascunho e simulacao."}</p>
              <span className="automation-card-meta">
                {automation.graph.nodes.length} etapas · versao {automation.version} · {formatDate(automation.updated_at)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default function AutomationsPage() {
  return (
    <Suspense fallback={<section className="automation-page"><div className="automation-loading">Carregando automacoes...</div></section>}>
      <AutomationsPageContent />
    </Suspense>
  );
}
