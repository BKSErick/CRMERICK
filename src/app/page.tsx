"use client";

import { useEffect, useMemo, useState } from "react";
import { BarList, ColumnChart, type ChartPoint } from "@/components/Charts";
import { useCRMStore, type Deal } from "@/store/useCRMStore";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("pt-BR");

// Rotulo em cima da coluna: "R$ 6.497" nao cabe em 6 colunas lado a lado, "6,5k" cabe.
function compactCurrency(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(".", ",").replace(",0", "")}k`;
  return numberFormatter.format(Math.round(value));
}

// #1 Briefing do dia: quem esquentou, quem esfriou e a agenda de hoje.
type BriefLead = { id: number; company: string; stage: string; phone: string; views: number; waClicks: number; linkClicks: number; daysSince?: number };
type BriefEvent = { id: number; title: string; kind: string; starts_at: string };
type Briefing = {
  ok: boolean;
  counts: { hot: number; stale: number; today: number };
  hotLeads: BriefLead[];
  staleLeads: BriefLead[];
  today: BriefEvent[];
};

function waLink(phone: string, company: string) {
  const p = phone.startsWith("55") ? phone : `55${phone}`;
  return `https://wa.me/${p}?text=${encodeURIComponent(`Oi! Falo da parte do Erick sobre a ${company}.`)}`;
}

function parseDate(value?: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

// Etapas na ordem do funil. `lost` fica de fora de proposito: o grafico existe pra
// mostrar ONDE trava, e uma barra gigante de perdidos so espreme as outras.
const FUNNEL_STAGES: { stage: Deal["stage"]; label: string }[] = [
  { stage: "prospect", label: "Prospect" },
  { stage: "abordado", label: "Abordado" },
  { stage: "followup", label: "Follow-up" },
  { stage: "qualified", label: "Qualificado" },
  { stage: "proposal", label: "Proposta" },
  { stage: "negotiation", label: "Negociacao" },
  { stage: "won", label: "Ganho" },
];

// Ultimos 6 meses fechados, do mais antigo pro mais recente.
function lastSixMonths(): { key: string; label: string }[] {
  const meses = [];
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 5; i >= 0; i--) {
    const mes = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
    meses.push({
      key: `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, "0")}`,
      label: mes.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
    });
  }
  return meses;
}

function monthKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function buildCharts(deals: Deal[]) {
  const meses = lastSixMonths();

  const funil: ChartPoint[] = FUNNEL_STAGES.map(({ stage, label }) => {
    const doStage = deals.filter((deal) => deal.stage === stage);
    const valor = doStage.reduce((sum, deal) => sum + deal.value, 0);
    return {
      label,
      value: doStage.length,
      hint: valor > 0 ? currencyFormatter.format(valor) : undefined,
    };
  });

  const ganhosPorMes: ChartPoint[] = meses.map(({ key, label }) => ({
    label,
    value: deals
      .filter((deal) => {
        if (deal.stage !== "won") return false;
        const closed = parseDate(deal.closedAt);
        return closed != null && monthKey(closed) === key;
      })
      .reduce((sum, deal) => sum + deal.value, 0),
  }));

  const entradaPorMes: ChartPoint[] = meses.map(({ key, label }) => ({
    label,
    value: deals.filter((deal) => {
      const created = parseDate(deal.createdAt);
      return created != null && monthKey(created) === key;
    }).length,
  }));

  // Origem: conta o lead e mostra quantos daquela origem fecharam. Origem em branco vira
  // "Sem origem" em vez de sumir -- lead sem procedencia registrado e o proprio achado.
  const porOrigem = new Map<string, { total: number; ganhos: number }>();
  for (const deal of deals) {
    const chave = (deal.origin ?? "").trim() || "Sem origem";
    const atual = porOrigem.get(chave) ?? { total: 0, ganhos: 0 };
    atual.total++;
    if (deal.stage === "won") atual.ganhos++;
    porOrigem.set(chave, atual);
  }
  const origens: ChartPoint[] = [...porOrigem.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 6)
    .map(([label, { total, ganhos }]) => ({
      label,
      value: total,
      hint: ganhos > 0 ? `${ganhos} ganho${ganhos > 1 ? "s" : ""}` : undefined,
    }));

  return { funil, ganhosPorMes, entradaPorMes, origens };
}

