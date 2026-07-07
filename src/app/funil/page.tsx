"use client";

import { useEffect, useMemo, useState } from "react";
import { useCRMStore, type DealStage } from "@/store/useCRMStore";

type InstagramState =
  | { status: "loading"; reach: null; message: string }
  | { status: "live"; reach: number; message: string }
  | { status: "fallback"; reach: null; message: string };

type FunnelSource = "consolidado" | "pipeline" | "instagram" | "facebook";
type PixelState = {
  status: "loading" | "ready" | "fallback";
  configured: boolean;
  message: string;
  metrics: {
    views: number;
    ctaClicks: number;
    reportClicks: number;
    leads: number;
    sales: number;
  };
};

const numberFormatter = new Intl.NumberFormat("pt-BR");

const stageLabels: Record<DealStage, string> = {
  prospect: "Prospect",
  qualified: "Qualificado",
  proposal: "Proposta",
  negotiation: "Negociacao",
  won: "Ganho",
  lost: "Perdido",
};

export default function FunilPage() {
  const deals = useCRMStore((state) => state.deals);
  const setDeals = useCRMStore((state) => state.setDeals);
  const [instagram, setInstagram] = useState<InstagramState>({
    status: "loading",
    reach: null,
    message: "Buscando metricas do Instagram...",
  });
  const [activeSource, setActiveSource] = useState<FunnelSource>("consolidado");
  const [pixel, setPixel] = useState<PixelState>({
    status: "loading",
    configured: false,
    message: "Buscando Facebook Pixel...",
    metrics: { views: 0, ctaClicks: 0, reportClicks: 0, leads: 0, sales: 0 },
  });
  const [crmSource, setCrmSource] = useState<"loading" | "ready" | "fallback">("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadDeals() {
      try {
        const response = await fetch("/api/crm-data");
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao carregar dados do CRM");
        if (!cancelled) {
          setDeals(body.deals);
          setCrmSource("ready");
        }
      } catch {
        if (!cancelled) setCrmSource("fallback");
      }
    }

    loadDeals();
    return () => {
      cancelled = true;
    };
  }, [setDeals]);

  useEffect(() => {
    let cancelled = false;

    async function loadInstagram() {
      try {
        const response = await fetch("/api/instagram");
        const body = await response.json();

        if (!response.ok || !body.ok || !body.metrics?.reach30) {
          throw new Error(body.error ?? "Alcance indisponivel.");
        }

        if (!cancelled) {
          setInstagram({
            status: "live",
            reach: Number(body.metrics.reach30),
            message: `Alcance real de 30 dias via @${body.profile?.username ?? "Instagram"}.`,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setInstagram({
            status: "fallback",
            reach: null,
            message: error instanceof Error ? `Fallback ativo: ${error.message}` : "Fallback ativo.",
          });
        }
      }
    }

    loadInstagram();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPixel() {
      try {
        const response = await fetch("/api/facebook-pixel");
        const body = await response.json();
        if (!cancelled) {
          setPixel({
            status: response.ok ? "ready" : "fallback",
            configured: Boolean(body.configured),
            message: body.message ?? "Facebook Pixel ainda sem eventos persistidos.",
            metrics: {
              views: Number(body.metrics?.views) || 0,
              ctaClicks: Number(body.metrics?.ctaClicks) || 0,
              reportClicks: Number(body.metrics?.reportClicks) || 0,
              leads: Number(body.metrics?.leads) || 0,
              sales: Number(body.metrics?.sales) || 0,
            },
          });
        }
      } catch {
        if (!cancelled) {
          setPixel((current) => ({
            ...current,
            status: "fallback",
            message: "Facebook Pixel indisponivel neste ambiente.",
          }));
        }
      }
    }

    loadPixel();
    return () => {
      cancelled = true;
    };
  }, []);

  const funnel = useMemo(() => {
    const count = (stages: DealStage[]) => deals.filter((deal) => stages.includes(deal.stage)).length;
    const won = count(["won"]);
    const proposals = count(["proposal", "negotiation", "won"]);
    const conversations = count(["qualified", "proposal", "negotiation", "won"]);
    const leads = deals.length;
    const pixelViews = pixel.metrics.views;
    const pixelClicks = pixel.metrics.ctaClicks + pixel.metrics.reportClicks;
    // Sinais REAIS apenas: alcance do Instagram (Graph API) e cliques do Pixel/CAPI.
    // Removida a fabricacao antiga (fallbackReach 942, leads*80, leads*2.5).
    const instagramReach = instagram.reach ?? 0;
    const instagramClicks = pixelClicks;

    const sourceMetrics = {
      consolidado: {
        reach: Math.max(instagramReach, pixelViews),
        clicks: pixelClicks,
        leads,
        conversations,
        proposals,
        won,
        sourceLabel: "Pipeline + Instagram + Pixel",
      },
      pipeline: {
        reach: leads,
        clicks: leads,
        leads,
        conversations,
        proposals,
        won,
        sourceLabel: "Pipeline CRM",
      },
      instagram: {
        reach: instagramReach,
        clicks: instagramClicks,
        leads,
        conversations,
        proposals,
        won,
        sourceLabel: instagram.status === "live" ? "Instagram API" : "Instagram fallback",
      },
      facebook: {
        reach: pixelViews,
        clicks: pixelClicks,
        leads: pixel.metrics.leads,
        conversations: pixel.metrics.ctaClicks,
        proposals: pixel.metrics.reportClicks,
        won: pixel.metrics.sales,
        sourceLabel: pixel.configured ? "Facebook Pixel/CAPI" : "Facebook Pixel aguardando env",
      },
    } satisfies Record<FunnelSource, {
      reach: number;
      clicks: number;
      leads: number;
      conversations: number;
      proposals: number;
      won: number;
      sourceLabel: string;
    }>;

    const selected = sourceMetrics[activeSource];
    const { reach, clicks } = selected;
    const conversion = reach > 0 ? (selected.won / reach) * 100 : 0;

    return {
      reach,
      clicks,
      leads: selected.leads,
      conversations: selected.conversations,
      proposals: selected.proposals,
      won: selected.won,
      sourceLabel: selected.sourceLabel,
      conversion,
      proposalRate: selected.conversations > 0 ? (selected.proposals / selected.conversations) * 100 : 0,
      closingRate: selected.proposals > 0 ? (selected.won / selected.proposals) * 100 : 0,
    };
  }, [activeSource, deals, instagram.reach, instagram.status, pixel.configured, pixel.metrics]);

  const stageCounts = useMemo(
    () =>
      (Object.keys(stageLabels) as DealStage[]).map((stage) => ({
        stage,
        label: stageLabels[stage],
        count: deals.filter((deal) => deal.stage === stage).length,
      })),
    [deals],
  );

  const funnelBase = [
    { label: "Alcance", value: funnel.reach, helper: instagram.status === "live" ? "Instagram 30d" : "Instagram indisponivel" },
    { label: "Cliques", value: funnel.clicks, helper: "Pixel/CAPI" },
    { label: "Leads", value: funnel.leads, helper: "Deals totais" },
    { label: "Conversas", value: funnel.conversations, helper: "Qualified+" },
    { label: "Propostas", value: funnel.proposals, helper: "Proposal+" },
    { label: "Vendas", value: funnel.won, helper: "Won" },
  ];
  // Largura da barra proporcional ao valor REAL (antes era fixa/cosmetica).
  const maxValue = Math.max(...funnelBase.map((r) => r.value), 1);
  const funnelRows = funnelBase.map((r) => ({ ...r, width: (r.value / maxValue) * 100 }));

  const editorialSteps = funnelRows.slice(1).map((row, index) => {
    const previous = funnelRows[index];
    const rate = previous.value > 0 ? (row.value / previous.value) * 100 : 0;
    const drop = Math.max(0, 100 - rate);
    return {
      ...row,
      rate,
      drop,
      quote:
        index === 0
          ? "O interesse existe. O proximo ganho vem de CTA mais especifico."
          : index === 1
            ? "Aqui o lead aceita sair da curiosidade e entrar no sistema."
            : index === 2
              ? "Qualificacao vira conversa quando a promessa esta concreta."
              : index === 3
                ? "Proposta precisa nascer de dor clara, nao de curiosidade."
                : "Venda e consequencia de follow-up sem atrito.",
    };
  });

  const bottleneck =
    funnel.leads === 0
      ? "Sem deals reais para calcular gargalo comercial."
      : funnel.proposalRate < 35
        ? "Gargalo principal: conversas virando proposta."
        : funnel.closingRate < 30
          ? "Gargalo principal: propostas virando venda."
          : "Funil comercial inicial esta saudavel para a amostra atual.";

  return (
    <section className="editorial-funnel-page">
      <div className="funnel-kicker">Marketing <span>Design de funil</span></div>

      <header className="editorial-funnel-hero">
        <div>
          <h1>Os Funis</h1>
          <p>
            O desenho de cada funil de aquisicao nasce a cada resposta concreta, cada passo e a acao que a IA dispara em cada passo para destravar.
          </p>
        </div>
        <aside className="funnel-score">
          <span>Conversao total</span>
          <strong>{funnel.conversion.toFixed(2).replace(".", ",")}%</strong>
          <small>Alcance para vendas</small>
        </aside>
      </header>

      <nav className="funnel-tabs" aria-label="Funis">
        <button type="button">Winners na pratica</button>
        <button type="button">Fluxo 7 automacoes</button>
        <button type="button">Indicacao Landing</button>
        <button className="active" type="button">Reativacao sem culpa</button>
      </nav>

      <div className="funnel-source-filter" aria-label="Fonte do funil">
        {[
          ["consolidado", "Consolidado"],
          ["pipeline", "Pipeline"],
          ["instagram", "Instagram"],
          ["facebook", "Facebook Pixel"],
        ].map(([source, label]) => (
          <button
            className={activeSource === source ? "active" : ""}
            key={source}
            onClick={() => setActiveSource(source as FunnelSource)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="editorial-funnel-panel">
        <div className="editorial-funnel-panel-header">
          <div>
            <div className="funnel-section-eyebrow">Funil de aquisicao</div>
            <h2>Reativacao sem culpa</h2>
            <p>{funnel.sourceLabel} - recupera quem esfriou depois do clique e transforma atencao parada em conversa.</p>
          </div>
          <div className="funnel-meta-rate">
            <strong>{funnel.proposalRate.toFixed(1).replace(".", ",")}%</strong>
            <span>para proposta</span>
          </div>
        </div>

        <div className="editorial-funnel-grid">
          <div className="funnel-figure" aria-label="Representacao visual do funil">
            <div className="funnel-glow" />
            {funnelRows.map((row) => (
              <div
                className={`funnel-shape funnel-shape-${row.label.toLowerCase()}`}
                key={row.label}
                style={{ width: `${Math.max(row.width, 8)}%` }}
              >
                <strong>{numberFormatter.format(row.value)}</strong>
                <span>{row.label}</span>
              </div>
            ))}
          </div>

          <div className="funnel-analysis-list">
            {editorialSteps.map((row) => (
              <article className="funnel-analysis-row" key={row.label}>
                <div className="funnel-row-metrics">
                  <span>{row.rate.toFixed(1).replace(".", ",")}% avancam</span>
                  <strong>{row.drop.toFixed(0).replace(".", ",")}% trava</strong>
                </div>
                <div>
                  <h3>{row.label}</h3>
                  <p>{row.quote}</p>
                  <small>{numberFormatter.format(row.value)} registros - {row.helper}</small>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="funnel-notes-grid">
          <article>
            <span>Diagnostico</span>
            <strong>{bottleneck}</strong>
            <p>{activeSource === "facebook" ? pixel.message : instagram.message}</p>
          </article>
          <article>
            <span>Pipeline</span>
            <div className="stage-list">
              {stageCounts.map((item) => (
                <div className="stage-row" key={item.stage}>
                  <span>{item.label}</span>
                  <strong>{numberFormatter.format(item.count)}</strong>
                </div>
              ))}
            </div>
          </article>
          <article>
            <span>Fonte</span>
            <strong>
              {crmSource === "ready"
                ? `${numberFormatter.format(deals.length)} deals carregados`
                : crmSource === "loading"
                  ? "Carregando Supabase"
                  : "Supabase indisponivel"}
            </strong>
            <p>Dados comerciais saem da mesma base usada no Pipeline.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
