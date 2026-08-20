"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { DemandWorkspace } from "@/components/DemandWorkspace";
import {
  DEMAND_DESTINATIONS,
  DEMAND_PRIORITIES,
  type ClientDemand,
  type DemandDestination,
  type DemandPriority,
  type DemandScheduleGroup,
  groupDemandBySchedule,
  isEligibleDemandDeal,
} from "@/lib/clientDemands";

type DealOption = {
  id: number;
  company: string;
  name?: string | null;
  stage?: string | null;
  status?: string | null;
};

const groupMeta: Array<{ id: DemandScheduleGroup; label: string; helper: string }> = [
  { id: "overdue", label: "Atrasadas", helper: "Exigem atencao" },
  { id: "today", label: "Hoje", helper: "Prazo no dia" },
  { id: "upcoming", label: "Proximas", helper: "Agenda futura" },
  { id: "no_due", label: "Sem prazo", helper: "Defina uma data" },
  { id: "completed", label: "Concluidas", helper: "Historico recente" },
];

const priorityLabels: Record<DemandPriority, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

const destinationLabels: Record<DemandDestination, string> = {
  instagram: "Instagram",
  site: "Site",
  whatsapp: "WhatsApp",
  ads: "Anuncios",
  presentation: "Apresentacao",
  drive: "Drive",
  other: "Outro",
};

function dueDateToIso(value: string) {
  return value ? new Date(`${value}T23:59:59-03:00`).toISOString() : null;
}

function formatDueDate(value: string | null, group: DemandScheduleGroup) {
  if (!value) return "Sem prazo";
  if (group === "today") return "Hoje";
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

async function responseJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.error ?? fallback);
  return body as T;
}

async function fetchAllDemands() {
  const collected: ClientDemand[] = [];
  const limit = 200;
  let total = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < total; offset += limit) {
    const body = await responseJson<{ demands: ClientDemand[]; total: number }>(
      await fetch(`/api/demands?limit=${limit}&offset=${offset}`, { cache: "no-store" }),
      "Nao foi possivel carregar as demandas.",
    );
    collected.push(...(body.demands ?? []));
    total = Math.max(0, Number(body.total) || collected.length);
    if ((body.demands ?? []).length < limit) break;
  }
  return collected;
}

