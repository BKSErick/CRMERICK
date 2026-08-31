"use client";

import { useState } from "react";
import { DemandDeliveredReport } from "@/components/DemandDeliveredReport";
import {
  DEMAND_PRIORITY_LABELS,
  DEMAND_STATUS_LABELS,
  DEMAND_TIME_ZONE,
  demandClientName,
  formatDemandCurrency,
  isClosedDemand,
  type ClientDemand,
  type DemandOverview as DemandOverviewData,
  type DemandStatus,
} from "@/lib/clientDemands";
import { DEMAND_DRAG_TYPE } from "@/components/DemandTree";
import type { DemandTreeNode } from "@/lib/demandFolders";

/** Visoes da aba. Lista/Quadro/Calendario entram aqui quando existirem. */
const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "delivered", label: "Entregues" },
] as const;

type DemandView = (typeof VIEWS)[number]["id"];

const WINDOW_OPTIONS = [7, 14, 30] as const;
const WIDEST_WINDOW = WINDOW_OPTIONS[WINDOW_OPTIONS.length - 1];

/** Chips de recorte rapido: so os estados abertos. Entregue/Cancelada entram por "Mostrar entregues". */
const FILTER_STATUSES: DemandStatus[] = ["todo", "in_progress", "review"];

type DemandOverviewProps = {
  path: DemandTreeNode[];
  overview: DemandOverviewData;
  windowDays: number;
  onWindowDaysChange: (days: number) => void;
  assignees: string[];
  selectedAssignees: string[];
  onToggleAssignee: (name: string) => void;
  selectedStatuses: DemandStatus[];
  onToggleStatus: (status: DemandStatus) => void;
  showCompleted: boolean;
  onShowCompletedChange: (value: boolean) => void;
  query: string;
  onQueryChange: (value: string) => void;
  onOpenDemand: (id: number) => void;
  onDeleteDemand: (demand: ClientDemand) => void;
  onCreateDemand: () => void;
  createLabel: string;
  /** Demandas cruas da pasta, sem janela nem filtro de status: a aba Entregues precisa de tudo. */
  nodeDemands: ClientDemand[];
  reportClientId: number | null;
};

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toLocaleUpperCase("pt-BR");
}

function shortDate(value: string | null) {
  if (!value) return "Sem prazo";
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: DEMAND_TIME_ZONE, day: "2-digit", month: "short" })
    .formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")} ${part("month").replace(".", "")}`;
}

function clientTag(demand: ClientDemand) {
  const first = demandClientName(demand).trim().split(/\s+/)[0] ?? "";
  return first.slice(0, 12).toLocaleUpperCase("pt-BR");
}

/** Soma o que esta na tela. Mensal conta uma vez: aqui a lista e por prazo, nao por mes. */
function sumValues(demands: ClientDemand[]) {
  return demands.reduce((total, demand) => total + (demand.status === "cancelled" ? 0 : demand.value), 0);
}

function valueLabel(demands: ClientDemand[]) {
  const total = sumValues(demands);
  return total > 0 ? formatDemandCurrency(total) : "";
}

