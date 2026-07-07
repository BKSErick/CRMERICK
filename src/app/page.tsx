"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { navItems } from "@/lib/navigation";
import { useCRMStore } from "@/store/useCRMStore";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("pt-BR");

export default function Home() {
  const deals = useCRMStore((state) => state.deals);
  const contacts = useCRMStore((state) => state.contacts);
  const setDeals = useCRMStore((state) => state.setDeals);
  const setContacts = useCRMStore((state) => state.setContacts);
  const lastError = useCRMStore((state) => state.lastError);
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">(
    deals.length > 0 || contacts.length > 0 ? "ready" : "loading"
  );

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
  const conversion = deals.length > 0 ? (wonDeals.length / deals.length) * 100 : 0;
  const proposals = deals.filter((deal) => deal.stage === "proposal" || deal.stage === "negotiation");

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
          <div className="kpi-label">Conversao geral</div>
          <div className="kpi-value">
            {dataStatus === "loading" ? (
              <span style={{ opacity: 0.5 }}>...</span>
            ) : (
              `${conversion.toFixed(1).replace(".", ",")}%`
            )}
          </div>
          <div className="kpi-trend">
            {dataStatus === "loading" ? "Carregando" : `${numberFormatter.format(deals.length)} leads mapeados`}
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
            {dataStatus === "loading" ? "Carregando" : "Conectado ao Supabase"}
          </div>
        </article>
      </div>

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

      <div className="summary-section">
        <article className="summary-card wide">
          <div className="summary-card-label">Mapa de migracao</div>
          <div className="summary-card-title">Rotas Next criadas para todos os modulos principais</div>
          <div className="summary-card-desc">
            A partir daqui, cada modulo pode ser convertido do HTML legado para React sem recriar sidebar/topbar e sem comunicacao por iframe.
          </div>
        </article>

        {navItems
          .filter((item) => item.href !== "/")
          .slice(0, 6)
          .map((item) => (
            <Link className="summary-card module-link" href={item.href} key={item.module}>
              <div className="summary-card-label">{item.status === "migrated" ? "Migrado" : "Placeholder"}</div>
              <div className="summary-card-title">{item.label}</div>
              <div className="summary-card-desc">Rota pronta para receber a conversao do modulo legado.</div>
            </Link>
          ))}
      </div>
    </section>
  );
}