export default function Home() {
  const deals = useCRMStore((state) => state.deals);
  const contacts = useCRMStore((state) => state.contacts);
  const setDeals = useCRMStore((state) => state.setDeals);
  const setContacts = useCRMStore((state) => state.setContacts);
  const lastError = useCRMStore((state) => state.lastError);
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">(
    deals.length > 0 || contacts.length > 0 ? "ready" : "loading"
  );
  const [briefing, setBriefing] = useState<Briefing | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/briefing");
        const body = await res.json();
        if (!cancelled && res.ok && body.ok) setBriefing(body as Briefing);
      } catch {
        // briefing e complementar; a home funciona sem ele
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  const wonDeals = deals.filter((deal) => deal.stage === "won");
  const openDeals = deals.filter((deal) => deal.stage !== "won" && deal.stage !== "lost");
  const mrr = wonDeals.reduce((sum, deal) => sum + deal.value, 0);
  const pipelineValue = openDeals.reduce((sum, deal) => sum + deal.value, 0);
  const proposals = deals.filter((deal) => deal.stage === "proposal" || deal.stage === "negotiation");

  // Conversao de PROPOSTA, nao conversao geral. A geral divide os ganhos pela base
  // inteira (~1.4k leads frios importados) e da 0,2% -- numero que nao muda quando a
  // operacao melhora, entao nao serve pra decidir nada. O que decide e: de quem chegou
  // a receber proposta, quanto fecha.
  const propostaOuAlem = deals.filter((deal) =>
    ["proposal", "negotiation", "won"].includes(deal.stage) || (deal.stage === "lost" && deal.value > 0),
  );
  const proposalConversion = propostaOuAlem.length > 0 ? (wonDeals.length / propostaOuAlem.length) * 100 : 0;
  const avgTicket = wonDeals.length > 0 ? mrr / wonDeals.length : 0;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const wonThisMonth = wonDeals.filter((deal) => {
    const closed = parseDate(deal.closedAt);
    return closed != null && closed >= monthStart.getTime();
  });
  const wonThisMonthValue = wonThisMonth.reduce((sum, deal) => sum + deal.value, 0);

  const charts = useMemo(() => buildCharts(deals), [deals]);

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Inicio</h1>
          <div className="subtitle">
            Visao de entrada do sistema conectada ao Supabase real via rotas server-side.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Migracao</div>
          <div className="value">Fase 1</div>
        </div>
      </div>

      {lastError ? <div className="portfolio-status warning" style={{ marginBottom: "18px" }}>{lastError}</div> : null}
      {dataStatus === "error" ? (
        <div className="portfolio-status warning" style={{ marginBottom: "18px" }}>Nao foi possivel carregar os dados reais do Supabase.</div>
      ) : null}

      <div className="filterbar">
        <div className="filter-group">Hoje</div>
        <div className="filter-group">Todas as origens</div>
        <div className="filter-group">Todas as frentes</div>
        <div className="filter-group">Prioridade operacional</div>
      </div>

      <div className="kpi-row">
        <article className="kpi-card">
          <div className="kpi-label">MRR ativo</div>
          <div className="kpi-value">
            {dataStatus === "loading" ? (
              <span style={{ opacity: 0.5 }}>...</span>
            ) : (
              currencyFormatter.format(mrr)
            )}
          </div>
          <div className="kpi-trend up">
            {dataStatus === "loading" ? "Carregando" : `${numberFormatter.format(wonDeals.length)} deals ganhos`}
          </div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Pipeline aberto</div>
          <div className="kpi-value">
            {dataStatus === "loading" ? (
              <span style={{ opacity: 0.5 }}>...</span>
            ) : (
              currencyFormatter.format(pipelineValue)
            )}
          </div>
          <div className="kpi-trend">
            {dataStatus === "loading" ? "Carregando" : `${numberFormatter.format(openDeals.length)} deals ativos`}
          </div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Proposta &rarr; ganho</div>
          <div className="kpi-value">
            {dataStatus === "loading" ? (
              <span style={{ opacity: 0.5 }}>...</span>
            ) : (
              `${proposalConversion.toFixed(1).replace(".", ",")}%`
            )}
          </div>
          <div className="kpi-trend">
            {dataStatus === "loading"
              ? "Carregando"
              : `${numberFormatter.format(wonDeals.length)} de ${numberFormatter.format(propostaOuAlem.length)} que chegaram a proposta`}
          </div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Ganhos no mes</div>
          <div className="kpi-value">
            {dataStatus === "loading" ? (
              <span style={{ opacity: 0.5 }}>...</span>
            ) : (
              currencyFormatter.format(wonThisMonthValue)
            )}
          </div>
          <div className="kpi-trend">
            {dataStatus === "loading" ? "Carregando" : `${numberFormatter.format(wonThisMonth.length)} fechado(s) desde o dia 1`}
          </div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Ticket medio</div>
          <div className="kpi-value">
            {dataStatus === "loading" ? (
              <span style={{ opacity: 0.5 }}>...</span>
            ) : (
              currencyFormatter.format(avgTicket)
            )}
          </div>
          <div className="kpi-trend">
            {dataStatus === "loading" ? "Carregando" : "Media dos deals ganhos"}
          </div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Contatos</div>
          <div className="kpi-value">
            {dataStatus === "loading" ? (
              <span style={{ opacity: 0.5 }}>...</span>
            ) : (
              numberFormatter.format(contacts.length)
            )}
          </div>
          <div className="kpi-trend up">
            {dataStatus === "loading" ? "Carregando" : `${numberFormatter.format(deals.length)} leads mapeados`}
          </div>
        </article>
      </div>

      {briefing && (briefing.counts.hot > 0 || briefing.counts.stale > 0 || briefing.counts.today > 0) ? (
        <article className="card" style={{ marginBottom: "18px" }}>
          <div className="card-header">
            <div className="card-title">Briefing do dia</div>
            <span className="card-badge">IA + sinais</span>
          </div>
          <div className="grid-2col" style={{ gap: "18px" }}>
            <div>
              <p className="focus-title" style={{ marginBottom: "8px" }}>
                🔥 Esquentaram ({briefing.counts.hot})
              </p>
              {briefing.hotLeads.length === 0 ? (
                <p className="muted-copy">Ninguém quente nas últimas 48h.</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                  {briefing.hotLeads.map((l) => (
                    <li key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "13px" }}>
                        <strong>{l.company}</strong>
                        <span className="muted-copy" style={{ marginLeft: "6px", fontSize: "11px" }}>
                          {l.views} abertura(s){l.waClicks > 0 ? ", clicou no WhatsApp" : ""}
                        </span>
                      </span>
                      {l.phone ? (
                        <a className="topbar-btn primary" href={waLink(l.phone, l.company)} rel="noreferrer" target="_blank" style={{ fontSize: "11px" }}>
                          WhatsApp
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="focus-title" style={{ marginBottom: "8px" }}>
                🧊 Parados no follow-up ({briefing.counts.stale})
              </p>
              {briefing.staleLeads.length === 0 ? (
                <p className="muted-copy">Nada atrasado. Follow-up em dia.</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                  {briefing.staleLeads.map((l) => (
                    <li key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "13px" }}>
                        <strong>{l.company}</strong>
                        <span className="muted-copy" style={{ marginLeft: "6px", fontSize: "11px" }}>há {l.daysSince} dias sem contato</span>
                      </span>
                      {l.phone ? (
                        <a className="topbar-btn" href={waLink(l.phone, l.company)} rel="noreferrer" target="_blank" style={{ fontSize: "11px" }}>
                          Cobrar
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {briefing.today.length > 0 ? (
            <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--line, #e0dcec)" }}>
              <p className="focus-title" style={{ marginBottom: "6px" }}>📅 Hoje na agenda</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {briefing.today.map((e) => (
                  <span key={e.id} className="status-pill">
                    {new Date(e.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {e.title}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      ) : null}

      <div className="grid-2col">
        <article className="card">
          <div className="card-header">
            <div className="card-title">Prioridade do dia</div>
            <span className="card-badge">Pipeline</span>
          </div>
          <p className="focus-title">Desbloquear propostas em negociacao</p>
          <p className="muted-copy">
            {dataStatus === "loading" ? (
              "Buscando oportunidades pendentes..."
            ) : proposals.length > 0 ? (
              `${proposals.length} deals estao entre proposta e negociacao. O maior valor aberto e ${currencyFormatter.format(
                Math.max(...proposals.map((deal) => deal.value)),
              )}.`
            ) : (
              "Nenhuma proposta pendente no momento."
            )}
          </p>
        </article>

        <article className="card">
          <div className="card-header">
            <div className="card-title">Seguranca</div>
            <span className="card-badge">Server-side</span>
          </div>
          <p className="focus-title">Instagram via `/api/instagram`</p>
          <p className="muted-copy">
            A rota Next.js ja le `IG_ACCESS_TOKEN` e `IG_BUSINESS_ACCOUNT_ID` no servidor. O frontend nao recebe token.
          </p>
        </article>
      </div>

      {/* Substituiu o bloco "Mapa de migracao" em 27/08/2026: aquele painel listava as
          rotas Next criadas durante a migracao do HTML legado, que ja acabou -- era
          andaime, nao informacao de operacao. */}
      <div className="grid-2col" style={{ marginTop: "18px" }}>
        <article className="card">
          <div className="card-header">
            <div className="card-title">Funil por etapa</div>
            <span className="card-badge">deals abertos + ganhos</span>
          </div>
          <BarList
            data={charts.funil}
            emptyMessage="Nenhum deal nas etapas do funil ainda."
            formatValue={(value) => numberFormatter.format(value)}
          />
        </article>

        <article className="card">
          <div className="card-header">
            <div className="card-title">Origem dos leads</div>
            <span className="card-badge">top 6</span>
          </div>
          <BarList
            data={charts.origens}
            emptyMessage="Nenhum lead com origem registrada."
            formatValue={(value) => numberFormatter.format(value)}
          />
        </article>

        <article className="card">
          <div className="card-header">
            <div className="card-title">Fechamentos por mes</div>
            <span className="card-badge">6 meses</span>
          </div>
          <ColumnChart
            data={charts.ganhosPorMes}
            emptyMessage="Nenhum fechamento com data registrada nos ultimos 6 meses."
            formatValue={(value) => compactCurrency(value)}
            title="Fechamentos por mes"
          />
        </article>

        <article className="card">
          <div className="card-header">
            <div className="card-title">Leads entrando por mes</div>
            <span className="card-badge">6 meses</span>
          </div>
          <ColumnChart
            data={charts.entradaPorMes}
            emptyMessage="Nenhum lead criado nos ultimos 6 meses."
            formatValue={(value) => numberFormatter.format(value)}
            title="Leads entrando por mes"
          />
        </article>
      </div>
    </section>
  );
}
