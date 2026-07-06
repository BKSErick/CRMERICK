"use client";

import { useMemo } from "react";
import { useCRMStore, type Deal } from "@/store/useCRMStore";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const staleDays = 30;

function daysSince(dateValue?: string) {
  if (!dateValue) return null;
  const timestamp = new Date(dateValue).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.floor((Date.now() - timestamp) / 86400000);
}

function churnStatus(deal: Deal) {
  const updatedAt = deal.updated_at;
  const days = daysSince(updatedAt);

  if (!updatedAt || days == null) {
    return {
      label: "Sem interacao registrada",
      tone: "warning",
      lastTouch: "Nao informado",
    };
  }

  if (days > staleDays) {
    return {
      label: `${days} dias sem interacao`,
      tone: "danger",
      lastTouch: dateFormatter.format(new Date(updatedAt)),
    };
  }

  return {
    label: "Saudavel",
    tone: "success",
    lastTouch: dateFormatter.format(new Date(updatedAt)),
  };
}

export default function CarteiraPage() {
  const deals = useCRMStore((state) => state.deals);
  const contacts = useCRMStore((state) => state.contacts);

  const activeClients = useMemo(() => {
    return deals
      .filter((deal) => deal.stage === "won")
      .map((deal) => {
        const contact = contacts.find((item) => item.company === deal.company || item.name === deal.company);
        return {
          deal,
          contactName: contact?.name ?? deal.company,
          company: contact?.company ?? deal.company,
          status: churnStatus(deal),
        };
      });
  }, [contacts, deals]);

  const mrr = activeClients.reduce((sum, client) => sum + client.deal.value, 0);
  const averageTicket = activeClients.length ? mrr / activeClients.length : 0;
  const churnAlerts = activeClients.filter((client) => client.status.tone !== "success").length;

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Carteira</h1>
          <div className="subtitle">
            Clientes ativos, receita recorrente e risco de churn derivados dos deals ganhos na store reativa.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">MRR ativo</div>
          <div className="value">{currencyFormatter.format(mrr)}</div>
        </div>
      </div>

      <div className="kpi-row">
        <article className="kpi-card">
          <div className="kpi-label">Clientes ativos</div>
          <div className="kpi-value">{activeClients.length}</div>
          <div className="kpi-trend up">Deals em won</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">MRR total</div>
          <div className="kpi-value">{currencyFormatter.format(mrr)}</div>
          <div className="kpi-trend">Soma de value</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Ticket medio</div>
          <div className="kpi-value">{currencyFormatter.format(averageTicket)}</div>
          <div className="kpi-trend">Carteira ativa</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Churn alerts</div>
          <div className="kpi-value">{churnAlerts}</div>
          <div className={`kpi-trend ${churnAlerts ? "down" : "up"}`}>
            {churnAlerts ? "Precisa revisar" : "Sem alerta"}
          </div>
        </article>
      </div>

      <div className="grid-2col">
        <article className="card">
          <div className="card-header">
            <div className="card-title">Leitura executiva</div>
            <span className="card-badge">Carteira</span>
          </div>
          <p className="focus-title">
            {activeClients.length
              ? `${activeClients.length} cliente ativo gerando ${currencyFormatter.format(mrr)}.`
              : "Nenhum cliente ativo encontrado."}
          </p>
          <p className="muted-copy">
            Clientes entram na Carteira quando o deal associado esta em `won`. Alertas usam `updated_at` como fonte de recencia.
          </p>
        </article>

        <article className="card">
          <div className="card-header">
            <div className="card-title">Churn alert</div>
            <span className="card-badge">{staleDays} dias</span>
          </div>
          <p className="focus-title">
            {churnAlerts ? `${churnAlerts} conta precisa de follow-up.` : "Nenhuma conta vencida."}
          </p>
          <p className="muted-copy">
            Deals sem `updated_at` tambem aparecem como alerta porque ainda nao ha registro confiavel de interacao.
          </p>
        </article>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Empresa</th>
              <th>MRR</th>
              <th>Ultima interacao</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {activeClients.length ? (
              activeClients.map((client) => (
                <tr key={client.deal.id}>
                  <td>{client.contactName}</td>
                  <td>{client.company}</td>
                  <td>{currencyFormatter.format(client.deal.value)}</td>
                  <td>{client.status.lastTouch}</td>
                  <td>
                    <span className={`portfolio-status ${client.status.tone}`}>{client.status.label}</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>Nenhum deal ganho encontrado na store atual.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
