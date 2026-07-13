"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useCRMStore, type Deal, type DealStage } from "@/store/useCRMStore";
import { logWhatsappSent } from "@/lib/activityClient";

const stages: Array<{ id: DealStage; label: string; hint: string; color: string }> = [
  { id: "prospect", label: "Prospect", hint: "Entrada", color: "#0091ff" },
  { id: "abordado", label: "Abordado", hint: "Mandei msg", color: "#f59e0b" },
  { id: "qualified", label: "Qualified", hint: "Respondeu", color: "#7b68ee" },
  { id: "proposal", label: "Proposal", hint: "Oferta enviada", color: "#ed6c02" },
  { id: "negotiation", label: "Negotiation", hint: "Follow-up", color: "#d32f2f" },
  { id: "won", label: "Won", hint: "Cliente ativo", color: "#2e7d32" },
  { id: "lost", label: "Lost", hint: "Arquivado", color: "#646464" },
];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const tagTypeMeta: Record<string, { label: string; className: string }> = {
  feature: { label: "Feature", className: "tag-feat" },
  bug: { label: "Bug", className: "tag-bug" },
  design: { label: "Design", className: "tag-design" },
  chore: { label: "Chore", className: "tag-chore" },
  research: { label: "Research", className: "tag-research" },
};

const ownerClass: Record<string, string> = {
  JM: "av-mira",
  "Joana Mira": "av-mira",
  CS: "av-cale",
  "Carla S.": "av-cale",
  PA: "av-pri",
  Pri: "av-pri",
  AL: "av-al",
  Al: "av-al",
  RT: "av-rt",
  DP: "av-dev",
  Dev: "av-dev",
  PB: "av-pri",
  MR: "av-mira",
  Erick: "av-cale",
};

type DealActivity = {
  id: number;
  type: string | null;
  description: string | null;
  created_at: string | null;
};

const activityTypeLabels: Record<string, string> = {
  stage_change: "Mudanca de etapa",
  note: "Nota",
  call: "Ligacao",
  email: "E-mail",
  meeting: "Reuniao",
};

function activityLabel(type: string | null): string {
  return activityTypeLabels[type ?? "note"] ?? "Atividade";
}

function activityInitials(type: string | null): string {
  return activityLabel(type).slice(0, 2).toUpperCase();
}

function formatActivityTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function PipelinePage() {
  const deals = useCRMStore((state) => state.deals);
  const setDeals = useCRMStore((state) => state.setDeals);
  const setContacts = useCRMStore((state) => state.setContacts);
  const createDeal = useCRMStore((state) => state.createDeal);
  const deleteDeal = useCRMStore((state) => state.deleteDeal);
  const lastError = useCRMStore((state) => state.lastError);
  const updateDealStage = useCRMStore((state) => state.updateDealStage);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<DealStage | "all">("all");
  const [newDeal, setNewDeal] = useState({ company: "", title: "", value: "", phone: "" });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);
  const [draggedDealId, setDraggedDealId] = useState<number | null>(null);
  const [visibleByStage, setVisibleByStage] = useState<Record<DealStage, number>>({
    prospect: 40,
    abordado: 40,
    qualified: 40,
    proposal: 40,
    negotiation: 40,
    won: 40,
    lost: 40,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadCrmData() {
      try {
        const response = await fetch("/api/crm-data");
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao carregar dados do CRM");
        if (!cancelled) {
          setDeals(body.deals);
          setContacts(body.contacts);
          setDataStatus("ready");
        }
      } catch {
        if (!cancelled) setDataStatus("error");
      }
    }

    loadCrmData();
    return () => {
      cancelled = true;
    };
  }, [setContacts, setDeals]);

  const filteredDeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deals.filter((deal) => {
      const matchesQuery =
        !q ||
        deal.company.toLowerCase().includes(q) ||
        deal.name?.toLowerCase().includes(q) ||
        deal.title?.toLowerCase().includes(q) ||
        deal.ticketId?.toLowerCase().includes(q) ||
        deal.owner?.toLowerCase().includes(q) ||
        deal.assignee?.toLowerCase().includes(q);
      const matchesStage = stageFilter === "all" || deal.stage === stageFilter;
      return matchesQuery && matchesStage;
    });
  }, [deals, query, stageFilter]);

  const selectedDeal = deals.find((deal) => deal.id === selectedDealId) ?? null;

  async function handleCreateDeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(newDeal.value) || 0;

    if (!newDeal.company.trim()) return;

    try {
      await createDeal({
        company: newDeal.company.trim(),
        title: newDeal.title.trim() || "Novo deal",
        name: newDeal.title.trim() || newDeal.company.trim(),
        value,
        phone: newDeal.phone.trim(),
        stage: "prospect",
        probability: 20,
        prob: 20,
        owner: "Erick",
        ownerName: "Erick",
        tag: "Outbound",
        tagType: "research",
        ticketId: `LEAD-${Date.now()}`,
        points: 3,
        progress: 0,
        assignee: "JM",
      });
      setNewDeal({ company: "", title: "", value: "", phone: "" });
      setIsCreateOpen(false);
    } catch {
      // lastError ja e atualizado pelo store para exibir feedback visivel.
    }
  }

  return (
    <section className="pipeline-page">
      <div className="filterbar pipeline-top-filterbar">
        <input
          className="table-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar deal, empresa ou owner"
          value={query}
        />
        <div className="filter-group">
          <select onChange={(event) => setStageFilter(event.target.value as DealStage | "all")} value={stageFilter}>
            <option value="all">Todas as etapas</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.label}
              </option>
            ))}
          </select>
        </div>
        <div className="filterbar-spacer" />
        <span className={`pipeline-status-pill ${dataStatus}`}>
          {dataStatus === "ready"
            ? `${deals.length} leads`
            : dataStatus === "loading"
              ? "Carregando"
              : "Fonte indisponivel"}
        </span>
        <button className="topbar-btn primary" onClick={() => setIsCreateOpen((current) => !current)} type="button">
          Novo deal
        </button>
      </div>

      {isCreateOpen ? (
        <form className="pipeline-create card" onSubmit={handleCreateDeal}>
          <div className="card-header">
            <div className="card-title">Novo deal</div>
            <span className="card-badge">Prospect</span>
          </div>
          <input
            className="settings-input"
            onChange={(event) => setNewDeal((current) => ({ ...current, company: event.target.value }))}
            placeholder="Empresa"
            value={newDeal.company}
          />
          <input
            className="settings-input"
            onChange={(event) => setNewDeal((current) => ({ ...current, title: event.target.value }))}
            placeholder="Titulo da oportunidade"
            value={newDeal.title}
          />
          <input
            className="settings-input"
            inputMode="numeric"
            onChange={(event) => setNewDeal((current) => ({ ...current, value: event.target.value }))}
            placeholder="Valor"
            value={newDeal.value}
          />
          <input
            className="settings-input"
            onChange={(event) => setNewDeal((current) => ({ ...current, phone: event.target.value }))}
            placeholder="Telefone/WhatsApp"
            value={newDeal.phone}
          />
          <button className="topbar-btn primary" type="submit">
            Criar deal
          </button>
        </form>
      ) : null}

      {lastError ? <div className="portfolio-status warning">{lastError}</div> : null}
      {dataStatus === "error" ? (
        <div className="portfolio-status warning">Nao foi possivel carregar os dados reais do Supabase.</div>
      ) : null}

      <div className="kanban-board">
        {stages.map((stage) => {
          const columnDeals = filteredDeals.filter((deal) => deal.stage === stage.id);
          const visibleLimit = visibleByStage[stage.id];
          const visibleDeals = columnDeals.slice(0, visibleLimit);
          const total = columnDeals.reduce((sum, deal) => sum + deal.value, 0);

          return (
            <section
              className="kanban-column"
              data-stage={stage.id}
              key={stage.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedDealId) void updateDealStage(draggedDealId, stage.id);
                setDraggedDealId(null);
              }}
            >
              <div className="kanban-column-header">
                <div>
                  <div className="kanban-col-title">
                    <span className="col-swatch" style={{ background: stage.color }} />
                    {stage.label}
                  </div>
                  <div className="kanban-column-sub">{stage.hint}</div>
                </div>
                <span className="kanban-col-count">{columnDeals.length}</span>
              </div>
              <div className="kanban-column-total">{currencyFormatter.format(total)}</div>
              <div className="kanban-cards">
                {visibleDeals.map((deal) => (
                  <DealCard
                    deal={deal}
                    key={deal.id}
                    onOpen={() => setSelectedDealId(deal.id)}
                    onDragEnd={() => setDraggedDealId(null)}
                    onDragStart={() => setDraggedDealId(deal.id)}
                  />
                ))}
                {columnDeals.length > visibleLimit ? (
                  <button
                    className="add-card-btn"
                    onClick={() =>
                      setVisibleByStage((current) => ({ ...current, [stage.id]: current[stage.id] + 80 }))
                    }
                    type="button"
                  >
                    Carregar mais {columnDeals.length - visibleLimit} cards...
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {selectedDeal ? (
        <DealDetailOverlay
          key={selectedDeal.id}
          deal={selectedDeal}
          onDelete={(dealId) => {
            void deleteDeal(dealId)
              .then(() => setSelectedDealId(null))
              .catch(() => undefined);
          }}
          onClose={() => setSelectedDealId(null)}
        />
      ) : null}
    </section>
  );
}

type DealCardProps = {
  deal: Deal;
  onOpen: () => void;
  onDragEnd: () => void;
  onDragStart: () => void;
};

function DealCard({ deal, onDragEnd, onDragStart, onOpen }: DealCardProps) {
  const tag = tagTypeMeta[deal.tagType ?? "research"] ?? tagTypeMeta.research;
  const assignee = deal.assignee ?? deal.owner ?? "JM";
  const avatarClass = ownerClass[assignee] ?? "av-mira";
  const progress = deal.progress ?? (deal.stage === "abordado" ? 20 : deal.stage === "qualified" || deal.stage === "proposal" ? 35 : 0);

  return (
    <article
      className="deal-card"
      draggable
      onClick={onOpen}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
    >
      <span className={`card-tag ${tag.className}`}>{tag.label}</span>
      <div className="card-title-text">{deal.name ?? deal.title ?? deal.company}</div>
      {progress ? (
        <div className="card-progress">
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <div className="card-meta">
        <div className="card-meta-left">
          <span className={`av-sm ${avatarClass}`}>{assignee.slice(0, 2)}</span>
          <span className="card-pts">{deal.points ?? 1} pts</span>
        </div>
        <span className="card-id">{deal.ticketId ?? `LEAD-${deal.id}`}</span>
      </div>
    </article>
  );
}

type DealDetailOverlayProps = {
  deal: Deal;
  onDelete: (dealId: number) => void;
  onClose: () => void;
};

function DealDetailOverlay({ deal, onClose, onDelete }: DealDetailOverlayProps) {
  const stage = stages.find((item) => item.id === deal.stage) ?? stages[0];
  const reportHref = deal.analysisUrl ? `/${deal.analysisUrl}` : "";
  const cleanPhone = (deal.phone || deal.whatsapp || "").replace(/\D/g, "");
  const whatsappHref = cleanPhone
    ? `https://wa.me/${cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`}?text=${encodeURIComponent(
        deal.copyText || `Oi! Vi a oportunidade da ${deal.company} e queria te mandar uma analise rapida.`,
      )}`
    : "";
  const score = Math.max(0, Math.min(10, deal.points ?? 0));

  const [activities, setActivities] = useState<DealActivity[]>([]);
  const [activitiesStatus, setActivitiesStatus] = useState<"loading" | "ready" | "error">("loading");
  const updateDeal = useCRMStore((state) => state.updateDeal);
  const updateDealStage = useCRMStore((state) => state.updateDealStage);
  const [valueInput, setValueInput] = useState(String(deal.value ?? 0));
  const [recurring, setRecurring] = useState(Boolean(deal.recurring));
  const [descriptionInput, setDescriptionInput] = useState(deal.description || "");
  const [nameInput, setNameInput] = useState(deal.name ?? deal.title ?? deal.company ?? "");
  const [copyInput, setCopyInput] = useState(deal.copyText || "");
  const [savingValue, setSavingValue] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);



  // Sincroniza a caixa editavel quando a IA regenera a mensagem (deal.copyText muda).
  useEffect(() => {
    setCopyInput(deal.copyText || "");
  }, [deal.copyText]);

  async function handleSaveValue() {
    setSavingValue(true);
    try {
      await updateDeal(deal.id, { value: Number(valueInput) || 0, recurring });
    } catch {
      // erro visivel via store.lastError na tela do pipeline
    } finally {
      setSavingValue(false);
    }
  }

  // Story 010: integracao de IA (rota /api/ai reabilitada apos QA PASS).
  async function handleGenerateCopy() {
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-copy", dealId: deal.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Erro ao gerar a mensagem.");
      await updateDeal(deal.id, { copyText: data.copyText });
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiLoading(false);
    }
  }

  async function handleGenerateSummary() {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-summary", dealId: deal.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Erro ao gerar o resumo.");
      setSummaryText(data.summary);
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : String(e));
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadActivities() {
      setActivitiesStatus("loading");
      try {
        const response = await fetch(`/api/activities?dealId=${encodeURIComponent(deal.id)}`);
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao carregar atividades");
        if (!cancelled) {
          setActivities((body.activities ?? []) as DealActivity[]);
          setActivitiesStatus("ready");
        }
      } catch {
        if (!cancelled) setActivitiesStatus("error");
      }
    }
    loadActivities();
    return () => {
      cancelled = true;
    };
  }, [deal.id]);

  return (
    <div className="deal-overlay open" onClick={onClose}>
      <div className="deal-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-main">
          <div className="deal-header">
            <div>
              <div className="deal-breadcrumb">
                Pipeline / <span>{stage.label}</span>
              </div>
              <input
                className="deal-title"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={async () => {
                  const v = nameInput.trim();
                  if (v && v !== (deal.name ?? deal.title ?? deal.company ?? "")) {
                    await updateDeal(deal.id, { name: v });
                  }
                }}
              />
            </div>
            <div className="deal-header-actions">
              <button className="deal-header-btn danger" onClick={() => onDelete(deal.id)} type="button">
                Excluir
              </button>
              <button className="deal-header-btn" onClick={onClose} type="button">
                Fechar
              </button>
            </div>
          </div>

          <div className="meta-grid">
            <div className="meta-row">
              <span className="meta-label">Status</span>
              <select
                value={deal.stage}
                onChange={async (e) => {
                  await updateDealStage(deal.id, e.target.value as DealStage);
                }}
                className="settings-select"
              >
                {stages.map((st) => (
                  <option key={st.id} value={st.id}>{st.label}</option>
                ))}
              </select>
            </div>
            <div className="meta-row">
              <span className="meta-label">Responsáveis</span>
              <select
                value={deal.assignee || deal.owner || ""}
                onChange={async (e) => {
                  const val = e.target.value;
                  await updateDeal(deal.id, { assignee: val, owner: val, ownerName: val });
                }}
                className="settings-select"
              >
                <option value="" disabled>Selecionar</option>
                <option value="Erick">Erick</option>
                <option value="Joana Mira">Joana Mira</option>
                <option value="Carla S.">Carla S.</option>
                <option value="Pri">Pri</option>
                <option value="Al">Al</option>
                <option value="Dev">Dev</option>
              </select>
            </div>
            <div className="meta-row">
              <span className="meta-label">Datas</span>
              <input
                type="date"
                value={deal.close || ""}
                onChange={async (e) => {
                  await updateDeal(deal.id, { close: e.target.value });
                }}
                className="settings-date-input"
              />
            </div>
            <div className="meta-row">
              <span className="meta-label">Prioridade</span>
              <select
                value={deal.priority || ""}
                onChange={async (e) => {
                  await updateDeal(deal.id, { priority: e.target.value });
                }}
                className="settings-select"
              >
                <option value="" disabled>Selecionar</option>
                <option value="Baixa">Baixa</option>
                <option value="Média">Média</option>
                <option value="Alta">Alta</option>
                <option value="Urgente">Urgente</option>
              </select>
            </div>
          </div>

          <div
            className="deal-value-editor"
            style={{ display: "flex", gap: "14px", alignItems: "flex-end", flexWrap: "wrap", margin: "14px 0", padding: "12px", border: "1px solid var(--color-linen, #e9ebf0)", borderRadius: "8px" }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px" }}>
              <span className="meta-label">Valor do deal (R$)</span>
              <input
                className="settings-input"
                inputMode="numeric"
                value={valueInput}
                onChange={(event) => setValueInput(event.target.value)}
                style={{ maxWidth: "160px" }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
              <input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} />
              Recorrente (MRR)
            </label>
            <button className="topbar-btn primary" type="button" onClick={handleSaveValue} disabled={savingValue}>
              {savingValue ? "Salvando..." : "Salvar valor"}
            </button>
          </div>

          <div className="description-area" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <strong style={{ fontSize: "13px", color: "var(--color-midnight-ink)" }}>Descrição / Detalhes do Deal</strong>
            <textarea
              value={descriptionInput}
              onChange={(e) => setDescriptionInput(e.target.value)}
              onBlur={async () => {
                await updateDeal(deal.id, { description: descriptionInput });
              }}
              placeholder="Digite aqui as informações sobre o cliente, contrato, tipo de serviço e observações..."
              className="settings-textarea"
              style={{ minHeight: "120px" }}
            />
          </div>

          <div className="description-area" style={{ marginTop: "18px", borderTop: "1px solid var(--color-linen)", paddingTop: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <strong style={{ fontSize: "13px", color: "var(--color-midnight-ink)" }}>Resumo Analitico da IA</strong>
              <button
                className="badge-action-btn"
                onClick={handleGenerateSummary}
                disabled={summaryLoading}
                type="button"
                style={{ background: "var(--color-brand-violet)", color: "#fff", border: "none", cursor: "pointer" }}
              >
                {summaryLoading ? "Analisando..." : summaryText ? "Recalcular" : "Gerar com IA"}
              </button>
            </div>
            {summaryError && (
              <div style={{ color: "var(--color-danger)", fontSize: "11px", marginBottom: "8px" }}>
                {summaryError}
              </div>
            )}
            {summaryText ? (
              <div className="markdown-summary" style={{ fontSize: "13px", lineHeight: "1.5", color: "var(--color-charcoal)", background: "var(--color-paper)", padding: "10px", borderRadius: "8px", border: "1px solid var(--color-cloud)" }}>
                {summaryText.split("\n").map((line, idx) => {
                  let content = line;
                  const isBullet = content.trim().startsWith("-") || content.trim().startsWith("*");
                  if (isBullet) {
                    content = content.replace(/^[-*]\s+/, "");
                  }
                  const boldParts = content.split("**");
                  const renderedContent = boldParts.map((part, i) =>
                    i % 2 === 1 ? <strong key={i}>{part}</strong> : part,
                  );
                  return isBullet ? (
                    <li key={idx} style={{ marginLeft: "14px", marginBottom: "4px" }}>
                      {renderedContent}
                    </li>
                  ) : (
                    <p key={idx} style={{ marginBottom: "6px" }}>
                      {renderedContent}
                    </p>
                  );
                })}
              </div>
            ) : (
              <p className="muted-copy" style={{ margin: 0 }}>
                Nenhum resumo gerado ainda. Clique em Gerar com IA para analisar com o OpenRouter.
              </p>
            )}
          </div>

          <div className="huberick-lead-block">
            <div className="huberick-head">
              <span><span>△</span> Prospeccao Outbound — Huberick</span>
              <strong>Score: {score}</strong>
            </div>
            <p>
              <strong>Site Avaliado:</strong>{" "}
              {deal.siteUrl ? (
                <a href={deal.siteUrl} rel="noreferrer" target="_blank">
                  {deal.siteUrl}
                </a>
              ) : (
                <span>—</span>
              )}
            </p>
            <p>
              <strong>Telefone:</strong> <span className="font-mono">{deal.phone || "Sem telefone"}</span>
            </p>
            <div className="huberick-actions">
              {reportHref ? (
                <a className="deal-header-btn primary" href={reportHref} rel="noreferrer" target="_blank">
                  Ver Relatorio de Analise
                </a>
              ) : null}
              {whatsappHref ? (
                <a
                  className="deal-header-btn whatsapp"
                  href={whatsappHref}
                  rel="noreferrer"
                  target="_blank"
                  onClick={() => logWhatsappSent(deal.id)}
                >
                  WhatsApp
                </a>
              ) : null}
            </div>
            
            <div className="huberick-copy" style={{ marginTop: "12px" }}>
              <div className="copy-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Mensagem de abordagem (Webson IA)</span>
                <div style={{ display: "flex", gap: "8px" }}>
                  {deal.copyText && (
                    <button
                      className="badge-action-btn"
                      onClick={() => navigator.clipboard?.writeText(deal.copyText ?? "")}
                      type="button"
                    >
                      Copiar
                    </button>
                  )}
                  <button
                    className="badge-action-btn"
                    onClick={handleGenerateCopy}
                    disabled={aiLoading}
                    type="button"
                    style={{ background: "var(--color-brand-violet)", color: "#fff", border: "none", cursor: "pointer" }}
                  >
                    {aiLoading ? "Gerando..." : deal.copyText ? "Regenerar IA" : "Gerar com IA"}
                  </button>
                </div>
              </div>
              {aiError && (
                <div style={{ color: "var(--color-danger)", fontSize: "11px", marginTop: "4px" }}>
                  {aiError}
                </div>
              )}
              <textarea
                value={copyInput}
                onChange={(e) => setCopyInput(e.target.value)}
                onBlur={async () => {
                  if (copyInput !== (deal.copyText || "")) {
                    await updateDeal(deal.id, { copyText: copyInput });
                  }
                }}
                placeholder="Nenhuma mensagem gerada ainda. Clique em Gerar com IA para redigir a abordagem consultiva. Voce tambem pode escrever/editar aqui."
                style={{ minHeight: "120px", marginTop: "8px", width: "100%" }}
              />
            </div>
          </div>

        </div>

        <aside className="modal-activity">
          <div className="activity-header">
            <span className="activity-title">Atividade</span>
          </div>
          <div className="activity-feed">
            {activitiesStatus === "loading" ? (
              <p className="muted-copy">Carregando atividades...</p>
            ) : activitiesStatus === "error" ? (
              <p className="muted-copy">Nao foi possivel carregar as atividades.</p>
            ) : activities.length === 0 ? (
              <p className="muted-copy">Nenhuma atividade registrada ainda.</p>
            ) : (
              activities.map((item) => (
                <div className="activity-item" key={item.id}>
                  <div className="activity-avatar">{activityInitials(item.type)}</div>
                  <div className="activity-content">
                    <div className="activity-text">
                      <strong>{activityLabel(item.type)}</strong> {item.description}
                    </div>
                    <span className="activity-time">{formatActivityTime(item.created_at)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
