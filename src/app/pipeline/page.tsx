"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useCRMStore, type Deal, type DealStage } from "@/store/useCRMStore";
import { RESPONSE_TYPE_INFO } from "@/lib/followup";
import { type LossReasonInput } from "@/lib/dealLossReasons.mjs";
import { DealDetailOverlay, LossReasonDialog } from "@/components/DealDetailOverlay";
import { currencyFormatter, dealHealthColor, ownerClass, stages } from "@/lib/dealPresentation";

const tagTypeMeta: Record<string, { label: string; className: string }> = {
  feature: { label: "Feature", className: "tag-feat" },
  bug: { label: "Bug", className: "tag-bug" },
  design: { label: "Design", className: "tag-design" },
  chore: { label: "Chore", className: "tag-chore" },
  research: { label: "Research", className: "tag-research" },
};

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
  const [selectedDealId, setSelectedDealId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const dealId = Number(new URLSearchParams(window.location.search).get("dealId"));
    return Number.isInteger(dealId) && dealId > 0 ? dealId : null;
  });
  const [draggedDealId, setDraggedDealId] = useState<number | null>(null);
  const [pendingLoss, setPendingLoss] = useState<{ dealId: number; company: string } | null>(null);
  const [lossSaving, setLossSaving] = useState(false);
  const [lossError, setLossError] = useState<string | null>(null);
  // #5: busca em linguagem natural (a IA traduz a frase num filtro sobre deals+sinais).
  const [aiQuery, setAiQuery] = useState("");
  const [aiResults, setAiResults] = useState<Array<{ id: number; company: string; stage: string; points: number; segment: string; views: number; waClicks: number; hot: boolean }> | null>(null);
  const [aiSearching, setAiSearching] = useState(false);

  async function runAiSearch() {
    if (!aiQuery.trim()) return;
    setAiSearching(true);
    try {
      const res = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: aiQuery.trim() }),
      });
      const body = await res.json();
      setAiResults(body?.ok ? body.results : []);
    } catch {
      setAiResults([]);
    } finally {
      setAiSearching(false);
    }
  }
  const [visibleByStage, setVisibleByStage] = useState<Record<DealStage, number>>({
    prospect: 40,
    abordado: 40,
    followup: 40,
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

  async function requestStageChange(dealId: number, targetStage: DealStage) {
    const deal = deals.find((item) => item.id === dealId);
    if (!deal || deal.stage === targetStage) return;
    if (targetStage === "lost" && deal.stage !== "lost") {
      setLossError(null);
      setPendingLoss({ dealId, company: deal.company });
      return;
    }
    await updateDealStage(dealId, targetStage);
  }

  async function confirmLoss(reason: LossReasonInput) {
    if (!pendingLoss) return;
    setLossSaving(true);
    setLossError(null);
    try {
      await updateDealStage(pendingLoss.dealId, "lost", reason);
      setPendingLoss(null);
    } catch (error) {
      setLossError(error instanceof Error ? error.message : "Nao foi possivel registrar a perda.");
    } finally {
      setLossSaving(false);
    }
  }

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

      <div className="card" style={{ marginBottom: "16px", padding: "14px 16px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <span className="card-badge">Busca IA</span>
          <input
            className="table-search"
            style={{ flex: 1, minWidth: "220px" }}
            placeholder='Ex: "leads de usinagem que abriram a pagina essa semana"'
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void runAiSearch(); }}
          />
          <button className="topbar-btn primary" type="button" disabled={aiSearching || !aiQuery.trim()} onClick={() => void runAiSearch()}>
            {aiSearching ? "Buscando..." : "Buscar"}
          </button>
          {aiResults ? (
            <button className="topbar-btn" type="button" onClick={() => { setAiResults(null); setAiQuery(""); }}>Limpar</button>
          ) : null}
        </div>
        {aiResults ? (
          aiResults.length === 0 ? (
            <div className="muted-copy" style={{ marginTop: "10px", fontSize: "13px" }}>Nenhum lead bate com essa busca.</div>
          ) : (
            <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div className="muted-copy" style={{ fontSize: "12px" }}>{aiResults.length} lead(s):</div>
              {aiResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedDealId(r.id)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", background: "var(--panel-2, #f0eef7)", border: 0, borderRadius: "8px", padding: "8px 12px", cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ fontSize: "13px" }}>
                    <strong>{r.company}</strong>
                    <span className="muted-copy" style={{ marginLeft: "8px", fontSize: "11px" }}>{r.stage} · {r.points} pts{r.segment ? ` · ${r.segment}` : ""}</span>
                  </span>
                  <span style={{ fontSize: "11px" }}>
                    {r.hot ? <span className="status-pill" style={{ background: "#d32f2f", color: "#fff" }}>QUENTE</span> : null}
                    {r.views > 0 ? <span className="muted-copy" style={{ marginLeft: "6px" }}>{r.views} abertura(s)</span> : null}
                  </span>
                </button>
              ))}
            </div>
          )
        ) : null}
      </div>

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
                if (draggedDealId) void requestStageChange(draggedDealId, stage.id);
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
          onStageChange={requestStageChange}
        />
      ) : null}
      {pendingLoss ? (
        <LossReasonDialog
          busy={lossSaving}
          company={pendingLoss.company}
          error={lossError}
          onCancel={() => {
            if (!lossSaving) {
              setPendingLoss(null);
              setLossError(null);
            }
          }}
          onConfirm={confirmLoss}
          title="Registrar razao da perda"
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

// Fio 4: origem legível do lead. Distingue de qual quiz/linha ele veio direto no card.
function originLabel(origin?: string): string | null {
  if (!origin) return null;
  const map: Record<string, string> = {
    "quiz:linkbio": "Quiz · Bio",
    "quiz:ostrack-site": "Quiz · OStrack",
    "quiz:quiz": "Quiz",
  };
  if (map[origin]) return map[origin];
  if (origin.startsWith("quiz:")) return `Quiz · ${origin.slice(5)}`;
  return origin;
}

function DealCard({ deal, onDragEnd, onDragStart, onOpen }: DealCardProps) {
  const tag = tagTypeMeta[deal.tagType ?? "research"] ?? tagTypeMeta.research;
  const assignee = deal.assignee ?? deal.owner ?? "JM";
  const avatarClass = ownerClass[assignee] ?? "av-mira";
  const progress = deal.progress ?? (deal.stage === "abordado" ? 20 : deal.stage === "followup" ? 28 : deal.stage === "qualified" || deal.stage === "proposal" ? 35 : 0);

  return (
    <article
      className="deal-card"
      draggable
      onClick={onOpen}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
    >
      <span className={`card-tag ${tag.className}`}>{tag.label}</span>
      {originLabel(deal.origin) ? (
        <span className="card-tag" style={{ marginLeft: "6px", background: "#e8eef7", color: "#2b4a7a" }}>
          {originLabel(deal.origin)}
        </span>
      ) : null}
      {deal.responseType && deal.responseType !== "sem_resposta" ? (
        <span className={`response-pill ${RESPONSE_TYPE_INFO[deal.responseType].tone}`} style={{ marginLeft: "6px" }}>
          {RESPONSE_TYPE_INFO[deal.responseType].label}
        </span>
      ) : null}
      {deal.dealHealthScore != null ? (
        <span
          className="card-tag"
          style={{ marginLeft: "6px", ...dealHealthColor(deal.dealHealthScore) }}
          title={`Saude do negocio: ${deal.dealHealthClassification ?? "sem classificacao"}. Confianca ${deal.dealHealthConfidence ?? 0}%.`}
        >
          Saude {deal.dealHealthScore}
        </span>
      ) : null}
      <div className="card-title-text">{deal.name ?? deal.title ?? deal.company}</div>
      {deal.nextActionAt ? (
        <div className="card-next-action">
          Proxima acao: {new Date(deal.nextActionAt).toLocaleDateString("pt-BR")}
        </div>
      ) : null}
      {progress ? (
        <div className="card-progress">
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <div className="card-meta">
        <div className="card-meta-left">
          <span className={`av-sm ${avatarClass}`}>{assignee.slice(0, 2)}</span>
          <span className="card-pts">Lead score: {deal.points ?? 1}</span>
        </div>
        <span className="card-id">{deal.ticketId ?? `LEAD-${deal.id}`}</span>
      </div>
    </article>
  );
}
