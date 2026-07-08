"use client";

import { useEffect, useMemo, useState } from "react";
import { useCRMStore } from "@/store/useCRMStore";
import { logWhatsappSent } from "@/lib/activityClient";

function cleanPhone(value?: string) {
  return value?.replace(/\D/g, "") ?? "";
}

function whatsappLink(phone: string, message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export default function DisparoPage() {
  const deals = useCRMStore((state) => state.deals);
  const contacts = useCRMStore((state) => state.contacts);
  const setDeals = useCRMStore((state) => state.setDeals);
  const setContacts = useCRMStore((state) => state.setContacts);
  const [filter, setFilter] = useState<"ready" | "phone" | "all">("ready");
  const [query, setQuery] = useState("");
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");

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

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return deals
      .map((deal) => {
        const contact = contacts.find((item) => item.company === deal.company || item.name === deal.company);
        const phone = cleanPhone(deal.phone || contact?.phone || contact?.whatsapp);
        const message =
          deal.copyText ||
          `Oi! Falo sobre ${deal.title ?? "a oportunidade"} da ${deal.company}. Posso te mandar uma analise rapida?`;

        return {
          id: deal.id,
          company: deal.company,
          contact: contact?.name ?? deal.company,
          phone,
          message,
          stage: deal.stage,
          ready: Boolean(phone && message),
        };
      })
      .filter((row) => {
        if (filter === "ready" && !row.ready) return false;
        if (filter === "phone" && !row.phone) return false;
        if (q && !`${row.company} ${row.contact} ${row.stage}`.toLowerCase().includes(q)) return false;
        return true;
      });
  }, [contacts, deals, filter, query]);

  const readyCount = rows.filter((row) => row.ready).length;

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Disparo</h1>
          <div className="subtitle">
            Central de WhatsApp migrada para React. A fila combina deals, contatos, telefone e copy pronta.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Prontos</div>
          <div className="value">{readyCount}</div>
        </div>
      </div>

      <div className="filterbar">
        <input
          className="table-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar contato, empresa ou etapa"
          value={query}
        />
        <div className="filter-group">
          <select onChange={(event) => setFilter(event.target.value as typeof filter)} value={filter}>
            <option value="ready">So prontos p/ disparo</option>
            <option value="phone">Com telefone</option>
            <option value="all">Todos</option>
          </select>
        </div>
        <div className="filterbar-spacer" />
        <span className={`pipeline-status-pill ${dataStatus}`}>
          {dataStatus === "ready" ? `${deals.length} leads` : dataStatus === "loading" ? "Carregando" : "Erro"}
        </span>
      </div>

      <div className="kpi-row">
        <article className="kpi-card">
          <div className="kpi-label">Fila atual</div>
          <div className="kpi-value">{rows.length}</div>
          <div className="kpi-trend">Filtro aplicado</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Prontos</div>
          <div className="kpi-value">{readyCount}</div>
          <div className="kpi-trend up">Telefone + mensagem</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Sem telefone</div>
          <div className="kpi-value">{rows.filter((row) => !row.phone).length}</div>
          <div className="kpi-trend down">Completar cadastro</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Fonte</div>
          <div className="kpi-value">Store</div>
          <div className="kpi-trend">Deals + contatos</div>
        </article>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Contato</th>
              <th>Empresa</th>
              <th>Etapa</th>
              <th>Telefone</th>
              <th>Mensagem</th>
              <th>Acao</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.contact}</td>
                <td>{row.company}</td>
                <td>
                  <span className={`status-pill ${row.stage}`}>{row.stage}</span>
                </td>
                <td className="font-mono">{row.phone ? `+${row.phone}` : "Sem telefone"}</td>
                <td>{row.message}</td>
                <td>
                  {row.phone ? (
                    <a
                      className="topbar-btn primary"
                      href={whatsappLink(row.phone, row.message)}
                      rel="noreferrer"
                      target="_blank"
                      onClick={() => logWhatsappSent(row.id)}
                    >
                      WhatsApp
                    </a>
                  ) : (
                    <span className="portfolio-status warning">Sem telefone</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