function DemandRows({ demands, overdue, onOpenDemand, onDeleteDemand }: {
  demands: ClientDemand[];
  overdue: boolean;
  onOpenDemand: (id: number) => void;
  onDeleteDemand: (demand: ClientDemand) => void;
}) {
  return (
    <div className="demand-table-scroll">
      <table className="demand-group-table">
        <thead>
          <tr>
            <th scope="col">Demanda</th>
            <th scope="col">Cliente</th>
            <th scope="col">Resp.</th>
            <th scope="col">Data</th>
            <th scope="col">Valor</th>
            <th scope="col">Prioridade</th>
            <th scope="col">Status</th>
            <th scope="col"><span className="sr-only">Acoes</span></th>
          </tr>
        </thead>
        <tbody>
          {demands.map((demand) => (
            <tr
              className={isClosedDemand(demand) ? "demand-row-closed" : ""}
              draggable
              key={demand.id}
              onClick={() => onOpenDemand(demand.id)}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(DEMAND_DRAG_TYPE, String(demand.id));
              }}
              tabIndex={0}
              title="Arraste para uma pasta"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenDemand(demand.id);
                }
              }}
            >
              <td>
                <span className="demand-cell-title">
                  {clientTag(demand) ? <span className="demand-client-tag">{clientTag(demand)}</span> : null}
                  <strong>{demand.title}</strong>
                </span>
              </td>
              <td className="demand-cell-muted">{demandClientName(demand)}</td>
              <td>
                {demand.assignee ? (
                  <span className="demand-avatar" title={demand.assignee}>{initials(demand.assignee)}</span>
                ) : (
                  <span className="demand-cell-muted">-</span>
                )}
              </td>
              {/* Entregue nunca sai em vermelho: o atraso e do grupo, mas ela ja saiu da conta. */}
              <td className={`demand-cell-date ${overdue && !isClosedDemand(demand) ? "overdue" : ""}`}>{shortDate(demand.dueAt)}</td>
              <td className="demand-cell-value">
                {demand.value > 0 ? (
                  <>
                    <strong>{formatDemandCurrency(demand.value)}</strong>
                    {demand.billingType === "monthly" ? <small>/mes</small> : null}
                    {demand.billingType === "installment" && demand.charges.length > 0 ? (
                      <small>{demand.charges.length}x</small>
                    ) : null}
                  </>
                ) : (
                  <span className="demand-cell-muted">-</span>
                )}
              </td>
              <td><span className={`demand-flag ${demand.priority}`}>{DEMAND_PRIORITY_LABELS[demand.priority]}</span></td>
              <td><span className={`demand-chip status-${demand.status}`}>{DEMAND_STATUS_LABELS[demand.status]}</span></td>
              <td className="demand-cell-actions">
                <button
                  aria-label={`Excluir ${demand.title}`}
                  className="demand-row-action"
                  onClick={(event) => { event.stopPropagation(); onDeleteDemand(demand); }}
                  title="Excluir demanda"
                  type="button"
                >
                  {"×"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DemandGroup({ title, meta, count, defaultOpen, tone, demands, overdue, onOpenDemand, onDeleteDemand }: {
  title: string;
  meta?: string;
  count: number;
  defaultOpen: boolean;
  tone?: "overdue";
  demands: ClientDemand[];
  overdue: boolean;
  onOpenDemand: (id: number) => void;
  onDeleteDemand: (demand: ClientDemand) => void;
}) {
  return (
    <details className={`demand-group ${tone ?? ""}`} open={defaultOpen}>
      <summary>
        <span className="demand-group-title">{title}</span>
        {meta ? <span className="demand-group-meta">{meta}</span> : null}
        {valueLabel(demands) ? <span className="demand-group-value">{valueLabel(demands)}</span> : null}
        <span className="demand-group-count">{count}</span>
      </summary>
      <DemandRows demands={demands} onDeleteDemand={onDeleteDemand} overdue={overdue} onOpenDemand={onOpenDemand} />
    </details>
  );
}

export function DemandOverview({
  path,
  overview,
  windowDays,
  onWindowDaysChange,
  assignees,
  selectedAssignees,
  onToggleAssignee,
  selectedStatuses,
  onToggleStatus,
  showCompleted,
  onShowCompletedChange,
  query,
  onQueryChange,
  onOpenDemand,
  onDeleteDemand,
  onCreateDemand,
  createLabel,
  nodeDemands,
  reportClientId,
}: DemandOverviewProps) {
  const [view, setView] = useState<DemandView>("overview");
  const heading = path.length > 0 ? path[path.length - 1].label : "Todas as demandas";
  const breadcrumb = path.slice(0, -1).map((node) => node.label);
  const empty = overview.scheduledTotal === 0
    && overview.noDue.length === 0
    && overview.completed.length === 0
    && overview.beyondWindow === 0;
  const visible = [
    ...overview.overdue,
    ...overview.days.flatMap((day) => day.demands),
    ...overview.noDue,
    ...overview.completed,
  ];
  const visibleTotal = sumValues(visible);

  return (
    <div className="demand-content">
      <header className="demand-content-header">
        <div>
          {breadcrumb.length > 0 ? <div className="demand-breadcrumb">{breadcrumb.join(" / ")}</div> : null}
          <h1>{heading}</h1>
        </div>
        <button className="topbar-btn primary" onClick={onCreateDemand} type="button">{createLabel}</button>
      </header>

      <div className="demand-view-tabs" role="tablist" aria-label="Visoes da aba Demandas">
        {VIEWS.map((item) => (
          <button
            aria-selected={view === item.id}
            className={view === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setView(item.id)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* A aba Entregues e para faturar: ela ignora a janela de dias e soma o periodo inteiro. */}
      {view === "delivered" ? (
        <DemandDeliveredReport demands={nodeDemands} onOpenDemand={onOpenDemand} reportClientId={reportClientId} />
      ) : (
      <>
      <div className="demand-filterbar" aria-label="Filtros de demandas">
        <div className="demand-segmented" role="group" aria-label="Janela de prazo">
          {WINDOW_OPTIONS.map((days) => (
            <button
              aria-pressed={windowDays === days}
              className={windowDays === days ? "active" : ""}
              key={days}
              onClick={() => onWindowDaysChange(days)}
              type="button"
            >
              {days} dias
            </button>
          ))}
        </div>

        {assignees.length > 0 ? (
          <div className="demand-avatar-filter" role="group" aria-label="Responsaveis">
            {assignees.map((name) => (
              <button
                aria-pressed={selectedAssignees.includes(name)}
                className={`demand-avatar ${selectedAssignees.includes(name) ? "active" : ""}`}
                key={name}
                onClick={() => onToggleAssignee(name)}
                title={name}
                type="button"
              >
                {initials(name)}
              </button>
            ))}
          </div>
        ) : null}

        <div className="demand-chip-filter" role="group" aria-label="Status">
          {FILTER_STATUSES.map((status) => (
            <button
              aria-pressed={selectedStatuses.includes(status)}
              className={`demand-chip status-${status} ${selectedStatuses.includes(status) ? "active" : ""}`}
              key={status}
              onClick={() => onToggleStatus(status)}
              type="button"
            >
              {DEMAND_STATUS_LABELS[status]}
            </button>
          ))}
        </div>

        <label className="demand-show-completed">
          <input checked={showCompleted} onChange={(event) => onShowCompletedChange(event.target.checked)} type="checkbox" />
          Mostrar entregues
        </label>

        <label className="demand-filter-search">
          <span className="sr-only">Buscar tarefa</span>
          <input placeholder="Buscar tarefa" value={query} onChange={(event) => onQueryChange(event.target.value)} />
        </label>
      </div>

      <div className="demand-window-summary">
        <strong>Proximos {overview.windowDays} dias</strong>
        <span>{overview.scheduledTotal} tarefa(s)</span>
        {overview.overdue.length > 0 ? <span className="overdue">{overview.overdue.length} atrasada(s)</span> : null}
        {visibleTotal > 0 ? (
          <span className="demand-window-total" title="Soma das demandas listadas nesta tela">
            {formatDemandCurrency(visibleTotal)} na tela
          </span>
        ) : null}
      </div>

      {empty ? <div className="card demands-empty">Nenhuma demanda corresponde aos filtros atuais.</div> : null}

      {overview.overdue.length > 0 ? (
        <DemandGroup
          count={overview.overdue.length}
          defaultOpen
          demands={overview.overdue}
          onDeleteDemand={onDeleteDemand}
          onOpenDemand={onOpenDemand}
          overdue
          title="Atrasadas"
          tone="overdue"
        />
      ) : null}

      {overview.days.map((day) => (
        <DemandGroup
          count={day.demands.length}
          defaultOpen
          demands={day.demands}
          key={day.dateKey}
          meta={day.dateLabel}
          onDeleteDemand={onDeleteDemand}
          onOpenDemand={onOpenDemand}
          overdue={false}
          title={day.weekday}
        />
      ))}

      {overview.noDue.length > 0 ? (
        <DemandGroup
          count={overview.noDue.length}
          defaultOpen={false}
          demands={overview.noDue}
          onDeleteDemand={onDeleteDemand}
          onOpenDemand={onOpenDemand}
          overdue={false}
          title="Sem data de entrega"
        />
      ) : null}

      {/* Entregue com prazo dentro da janela fica no dia dela; o resto cai aqui em vez
          de voltar como atrasada. So aparece com "Mostrar entregues" ligado. */}
      {overview.completed.length > 0 ? (
        <DemandGroup
          count={overview.completed.length}
          defaultOpen={false}
          demands={overview.completed}
          onDeleteDemand={onDeleteDemand}
          onOpenDemand={onOpenDemand}
          overdue={false}
          title="Entregues"
        />
      ) : null}

      {/* Na janela maxima nao ha para onde esticar: vira so aviso. */}
      {overview.beyondWindow > 0 ? (
        windowDays < WIDEST_WINDOW ? (
          <button className="demand-beyond-window" onClick={() => onWindowDaysChange(WIDEST_WINDOW)} type="button">
            Mais {overview.beyondWindow} tarefa(s) com vencimento alem de {overview.windowDays} dias.
            {" "}Ver em {WIDEST_WINDOW} dias.
          </button>
        ) : (
          <p className="demand-beyond-window">
            Mais {overview.beyondWindow} tarefa(s) com vencimento alem de {overview.windowDays} dias.
          </p>
        )
      ) : null}
      </>
      )}
    </div>
  );
}