export default function DemandasPage() {
  const [demands, setDemands] = useState<ClientDemand[]>([]);
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedDemandId, setSelectedDemandId] = useState<number | null>(null);
  const [savedScrollY, setSavedScrollY] = useState(0);
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<DemandPriority | "all">("all");
  const [destinationFilter, setDestinationFilter] = useState<DemandDestination | "all">("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "completed">("all");
  const [newDemand, setNewDemand] = useState({
    dealId: "",
    title: "",
    dueDate: "",
    priority: "normal" as DemandPriority,
    assignee: "",
    destinationType: "other" as DemandDestination,
    destinationLabel: "",
  });

  async function loadDemands() {
    setLoading(true);
    setError(null);
    try {
      setDemands(await fetchAllDemands());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetchAllDemands()
      .then((items) => {
        if (active) setDemands(items);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    fetch("/api/deals", { cache: "no-store" })
      .then((response) => responseJson<{ deals: DealOption[] }>(response, "Nao foi possivel carregar clientes."))
      .then((body) => {
        if (active) setDeals((body.deals ?? []).filter(isEligibleDemandDeal));
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      });

    const id = Number(new URLSearchParams(window.location.search).get("demandId"));
    if (Number.isInteger(id) && id > 0) {
      window.setTimeout(() => {
        if (active) setSelectedDemandId(id);
      }, 0);
    }
    return () => { active = false; };
  }, []);

  const assignees = useMemo(
    () => Array.from(new Set(demands.map((demand) => demand.assignee).filter(Boolean))).sort(),
    [demands],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return demands.filter((demand) => {
      const haystack = `${demand.title} ${demand.deal?.company ?? ""} ${demand.destinationLabel}`.toLocaleLowerCase("pt-BR");
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
      const matchesPriority = priorityFilter === "all" || demand.priority === priorityFilter;
      const matchesDestination = destinationFilter === "all" || demand.destinationType === destinationFilter;
      const matchesAssignee = assigneeFilter === "all" || demand.assignee === assigneeFilter;
      const completed = demand.status === "done" || demand.status === "cancelled";
      const matchesStatus = statusFilter === "all" || (statusFilter === "completed" ? completed : !completed);
      return matchesQuery && matchesPriority && matchesDestination && matchesAssignee && matchesStatus;
    });
  }, [assigneeFilter, demands, destinationFilter, priorityFilter, query, statusFilter]);

  const grouped = useMemo(() => {
    const result: Record<DemandScheduleGroup, ClientDemand[]> = {
      overdue: [], today: [], upcoming: [], no_due: [], completed: [],
    };
    for (const demand of filtered) result[groupDemandBySchedule(demand)].push(demand);
    for (const group of Object.values(result)) {
      group.sort((left, right) => {
        if (!left.dueAt && !right.dueAt) return right.updatedAt.localeCompare(left.updatedAt);
        if (!left.dueAt) return 1;
        if (!right.dueAt) return -1;
        return left.dueAt.localeCompare(right.dueAt);
      });
    }
    return result;
  }, [filtered]);

  function openDemand(id: number) {
    setSavedScrollY(window.scrollY);
    setSelectedDemandId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("demandId", String(id));
    window.history.replaceState({}, "", url);
  }

  function closeDemand() {
    setSelectedDemandId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("demandId");
    window.history.replaceState({}, "", url);
    window.setTimeout(() => window.scrollTo({ top: savedScrollY }), 0);
  }

  async function createDemand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const body = await responseJson<{ demand: ClientDemand }>(
        await fetch("/api/demands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dealId: Number(newDemand.dealId),
            title: newDemand.title,
            dueAt: dueDateToIso(newDemand.dueDate),
            priority: newDemand.priority,
            assignee: newDemand.assignee,
            destinationType: newDemand.destinationType,
            destinationLabel: newDemand.destinationLabel,
          }),
        }),
        "Nao foi possivel criar a demanda.",
      );
      setDemands((current) => [body.demand, ...current]);
      setNewDemand({ dealId: "", title: "", dueDate: "", priority: "normal", assignee: "", destinationType: "other", destinationLabel: "" });
      setShowCreate(false);
      setNotice("Demanda criada.");
      openDemand(body.demand.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="demands-page">
      <div className="page-header demands-header">
        <div className="page-header-left">
          <div className="demands-eyebrow">Operacao de clientes</div>
          <h1>Demandas</h1>
          <div className="subtitle">Trabalho diario dos clientes fechados, ligado ao deal e separado do Pipeline.</div>
        </div>
        <button className="topbar-btn primary" onClick={() => setShowCreate((current) => !current)} type="button">
          {showCreate ? "Fechar" : "+ Nova demanda"}
        </button>
      </div>

      {showCreate ? (
        <form className="card demand-create-panel" onSubmit={createDemand}>
          <div className="card-header demand-create-heading">
            <div><div className="card-title">Nova demanda</div><div className="muted-copy">Selecione um cliente ganho e registre o trabalho.</div></div>
          </div>
          <label>Cliente
            <select required value={newDemand.dealId} onChange={(event) => setNewDemand((current) => ({ ...current, dealId: event.target.value }))}>
              <option value="">Selecione o deal</option>
              {deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.company || deal.name || `Deal #${deal.id}`}</option>)}
            </select>
          </label>
          <label className="demand-create-title">Demanda
            <input required maxLength={240} placeholder="Ex.: Revisar copy da campanha" value={newDemand.title} onChange={(event) => setNewDemand((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>Prazo
            <input required type="date" value={newDemand.dueDate} onChange={(event) => setNewDemand((current) => ({ ...current, dueDate: event.target.value }))} />
          </label>
          <label>Prioridade
            <select value={newDemand.priority} onChange={(event) => setNewDemand((current) => ({ ...current, priority: event.target.value as DemandPriority }))}>
              {DEMAND_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
            </select>
          </label>
          <label>Responsavel
            <input required maxLength={160} placeholder="Erick" value={newDemand.assignee} onChange={(event) => setNewDemand((current) => ({ ...current, assignee: event.target.value }))} />
          </label>
          <label>Destino
            <select value={newDemand.destinationType} onChange={(event) => setNewDemand((current) => ({ ...current, destinationType: event.target.value as DemandDestination }))}>
              {DEMAND_DESTINATIONS.map((destination) => <option key={destination} value={destination}>{destinationLabels[destination]}</option>)}
            </select>
          </label>
          <label>Onde vai estar
            <input required maxLength={240} placeholder="Ex.: Feed da Metalthec" value={newDemand.destinationLabel} onChange={(event) => setNewDemand((current) => ({ ...current, destinationLabel: event.target.value }))} />
          </label>
          <button className="topbar-btn primary" disabled={creating || deals.length === 0} type="submit">{creating ? "Criando..." : "Criar e abrir"}</button>
        </form>
      ) : null}

      <div className="demands-toolbar" aria-label="Filtros de demandas">
        <label className="demands-search"><span>Buscar</span><input placeholder="Demanda, cliente ou destino" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">Todas</option><option value="open">Abertas</option><option value="completed">Concluidas</option></select></label>
        <label><span>Prioridade</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as DemandPriority | "all")}><option value="all">Todas</option>{DEMAND_PRIORITIES.map((item) => <option key={item} value={item}>{priorityLabels[item]}</option>)}</select></label>
        <label><span>Destino</span><select value={destinationFilter} onChange={(event) => setDestinationFilter(event.target.value as DemandDestination | "all")}><option value="all">Todos</option>{DEMAND_DESTINATIONS.map((item) => <option key={item} value={item}>{destinationLabels[item]}</option>)}</select></label>
        <label><span>Responsavel</span><select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="all">Todos</option>{assignees.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>

      {notice ? <div className="connection-status connected demands-notice">{notice}</div> : null}
      {error ? <div className="connection-status fallback demands-notice">{error} <button className="topbar-btn" onClick={() => void loadDemands()} type="button">Tentar novamente</button></div> : null}
      {loading ? <div className="card demands-empty">Carregando demandas reais...</div> : null}

      {!loading && !error ? (
        <div className="demands-list">
          {groupMeta.map((meta) => {
            const rows = grouped[meta.id];
            return (
              <section className="demand-group" key={meta.id} aria-labelledby={`demand-group-${meta.id}`}>
                <div className="demand-group-header">
                  <div><h2 id={`demand-group-${meta.id}`}>{meta.label}</h2><span>{meta.helper}</span></div>
                  <strong>{rows.length}</strong>
                </div>
                {rows.length === 0 ? <div className="demand-group-empty">Nenhuma demanda neste grupo.</div> : rows.map((demand) => (
                  <button className="demand-list-row" key={demand.id} onClick={() => openDemand(demand.id)} type="button">
                    <span className={`demand-status-dot ${demand.status}`} aria-label={`Status ${demand.status}`} />
                    <span className="demand-row-title"><strong>{demand.title}</strong><small>{demand.deal?.company ?? "Deal removido"}</small></span>
                    <span className="demand-row-destination">{destinationLabels[demand.destinationType]}{demand.destinationLabel ? <small>{demand.destinationLabel}</small> : null}</span>
                    <span className={`demand-priority ${demand.priority}`}>{priorityLabels[demand.priority]}</span>
                    <span className="demand-row-assignee">{demand.assignee || "Sem responsavel"}</span>
                    <span className={`demand-row-due ${meta.id === "overdue" ? "overdue" : ""}`}>{formatDueDate(demand.dueAt, meta.id)}</span>
                  </button>
                ))}
              </section>
            );
          })}
          {filtered.length === 0 ? <div className="card demands-empty">Nenhuma demanda corresponde aos filtros atuais.</div> : null}
        </div>
      ) : null}

      {selectedDemandId ? (
        <DemandWorkspace
          demandId={selectedDemandId}
          onChanged={() => void loadDemands()}
          onClose={closeDemand}
        />
      ) : null}
    </section>
  );
}
