"use client";

import { useEffect, useMemo, useState } from "react";
import { useCRMStore } from "@/store/useCRMStore";
import { logWhatsappSent } from "@/lib/activityClient";
import { TIER_INFO, followupMessage, tierForDays } from "@/lib/followup";
import type { Deal } from "@/lib/crmRecords";

function cleanPhone(value?: string) {
  return value?.replace(/\D/g, "") ?? "";
}

function whatsappLink(phone: string, message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

// Janelas e mensagens da sequencia (docs/funil-whatsapp-sequencia.md) vivem em
// src/lib/followup.ts, compartilhadas com a Sala de Comando.

type WhatsappSummary = Record<number, { last: string; count: number }>;

export default function DisparoPage() {
  const deals = useCRMStore((state) => state.deals);
  const contacts = useCRMStore((state) => state.contacts);
  const setDeals = useCRMStore((state) => state.setDeals);
  const setContacts = useCRMStore((state) => state.setContacts);
  const [view, setView] = useState<"disparo" | "followup">("disparo");
  const [filter, setFilter] = useState<"ready" | "phone" | "all">("ready");
  const [query, setQuery] = useState("");
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");
  const [waSummary, setWaSummary] = useState<WhatsappSummary>({});
  const [sentNow, setSentNow] = useState<Record<number, boolean>>({});
  const [loadedAt] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    async function loadCrmData() {
      try {
        const [crmResponse, waResponse] = await Promise.all([
          fetch("/api/crm-data"),
          fetch("/api/activities?summary=whatsapp"),
        ]);
        const body = await crmResponse.json();
        if (!crmResponse.ok || !body.ok) throw new Error(body.error ?? "Falha ao carregar dados do CRM");
        const waBody = await waResponse.json().catch(() => ({ ok: false }));
        if (!cancelled) {
          setDeals(body.deals);
          setContacts(body.contacts);
          if (waBody?.ok) setWaSummary(waBody.whatsapp ?? {});
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

  function phoneFor(deal: Deal) {
    const contact = contacts.find((item) => item.company === deal.company || item.name === deal.company);
    return { phone: cleanPhone(deal.phone || contact?.phone || contact?.whatsapp), contact };
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return deals
      .map((deal) => {
        const { phone, contact } = phoneFor(deal);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, deals, filter, query]);

  const followupRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = loadedAt;

    return deals
      .filter((deal) => deal.stage === "abordado" || deal.stage === "followup")
      .map((deal) => {
        const { phone, contact } = phoneFor(deal);
        const wa = waSummary[deal.id];
        const days = wa ? Math.floor((now - new Date(wa.last).getTime()) / 86400000) : null;
        const tier = tierForDays(days);
        const message = tier === "aguardar" ? "" : followupMessage(tier, deal.company);

        return {
          id: deal.id,
          company: deal.company,
          contact: contact?.name ?? deal.company,
          phone,
          stage: deal.stage,
          days,
          msgCount: wa?.count ?? 0,
          tier,
          message,
        };
      })
      .filter((row) => !q || `${row.company} ${row.contact}`.toLowerCase().includes(q))
      .sort((a, b) => {
        if ((a.tier === "aguardar") !== (b.tier === "aguardar")) return a.tier === "aguardar" ? 1 : -1;
        return (b.days ?? 0) - (a.days ?? 0);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, deals, query, waSummary]);

  const readyCount = rows.filter((row) => row.ready).length;
  const dueCount = followupRows.filter((row) => row.tier !== "aguardar").length;

  function handleFollowupClick(row: (typeof followupRows)[number]) {
    logWhatsappSent(row.id, `Follow-up ${row.tier} enviado`);
    setSentNow((prev) => ({ ...prev, [row.id]: true }));
  }

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Disparo</h1>
          <div className="subtitle">
            {view === "disparo"
              ? "Central de WhatsApp. A fila combina deals, contatos, telefone e copy pronta."
              : "Follow-up por janela: M1 (D+2), M2 com prova (D+5), M3 breakup (D+10). Enviar move o card no kanban."}
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">{view === "disparo" ? "Prontos" : "Devidos hoje"}</div>
          <div className="value">{view === "disparo" ? readyCount : dueCount}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
        <button
          type="button"
          className="topbar-btn"
          onClick={() => setView("disparo")}
          style={view === "disparo" ? { background: "var(--color-brand-violet)", color: "#fff", borderColor: "var(--color-brand-violet)" } : undefined}
        >
          Fila de disparo
        </button>
        <button
          type="button"
          className="topbar-btn"
          onClick={() => setView("followup")}
          style={view === "followup" ? { background: "var(--color-brand-violet)", color: "#fff", borderColor: "var(--color-brand-violet)" } : undefined}
        >
          Follow-up ({dueCount})
        </button>
      </div>

      <div className="filterbar">
        <input
          className="table-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar contato, empresa ou etapa"
          value={query}
        />
        {view === "disparo" && (
          <div className="filter-group">
            <select onChange={(event) => setFilter(event.target.value as typeof filter)} value={filter}>
              <option value="ready">So prontos p/ disparo</option>
              <option value="phone">Com telefone</option>
              <option value="all">Todos</option>
            </select>
          </div>
        )}
        <div className="filterbar-spacer" />
        <span className={`pipeline-status-pill ${dataStatus}`}>
          {dataStatus === "ready" ? `${deals.length} leads` : dataStatus === "loading" ? "Carregando" : "Erro"}
        </span>
      </div>

      {view === "disparo" ? (
        <>
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
              <div className="kpi-label">Follow-up devido</div>
              <div className="kpi-value">{dueCount}</div>
              <div className="kpi-trend">Ver aba Follow-up</div>
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
        </>
      ) : (
        <>
          <div className="kpi-row">
            <article className="kpi-card">
              <div className="kpi-label">Devidos hoje</div>
              <div className="kpi-value">{dueCount}</div>
              <div className="kpi-trend up">M1 + M2 + M3</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Aguardando janela</div>
              <div className="kpi-value">{followupRows.length - dueCount}</div>
              <div className="kpi-trend">Menos de D+2</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Em follow-up</div>
              <div className="kpi-value">{followupRows.filter((r) => r.stage === "followup").length}</div>
              <div className="kpi-trend">2a+ mensagem enviada</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Abordados</div>
              <div className="kpi-value">{followupRows.filter((r) => r.stage === "abordado").length}</div>
              <div className="kpi-trend">1 mensagem enviada</div>
            </article>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Ultimo contato</th>
                  <th>Proxima mensagem</th>
                  <th>Telefone</th>
                  <th>Mensagem sugerida</th>
                  <th>Acao</th>
                </tr>
              </thead>
              <tbody>
                {followupRows.map((row) => (
                  <tr key={row.id} style={sentNow[row.id] ? { opacity: 0.45 } : undefined}>
                    <td>
                      <div>{row.company}</div>
                      <span className={`status-pill ${row.stage}`}>{row.stage}</span>
                    </td>
                    <td>
                      {row.days === null ? "Sem registro" : row.days === 0 ? "Hoje" : `D+${row.days}`}
                      <div className="muted-copy" style={{ fontSize: "11px" }}>{row.msgCount} msg enviada(s)</div>
                    </td>
                    <td>
                      {row.tier === "aguardar" ? (
                        <span className="status-pill">Aguardar D+2</span>
                      ) : (
                        <div>
                          <strong style={{ fontSize: "12px" }}>{TIER_INFO[row.tier].label}</strong>
                          <div className="muted-copy" style={{ fontSize: "11px" }}>{TIER_INFO[row.tier].window}</div>
                        </div>
                      )}
                    </td>
                    <td className="font-mono">{row.phone ? `+${row.phone}` : "Sem telefone"}</td>
                    <td style={{ maxWidth: "420px" }}>{row.message || "Janela de follow-up ainda nao abriu."}</td>
                    <td>
                      {sentNow[row.id] ? (
                        <span className="status-pill">Enviado agora</span>
                      ) : row.tier === "aguardar" ? (
                        <span className="muted-copy" style={{ fontSize: "12px" }}>Aguardar</span>
                      ) : row.phone ? (
                        <a
                          className="topbar-btn primary"
                          href={whatsappLink(row.phone, row.message)}
                          rel="noreferrer"
                          target="_blank"
                          onClick={() => handleFollowupClick(row)}
                        >
                          Enviar {row.tier}
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
        </>
      )}
    </section>
  );
}
