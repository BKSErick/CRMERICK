"use client";

import { useMemo, useState } from "react";
import {
  DEMAND_TIME_ZONE,
  currentMonthKey,
  demandClientName,
  formatDemandCurrency,
  formatMonthKeyLabel,
  type ClientDemand,
} from "@/lib/clientDemands";
import { ALL_PERIODS_LABEL, buildDemandReport } from "@/lib/demandReport";

type DemandDeliveredReportProps = {
  /** Demandas da pasta selecionada, sem recorte de janela nem de status. */
  demands: ClientDemand[];
  /** Cliente resolvido pela pasta. Sem ele o PDF nao tem dono e o botao fica travado. */
  reportClientId: number | null;
  onOpenDemand: (id: number) => void;
};

function shortDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: DEMAND_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" })
    .format(date);
}

export function DemandDeliveredReport({ demands, reportClientId, onOpenDemand }: DemandDeliveredReportProps) {
  const [month, setMonth] = useState(currentMonthKey());
  const [allPeriods, setAllPeriods] = useState(false);

  const report = useMemo(
    () => buildDemandReport(demands, { month: allPeriods ? null : month }),
    [allPeriods, demands, month],
  );

  const pdfHref = reportClientId
    ? `/api/demands/report?clientId=${reportClientId}&month=${allPeriods ? "all" : month}`
    : null;

  return (
    <div className="demand-delivered">
      <div className="demand-filterbar" aria-label="Periodo do relatorio">
        <label className="demand-delivered-month">
          Competencia
          <input
            disabled={allPeriods}
            onChange={(event) => setMonth(event.target.value || currentMonthKey())}
            type="month"
            value={month}
          />
        </label>

        <label className="demand-show-completed">
          <input checked={allPeriods} onChange={(event) => setAllPeriods(event.target.checked)} type="checkbox" />
          {ALL_PERIODS_LABEL}
        </label>

        {pdfHref ? (
          <a className="topbar-btn primary demand-delivered-pdf" href={pdfHref} rel="noopener noreferrer" target="_blank">
            Gerar relatorio PDF
          </a>
        ) : (
          <span className="muted-copy demand-delivered-pdf-hint">
            O relatorio sai por cliente. Selecione a pasta de um cliente para gerar o PDF.
          </span>
        )}
      </div>

      <div className="demand-window-summary">
        <strong>{report.scopeLabel}</strong>
        <span>{report.totals.count} entrega(s)</span>
        <span className="demand-window-total" title="Soma do que foi entregue no periodo">
          {formatDemandCurrency(report.totals.delivered)} entregue
        </span>
      </div>

      {report.lines.length === 0 ? (
        <div className="card demands-empty">Nenhuma entrega registrada em {report.scopeLabel.toLocaleLowerCase("pt-BR")}.</div>
      ) : (
        <>
          <div className="card demand-delivered-table">
            <div className="demand-table-scroll">
              <table className="demand-group-table">
                <thead>
                  <tr>
                    <th scope="col">Demanda</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Entregue em</th>
                    <th scope="col">Competencia</th>
                    <th scope="col">Valor</th>
                    <th scope="col">Pagamento</th>
                  </tr>
                </thead>
                <tbody>
                  {report.lines.map((line) => (
                    <tr
                      key={line.demand.id}
                      onClick={() => onOpenDemand(line.demand.id)}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpenDemand(line.demand.id);
                        }
                      }}
                    >
                      <td><span className="demand-cell-title"><strong>{line.demand.title}</strong></span></td>
                      <td className="demand-cell-muted">{demandClientName(line.demand)}</td>
                      <td className="demand-cell-date">{shortDate(line.demand.completedAt ?? line.demand.dueAt)}</td>
                      <td className="demand-cell-muted">{line.billingMonth ? formatMonthKeyLabel(line.billingMonth) : "-"}</td>
                      <td className="demand-cell-value"><strong>{formatDemandCurrency(line.value)}</strong></td>
                      <td>
                        <span className={`demand-chip ${line.isPaid ? "status-done" : "status-review"}`}>
                          {line.isPaid ? "Pago" : "Em aberto"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card demand-delivered-totals">
            <div><span>Total entregue</span><strong>{formatDemandCurrency(report.totals.delivered)}</strong></div>
            <div><span>Ja pago</span><strong>{formatDemandCurrency(report.totals.paid)}</strong></div>
            <div className="due"><span>A cobrar</span><strong>{formatDemandCurrency(report.totals.open)}</strong></div>
          </div>
        </>
      )}
    </div>
  );
}
