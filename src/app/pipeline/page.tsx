"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useCRMStore, type Deal, type DealStage } from "@/store/useCRMStore";

const stages: Array<{ id: DealStage; label: string; hint: string; color: string }> = [
  { id: "prospect", label: "Prospect", hint: "Entrada", color: "#0091ff" },
  { id: "qualified", label: "Qualified", hint: "Diagnostico", color: "#7b68ee" },
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
  CS: "av-cale",
  PA: "av-pri",
  AL: "av-al",
  RT: "av-rt",
  DP: "av-dev",
  PB: "av-pri",
  MR: "av-mira",
};

export default function PipelinePage() {
  const deals = useCRMStore((state) => state.deals);
  const setDeals = useCRMStore((state) => state.setDeals);
  const setContacts = useCRMStore((state) => state.setContacts);
  const createDeal = useCRMStore((state) => state.createDeal);
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
    qualified: 40,
    proposal: 40,
    negotiation: 40,
    won: 40,
    lost: 40,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadLegacyData() {
      try {
        const response = await fetch("/api/crm-data");
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao carregar mock-db.js");
        if (!cancelled) {
          setDeals(body.deals);
          setContacts(body.contacts);
          setDataStatus("ready");
        }
      } catch {
        if (!cancelled) setDataStatus("error");
      }
    }

    loadLegacyData();
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

  function handleCreateDeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(newDeal.value) || 0;

    if (!newDeal.company.trim()) return;

    createDeal({
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
          deal={selectedDeal}
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
  const progress = deal.progress ?? (deal.stage === "qualified" || deal.stage === "proposal" ? 35 : 0);

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
  onClose: () => void;
};

function DealDetailOverlay({ deal, onClose }: DealDetailOverlayProps) {
  const stage = stages.find((item) => item.id === deal.stage) ?? stages[0];
  const reportHref = deal.analysisUrl ? `/${deal.analysisUrl}` : "";
  const cleanPhone = (deal.phone || deal.whatsapp || "").replace(/\D/g, "");
  const whatsappHref = cleanPhone
    ? `https://wa.me/${cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`}?text=${encodeURIComponent(
        deal.copyText || `Oi! Vi a oportunidade da ${deal.company} e queria te mandar uma analise rapida.`,
      )}`
    : "";
  const score = Math.max(0, Math.min(10, deal.points ?? 0));
  const activity = [
    { initials: "ES", user: "Erick Sena", action: "criou esta tarefa", time: "hoje as 14:50" },
    { initials: deal.assignee ?? "JM", user: deal.ownerName ?? "Joao M.", action: "moveu para o estagio atual", time: "hoje as 11:20" },
    { initials: "CS", user: "Carla S.", action: "atualizou o valor do deal", time: "ontem as 16:30" },
    { initials: "PA", user: "Pedro A.", action: "adicionou uma descricao", time: "ontem as 09:15" },
    { initials: "AL", user: "Ana L.", action: "anexou um arquivo", time: "terca, 10:45" },
  ];

  return (
    <div className="deal-overlay open" onClick={onClose}>
      <div className="deal-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-main">
          <div className="deal-header">
            <div>
              <div className="deal-breadcrumb">
                Pipeline / <span>{stage.label}</span>
              </div>
              <input className="deal-title" readOnly value={deal.name ?? deal.title ?? deal.company} />
            </div>
            <div className="deal-header-actions">
              <button className="deal-header-btn danger" type="button">
                Excluir
              </button>
              <button className="deal-header-btn" type="button">
                Compartilhar
              </button>
              <button className="deal-header-btn" onClick={onClose} type="button">
                Fechar
              </button>
            </div>
          </div>

          <div className="brain-bar">
            Peca ao Brain uma <a>apresentacao</a>, <a>documento</a> ou <a>prototipo</a>
          </div>

          <div className="meta-grid">
            <div className="meta-row">
              <span className="meta-label">Status</span>
              <span className={`status-badge ${deal.stage}`}>{stage.label}</span>
              <span className="status-arrow">›</span>
              <span className="status-check">✓</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Responsaveis</span>
              <span className="meta-value">{deal.ownerName ?? deal.owner ?? "—"}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Datas</span>
              <span className="meta-value empty">{deal.close ?? "—"}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Prioridade</span>
              <span className="meta-value empty">—</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Estimativa</span>
              <span className="meta-value empty">—</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Rastrear tempo</span>
              <span className="meta-value text-violet">Start</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Valor</span>
              <span className="meta-value font-mono">{currencyFormatter.format(deal.value)}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Probabilidade</span>
              <span className="meta-value">{deal.prob ?? deal.probability ?? 0}%</span>
            </div>
          </div>

          <div className="description-area">
            <p>Contrato — {deal.company}</p>
            <p>Cliente: {deal.company}</p>
            <p>Tipo de Servico: {deal.segment ?? ""}</p>
            <p>Valor Mensal: {deal.value ? currencyFormatter.format(deal.value) : ""}</p>
          </div>

          <div className="huberick-lead-block">
            <div className="huberick-head">
              <span>△ Prospeccao Outbound — Huberick</span>
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
                <a className="deal-header-btn whatsapp" href={whatsappHref} rel="noreferrer" target="_blank">
                  WhatsApp
                </a>
              ) : null}
            </div>
            {deal.copyText ? (
              <div className="huberick-copy">
                <div className="copy-label">
                  <span>Mensagem de abordagem</span>
                  <button
                    className="badge-action-btn"
                    onClick={() => navigator.clipboard?.writeText(deal.copyText ?? "")}
                    type="button"
                  >
                    Copiar Mensagem
                  </button>
                </div>
                <textarea readOnly value={deal.copyText} />
              </div>
            ) : null}
          </div>

          <div className="section-header">
            <span className="header-title">Campos</span>
            <span className="header-actions">⌕ ↗ +</span>
          </div>
          <button className="toggle-empty-fields-btn" type="button">
            Mostrar 8 campos vazios
          </button>
        </div>

        <aside className="modal-activity">
          <div className="activity-header">
            <span className="activity-title">Atividade</span>
            <span className="activity-actions">⌕ ♧ ⚿</span>
          </div>
          <div className="activity-feed">
            {activity.map((item) => (
              <div className="activity-item" key={`${item.user}-${item.time}`}>
                <div className="activity-avatar">{item.initials.slice(0, 2)}</div>
                <div className="activity-content">
                  <div className="activity-text">
                    <strong>{item.user}</strong> {item.action}
                  </div>
                  <span className="activity-time">{item.time}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="comment-composer">
            <div className="composer-toolbar">
              <select defaultValue="comentario">
                <option value="comentario">Comentario</option>
              </select>
              <span>☺ @ ▧ 🔗</span>
            </div>
            <textarea className="comment-input" placeholder="Mencione @Brain para criar, encontrar ou perguntar qualquer coisa" />
          </div>
        </aside>
      </div>
    </div>
  );
}
