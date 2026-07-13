"use client";

import { useEffect, useState } from "react";

// North Star = painel da meta de R$15k/mes. Todos os numeros vem da rota server-side
// /api/north-star (deals + activities reais + curva de content/goals.json). Zero fabricado:
// mes sem fechamento mostra estado vazio elegante, nunca numero inventado.

type WonDeal = { id: number; company: string; value: number; recurring: boolean; closedAt: string | null };
type NorthStar = {
  month: string;
  target: number;
  weekTarget: number;
  realized: number;
  gap: number;
  pct: number;
  closedCount: number;
  avgTicket: number;
  businessDays: { total: number; elapsed: number; remaining: number };
  dailyPaceNeeded: number;
  projection: number;
  mrrActive: number;
  mrrFloor: { month: string; value: number };
  funnel: Record<string, number>;
  wonDeals: WonDeal[];
  wonNoValueCount: number;
  wonNoDateCount: number;
  yearView: Array<{ month: string; target: number; realized: number }>;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${m}/${y}`;
}

const STAGE_LABELS: Array<[string, string]> = [
  ["prospect", "Prospect"],
  ["abordado", "Abordado"],
  ["qualified", "Qualified"],
  ["proposal", "Proposal"],
  ["negotiation", "Negotiation"],
  ["won", "Won"],
  ["lost", "Lost"],
];

export default function NorthStarPage() {
  const [data, setData] = useState<NorthStar | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/north-star");
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao carregar a meta");
        if (!cancelled) {
          setData(body.northStar as NorthStar);
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

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>North Star</h1>
          <div className="subtitle">
            Painel da meta de faturamento do mes, alimentado pelos deals reais do CRM. Quanto falta, em que ritmo e o que o funil diz.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Mes</div>
          <div className="value">{data ? monthLabel(data.month) : "-"}</div>
        </div>
      </div>

      {status === "loading" ? (
        <div className="connection-status fallback">Carregando a meta do mes...</div>
      ) : status === "error" || !data ? (
        <div className="portfolio-status warning">Nao foi possivel carregar os dados da meta.</div>
      ) : (
        <>
          <div className="kpi-row">
            <article className="kpi-card">
              <div className="kpi-label">Meta do mes</div>
              <div className="kpi-value">{BRL.format(data.target)}</div>
              <div className="kpi-trend">Curva do plano</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Realizado</div>
              <div className="kpi-value">{BRL.format(data.realized)}</div>
              <div className="kpi-trend up">{(data.pct * 100).toFixed(0)}% da meta</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Gap restante</div>
              <div className="kpi-value">{BRL.format(data.gap)}</div>
              <div className="kpi-trend down">Falta fechar</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Projecao fim do mes</div>
              <div className="kpi-value">{data.projection > 0 ? BRL.format(data.projection) : "-"}</div>
              <div className="kpi-trend">Pelo ritmo atual</div>
            </article>
          </div>

          <div className="card" style={{ margin: "8px 0 24px" }}>
            <div style={{ height: "10px", borderRadius: "6px", background: "var(--color-cloud, #e8e8e8)", overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${Math.min(100, data.pct * 100)}%`, background: "var(--color-brand-violet, #7b68ee)" }} />
            </div>
          </div>

          {data.closedCount === 0 ? (
            <div className="connection-status fallback" style={{ marginBottom: "24px" }}>
              Nenhum fechamento ainda este mes. Mova um deal para &quot;Won&quot; com valor preenchido e ele aparece aqui.
            </div>
          ) : null}

          <div className="card-header" style={{ marginBottom: "12px" }}>
            <div className="card-title">Quebra dia / semana / mes</div>
          </div>
          <div className="kpi-row">
            <article className="kpi-card">
              <div className="kpi-label">Meta da semana</div>
              <div className="kpi-value">{BRL.format(data.weekTarget)}</div>
              <div className="kpi-trend">Meta / 4</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Ritmo necessario</div>
              <div className="kpi-value">{BRL.format(data.dailyPaceNeeded)}</div>
              <div className="kpi-trend">Por dia util ({data.businessDays.remaining} restantes)</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Ticket medio</div>
              <div className="kpi-value">{data.avgTicket > 0 ? BRL.format(data.avgTicket) : "-"}</div>
              <div className="kpi-trend">Ganhos do mes</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Fechamentos</div>
              <div className="kpi-value">{data.closedCount}</div>
              <div className="kpi-trend up">No mes</div>
            </article>
          </div>

          <div className="card-header" style={{ margin: "24px 0 12px" }}>
            <div className="card-title">MRR ativo</div>
            <span className="card-badge">Ponto de nao-retorno</span>
          </div>
          <div className="kpi-row">
            <article className="kpi-card">
              <div className="kpi-label">MRR ativo (recorrentes ganhos)</div>
              <div className="kpi-value">{BRL.format(data.mrrActive)}</div>
              <div className="kpi-trend up">Separado do one-off</div>
            </article>
            {data.mrrFloor.value > 0 ? (
              <article className="kpi-card">
                <div className="kpi-label">Piso de MRR ({monthLabel(data.mrrFloor.month)})</div>
                <div className="kpi-value">{BRL.format(data.mrrFloor.value)}</div>
                <div className="kpi-trend">{data.mrrActive >= data.mrrFloor.value ? "Piso atingido" : "Abaixo do piso"}</div>
              </article>
            ) : null}
          </div>

          <div className="card-header" style={{ margin: "24px 0 12px" }}>
            <div className="card-title">Funil (estado atual)</div>
            <span className="card-badge">Deals por etapa</span>
          </div>
          <div className="kpi-row">
            {STAGE_LABELS.map(([id, label]) => (
              <article className="kpi-card" key={id}>
                <div className="kpi-label">{label}</div>
                <div className="kpi-value">{data.funnel[id] ?? 0}</div>
                <div className="kpi-trend">deals</div>
              </article>
            ))}
          </div>

          <div className="card-header" style={{ margin: "24px 0 12px" }}>
            <div className="card-title">Visao do ano</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mes</th>
                  <th>Meta</th>
                  <th>Realizado</th>
                </tr>
              </thead>
              <tbody>
                {data.yearView.map((row) => (
                  <tr key={row.month}>
                    <td>{monthLabel(row.month)}</td>
                    <td>{BRL.format(row.target)}</td>
                    <td>{row.realized > 0 ? BRL.format(row.realized) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card-header" style={{ margin: "24px 0 12px" }}>
            <div className="card-title">Ganhos do mes</div>
            {data.wonNoValueCount > 0 || data.wonNoDateCount > 0 ? (
              <span className="card-badge">
                {data.wonNoValueCount} sem valor / {data.wonNoDateCount} sem data
              </span>
            ) : null}
          </div>
          {data.wonDeals.length === 0 ? (
            <div className="connection-status fallback">Nenhum deal ganho registrado neste mes.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Valor</th>
                    <th>Tipo</th>
                    <th>Fechado em</th>
                  </tr>
                </thead>
                <tbody>
                  {data.wonDeals.map((deal) => (
                    <tr key={deal.id}>
                      <td>{deal.company}</td>
                      <td>{deal.value > 0 ? BRL.format(deal.value) : "sem valor informado"}</td>
                      <td>{deal.recurring ? "Recorrente (MRR)" : "One-off"}</td>
                      <td>{deal.closedAt ? monthLabel(deal.closedAt.slice(0, 7)) : "sem data"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
