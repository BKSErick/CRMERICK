"use client";

import { useEffect, useMemo, useState } from "react";
import { DealDetailOverlay, LossReasonDialog } from "@/components/DealDetailOverlay";
import { ListaSubnav } from "@/components/ListaSubnav";
import {
  filterDeals,
  listDealOwners,
  paginateDeals,
  sortDeals,
  type DealListSortDirection,
  type DealListSortKey,
} from "@/lib/dealList";
import type { LossReasonInput } from "@/lib/dealLossReasons.mjs";
import { currencyFormatter, dealHealthColor, stages } from "@/lib/dealPresentation";
import { useCRMStore, type Deal, type DealStage } from "@/store/useCRMStore";

type DataStatus = "loading" | "ready" | "error";

const sortOptions: Array<{ value: DealListSortKey; label: string }> = [
  { value: "nextAction", label: "Próxima ação" },
  { value: "updatedAt", label: "Atualização" },
  { value: "value", label: "Valor" },
  { value: "health", label: "Saúde" },
  { value: "company", label: "Empresa" },
];

function dealOwner(deal: Deal): string {
  return deal.assignee ?? deal.ownerName ?? deal.owner ?? "Sem responsável";
}

function formatDate(value?: string | null, includeTime = false): string {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return date.toLocaleString("pt-BR", includeTime
    ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit", year: "numeric" });
}

function nextActionTone(value?: string | null): string {
  if (!value) return "missing";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "missing";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return timestamp < today.getTime() ? "overdue" : "scheduled";
}

export default function DealListPage() {
  const deals = useCRMStore((state) => state.deals);
  const setDeals = useCRMStore((state) => state.setDeals);
  const setContacts = useCRMStore((state) => state.setContacts);
  const deleteDeal = useCRMStore((state) => state.deleteDeal);
  const updateDealStage = useCRMStore((state) => state.updateDealStage);
  const lastError = useCRMStore((state) => state.lastError);
  const [dataStatus, setDataStatus] = useState<DataStatus>("loading");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<DealStage | "all">("all");
  const [owner, setOwner] = useState("all");
  const [sortKey, setSortKey] = useState<DealListSortKey>("nextAction");
  const [sortDirection, setSortDirection] = useState<DealListSortDirection>("asc");
  const [page, setPage] = useState(1);
  const [selectedDealId, setSelectedDealId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const dealId = Number(new URLSearchParams(window.location.search).get("dealId"));
    return Number.isInteger(dealId) && dealId > 0 ? dealId : null;
  });
  const [pendingLoss, setPendingLoss] = useState<{ dealId: number; company: string } | null>(null);
  const [lossSaving, setLossSaving] = useState(false);
  const [lossError, setLossError] = useState<string | null>(null);

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

    void loadCrmData();
    return () => {
      cancelled = true;
    };
  }, [setContacts, setDeals]);

  const owners = useMemo(() => listDealOwners(deals), [deals]);
  const listedDeals = useMemo(
    () => sortDeals(filterDeals(deals, { query, stage, owner }), sortKey, sortDirection),
    [deals, owner, query, sortDirection, sortKey, stage],
  );
  const pagination = paginateDeals(listedDeals, page);
  const selectedDeal = deals.find((deal) => deal.id === selectedDealId) ?? null;

  function updateSelectedDeal(dealId: number | null) {
    setSelectedDealId(dealId);
    const url = new URL(window.location.href);
    if (dealId) url.searchParams.set("dealId", String(dealId));
    else url.searchParams.delete("dealId");
    window.history.replaceState({}, "", url);
  }

  function resetPage() {
    setPage(1);
  }

  async function requestStageChange(dealId: number, targetStage: DealStage) {
    const currentDeal = deals.find((deal) => deal.id === dealId);
    if (!currentDeal || currentDeal.stage === targetStage) return;
    if (targetStage === "lost" && currentDeal.stage !== "lost") {
      setLossError(null);
      setPendingLoss({ dealId, company: currentDeal.company });
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
      setLossError(error instanceof Error ? error.message : "Não foi possível registrar a perda.");
    } finally {
      setLossSaving(false);
    }
  }

  return (
    <section className="deal-list-page">
      <header className="deal-list-heading">
        <div>
          <span className="card-badge">Pipeline comercial</span>
          <h1>Lista de deals</h1>
          <p>Compare e abra oportunidades sem percorrer as colunas do Kanban.</p>
        </div>
        <span className={`pipeline-status-pill ${dataStatus}`}>
          {dataStatus === "ready"
            ? `${listedDeals.length} de ${deals.length} deals`
            : dataStatus === "loading"
              ? "Carregando deals"
              : "Fonte indisponível"}
        </span>
      </header>

      <ListaSubnav />

      <div className="deal-list-filters" aria-label="Filtros da lista de deals">
        <input
          className="table-search"
          onChange={(event) => { setQuery(event.target.value); resetPage(); }}
          placeholder="Buscar deal, empresa, segmento ou responsável"
          value={query}
        />
        <select onChange={(event) => { setStage(event.target.value as DealStage | "all"); resetPage(); }} value={stage}>
          <option value="all">Todas as etapas</option>
          {stages.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <select onChange={(event) => { setOwner(event.target.value); resetPage(); }} value={owner}>
          <option value="all">Todos os responsáveis</option>
          {owners.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select aria-label="Ordenar lista" onChange={(event) => { setSortKey(event.target.value as DealListSortKey); resetPage(); }} value={sortKey}>
          {sortOptions.map((item) => <option key={item.value} value={item.value}>Ordenar: {item.label}</option>)}
        </select>
        <button
          aria-label={sortDirection === "asc" ? "Ordem crescente" : "Ordem decrescente"}
          className="topbar-btn"
          onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}
          type="button"
        >
          {sortDirection === "asc" ? "↑ Crescente" : "↓ Decrescente"}
        </button>
      </div>

      {lastError ? <div className="portfolio-status warning">{lastError}</div> : null}
      {dataStatus === "error" ? (
        <div className="portfolio-status warning">Não foi possível carregar os dados reais do Supabase.</div>
      ) : null}

      {dataStatus === "ready" && pagination.total === 0 ? (
        <div className="deal-list-empty card">
          <strong>Nenhum deal encontrado</strong>
          <span>Revise a busca ou limpe os filtros para voltar à base completa.</span>
        </div>
      ) : null}

      {pagination.total > 0 ? (
        <div className="table-wrap deal-list-table-wrap">
          <table className="deal-list-table">
            <thead>
              <tr>
                <th scope="col">Deal / empresa</th>
                <th scope="col">Etapa</th>
                <th scope="col">Responsável</th>
                <th scope="col">Valor</th>
                <th scope="col">Saúde</th>
                <th scope="col">Próxima ação</th>
                <th scope="col">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {pagination.items.map((deal) => {
                const stageMeta = stages.find((item) => item.id === deal.stage) ?? stages[0];
                return (
                  <tr
                    key={deal.id}
                    onClick={() => updateSelectedDeal(deal.id)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") updateSelectedDeal(deal.id); }}
                    tabIndex={0}
                  >
                    <td data-label="Deal / empresa">
                      <strong>{deal.name ?? deal.title ?? deal.company}</strong>
                      <span>{deal.company} · {deal.ticketId ?? `Deal #${deal.id}`}</span>
                    </td>
                    <td data-label="Etapa">
                      <span className="deal-list-stage" style={{ "--stage-color": stageMeta.color } as React.CSSProperties}>
                        {stageMeta.label}
                      </span>
                    </td>
                    <td data-label="Responsável">{dealOwner(deal)}</td>
                    <td data-label="Valor"><strong>{currencyFormatter.format(deal.value)}</strong></td>
                    <td data-label="Saúde">
                      {deal.dealHealthScore == null ? (
                        <span className="deal-list-muted">Não calculada</span>
                      ) : (
                        <span className="deal-list-health" style={dealHealthColor(deal.dealHealthScore)}>{deal.dealHealthScore}</span>
                      )}
                    </td>
                    <td data-label="Próxima ação">
                      <span className={`deal-list-next ${nextActionTone(deal.nextActionAt)}`}>{formatDate(deal.nextActionAt)}</span>
                    </td>
                    <td data-label="Atualizado">{formatDate(deal.updated_at, true)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {pagination.total > 0 ? (
        <footer className="deal-list-pagination" aria-label="50 por pagina">
          <span>{pagination.start}–{pagination.end} de {pagination.total}</span>
          <div>
            <button className="topbar-btn" disabled={pagination.page === 1} onClick={() => setPage(pagination.page - 1)} type="button">Anterior</button>
            <span>Página {pagination.page} de {pagination.totalPages}</span>
            <button className="topbar-btn" disabled={pagination.page === pagination.totalPages} onClick={() => setPage(pagination.page + 1)} type="button">Próxima</button>
          </div>
        </footer>
      ) : null}

      {selectedDeal ? (
        <DealDetailOverlay
          deal={selectedDeal}
          key={selectedDeal.id}
          onClose={() => updateSelectedDeal(null)}
          onDelete={(dealId) => {
            void deleteDeal(dealId)
              .then(() => updateSelectedDeal(null))
              .catch(() => undefined);
          }}
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
          title="Registrar razão da perda"
        />
      ) : null}
    </section>
  );
}
