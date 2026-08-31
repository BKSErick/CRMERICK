// Relatorio de entregas para cobranca. Puro (sem Supabase, sem React) porque a tela e o
// PDF leem daqui: se cada um somasse do seu jeito, o numero que o cliente recebe seria
// diferente do numero que aparece na tela. Import relativo com extensao para os testes
// carregarem direto em `node --test`.
import {
  currentMonthKey,
  demandBilledTotal,
  demandBillingMonth,
  demandBillsInMonth,
  demandPaidInMonth,
  demandPaidTotal,
  demandValueInMonth,
  formatMonthKeyLabel,
  type ClientDemand,
} from "./clientDemands.ts";

/** `month: null` e o modo "todo o periodo". */
export type DemandReportScope = { month: string | null };

export type DemandReportLine = {
  demand: ClientDemand;
  billingMonth: string | null;
  value: number;
  paid: number;
  isPaid: boolean;
};

export type DemandReportTotals = {
  count: number;
  delivered: number;
  paid: number;
  open: number;
};

export type DemandReport = {
  scopeLabel: string;
  month: string | null;
  lines: DemandReportLine[];
  totals: DemandReportTotals;
};

export const ALL_PERIODS_LABEL = "Todo o periodo";

export function demandReportScopeLabel(month: string | null) {
  return month ? formatMonthKeyLabel(month) : ALL_PERIODS_LABEL;
}

/** Entrega mais recente primeiro; sem data de conclusao cai pelo prazo, depois pelo id. */
function compareLines(left: DemandReportLine, right: DemandReportLine) {
  const byCompleted = (right.demand.completedAt ?? "").localeCompare(left.demand.completedAt ?? "");
  if (byCompleted !== 0) return byCompleted;
  const byDue = (right.demand.dueAt ?? "").localeCompare(left.demand.dueAt ?? "");
  if (byDue !== 0) return byDue;
  return right.demand.id - left.demand.id;
}

/**
 * Monta o relatorio do que ja foi entregue. So `done` entra: cancelada nao gera cobranca e
 * demanda em andamento ainda nao virou trabalho faturavel.
 *
 * No modo mes a conta e a mesma que a aba Clientes ja usa (`demandValueInMonth`), entao
 * parcelado cobra a parcela do mes e mensal cobra um mes. No modo "todo o periodo" a
 * demanda vale o acumulado dela (`demandBilledTotal`).
 */
export function buildDemandReport(
  demands: ClientDemand[],
  scope: DemandReportScope,
  now = new Date(),
): DemandReport {
  const month = scope.month;
  const untilMonth = currentMonthKey(now);

  const lines: DemandReportLine[] = [];
  for (const demand of demands) {
    if (demand.status !== "done") continue;

    if (month) {
      if (!demandBillsInMonth(demand, month)) continue;
      const value = demandValueInMonth(demand, month);
      const paid = demandPaidInMonth(demand, month);
      lines.push({ demand, billingMonth: month, value, paid, isPaid: value > 0 && paid >= value });
      continue;
    }

    const value = demandBilledTotal(demand, untilMonth);
    const paid = demandPaidTotal(demand, untilMonth);
    lines.push({
      demand,
      billingMonth: demandBillingMonth(demand),
      value,
      paid,
      isPaid: value > 0 && paid >= value,
    });
  }

  lines.sort(compareLines);

  const delivered = lines.reduce((total, line) => total + line.value, 0);
  const paid = lines.reduce((total, line) => total + line.paid, 0);

  return {
    scopeLabel: demandReportScopeLabel(month),
    month,
    lines,
    totals: {
      count: lines.length,
      delivered,
      paid,
      // Nunca negativo: pagamento a maior seria erro de baixa, nao credito a cobrar.
      open: Math.max(0, delivered - paid),
    },
  };
}
