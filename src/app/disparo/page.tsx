"use client";

import { Fragment, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useCRMStore } from "@/store/useCRMStore";
import { logWhatsappOpened } from "@/lib/activityClient";
import {
  QUEUE_SECTION_INFO,
  RESPONSE_TYPE_INFO,
  TIER_INFO,
  classificationUpdate,
  followupMessage,
  messageCompanyMismatch,
  nextActionAfterInbound,
  nextActionAfterOutbound,
  queueSectionForDeal,
  tierForDays,
  type QueueSection,
  type ResponseType,
} from "@/lib/followup";
import { normalizeWhatsappPhone } from "@/lib/whatsappPhone";
import type { Deal } from "@/lib/crmRecords";

function cleanPhone(value?: string) {
  return normalizeWhatsappPhone(value);
}

function whatsappLink(phone: string, message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

// Janelas e mensagens da sequencia (docs/funil-whatsapp-sequencia.md) vivem em
// src/lib/followup.ts, compartilhadas com a Sala de Comando.

type WhatsappSummary = Record<
  number,
  {
    last: string;
    count: number;
    lastOutbound: string;
    lastOutboundText: string;
    lastInbound?: string;
    lastInboundText?: string;
    inboundCount: number;
  }
>;

export default function DisparoPage() {
  const deals = useCRMStore((state) => state.deals);
  const contacts = useCRMStore((state) => state.contacts);
  const setDeals = useCRMStore((state) => state.setDeals);
  const setContacts = useCRMStore((state) => state.setContacts);
  const updateDeal = useCRMStore((state) => state.updateDeal);
  const [view, setView] = useState<"disparo" | "followup">("disparo");
  const [filter, setFilter] = useState<"ready" | "phone" | "all">("ready");
  const [query, setQuery] = useState("");
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");
  const [waSummary, setWaSummary] = useState<WhatsappSummary>({});
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
    const contact =
      contacts.find((item) => deal.contactId != null && item.id === deal.contactId) ??
      contacts.find((item) => item.company === deal.company || item.name === deal.company);
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
      .filter((deal) =>
        ["abordado", "followup", "qualified", "proposal", "negotiation"].includes(
          deal.stage,
        ),
      )
      .map((deal) => {
        const { phone, contact } = phoneFor(deal);
        const wa = waSummary[deal.id];
        const responseType = deal.responseType ?? "sem_resposta";
        const lastOutbound = deal.lastOutboundAt ?? wa?.lastOutbound ?? wa?.last;
        const lastInbound = deal.lastInboundAt ?? wa?.lastInbound;
        const days = lastOutbound
          ? Math.floor((now - new Date(lastOutbound).getTime()) / 86400000)
          : null;
        const tier = tierForDays(days);
        const recommended =
          responseType !== "sem_resposta" && lastInbound
            ? nextActionAfterInbound(responseType, lastInbound)
            : lastOutbound
              ? nextActionAfterOutbound({
                  responseType,
                  occurredAt: lastOutbound,
                  outboundCount: wa?.count ?? 1,
                })
              : { at: null, type: null, note: "Sem historico de envio recuperavel." };
        const nextActionAt = deal.nextActionAt ?? recommended.at;
        const nextActionNote = deal.nextActionNote ?? recommended.note;
        const section = queueSectionForDeal(
          {
            responseType,
            phone,
            nextActionAt,
            nextActionSource: deal.nextActionSource,
            lastInboundAt: lastInbound,
            lastOutboundAt: lastOutbound,
          },
          new Date(now).toISOString(),
        );
        const message =
          section === "responder_agora" || section === "encaminhamentos"
            ? ""
            : tier === "aguardar" && responseType !== "bot"
              ? ""
              : followupMessage(tier === "aguardar" ? "M1" : tier, deal.company, responseType);

        return {
          id: deal.id,
          company: deal.company,
          contact: contact?.name ?? deal.company,
          phone,
          stage: deal.stage,
          days,
          msgCount: wa?.count ?? 0,
          inboundCount: wa?.inboundCount ?? 0,
          lastOutbound,
          lastOutboundText: wa?.lastOutboundText ?? "",
          lastInbound,
          lastInboundText: wa?.lastInboundText ?? "",
          responseType,
          nextActionAt,
          nextActionNote,
          nextActionSource: deal.nextActionSource,
          section,
          responseTimeMinutes: deal.responseTimeMinutes,
          tier,
          message,
        };
      })
      .filter((row) => !q || `${row.company} ${row.contact}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const sectionOrder =
          QUEUE_SECTION_INFO[a.section].order - QUEUE_SECTION_INFO[b.section].order;
        if (sectionOrder !== 0) return sectionOrder;
        return String(a.nextActionAt ?? "").localeCompare(String(b.nextActionAt ?? ""));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, deals, query, waSummary]);

  const readyCount = rows.filter((row) => row.ready).length;
  const dueCount = followupRows.filter(
    (row) =>
      row.section !== "aguardando_cadencia" &&
      row.section !== "dados_inconsistentes",
  ).length;

  const sectionedFollowups = useMemo(
    () =>
      (Object.keys(QUEUE_SECTION_INFO) as QueueSection[])
        .sort((a, b) => QUEUE_SECTION_INFO[a].order - QUEUE_SECTION_INFO[b].order)
        .map((section) => ({
          section,
          rows: followupRows.filter((row) => row.section === section),
        }))
        .filter((group) => group.rows.length > 0),
    [followupRows],
  );

  async function handleClassification(
    row: (typeof followupRows)[number],
    responseType: ResponseType,
  ) {
    await updateDeal(
      row.id,
      classificationUpdate(
        responseType,
        new Date().toISOString(),
        row.nextActionSource,
      ),
    );
  }

  async function handleSchedule(dealId: number, value: string) {
    if (!value) return;
    const date = new Date(`${value}T09:00:00`);
    if (Number.isNaN(date.getTime())) return;
    await updateDeal(dealId, {
      nextActionAt: date.toISOString(),
      nextActionType: "followup_silencio",
      nextActionNote: "Proxima acao agendada manualmente.",
      nextActionSource: "manual",
    });
  }

  function guardCompanyMessage(
    event: MouseEvent<HTMLAnchorElement>,
    company: string,
    message: string,
  ) {
    const mismatch = messageCompanyMismatch(
      message,
      company,
      deals.map((deal) => deal.company),
    );
    if (!mismatch) return;
    event.preventDefault();
    window.alert(
      `Revise a mensagem: ela menciona ${mismatch}, mas este card e da ${company}.`,
    );
  }

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Disparo</h1>
          <div className="subtitle">
            {view === "disparo"
              ? "Central de WhatsApp. A fila combina deals, contatos, telefone e copy pronta."
              : "Cockpit de proxima acao: respostas humanas, encaminhamentos, bots D+7 e silencio D+2/D+5/D+10."}
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
                          onClick={(event) => {
                            guardCompanyMessage(event, row.company, row.message);
                            if (!event.defaultPrevented) logWhatsappOpened(row.id);
                          }}
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
              <div className="kpi-trend up">Responder + encaminhar + retomar</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Aguardando janela</div>
              <div className="kpi-value">{followupRows.filter((row) => row.section === "aguardando_cadencia").length}</div>
              <div className="kpi-trend">Cadencia futura</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Bots D+7</div>
              <div className="kpi-value">{followupRows.filter((row) => row.section === "bots_d7").length}</div>
              <div className="kpi-trend">Canal confirmado</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">Problemas de dados</div>
              <div className="kpi-value">{followupRows.filter((row) => row.section === "dados_inconsistentes").length}</div>
              <div className="kpi-trend down">Corrigir cadastro ou historico</div>
            </article>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Resposta</th>
                  <th>Ultima interacao</th>
                  <th>Proxima acao</th>
                  <th>Contexto</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {sectionedFollowups.map(({ section, rows: sectionRows }) => (
                  <Fragment key={section}>
                    <tr className="queue-section-row">
                      <td colSpan={6}>
                        <strong>{QUEUE_SECTION_INFO[section].label}</strong>
                        <span>{sectionRows.length}</span>
                      </td>
                    </tr>
                    {sectionRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <div><strong>{row.company}</strong></div>
                          <span className={`status-pill ${row.stage}`}>{row.stage}</span>
                          <div className="font-mono muted-copy" style={{ fontSize: "10px", marginTop: "4px" }}>
                            {row.phone ? `+${row.phone}` : "Sem telefone"}
                          </div>
                        </td>
                        <td>
                          <span className={`response-pill ${RESPONSE_TYPE_INFO[row.responseType].tone}`}>
                            {RESPONSE_TYPE_INFO[row.responseType].label}
                          </span>
                          <select
                            aria-label={`Classificar resposta de ${row.company}`}
                            className="queue-compact-select"
                            onChange={(event) => void handleClassification(row, event.target.value as ResponseType)}
                            value={row.responseType}
                          >
                            {(Object.keys(RESPONSE_TYPE_INFO) as ResponseType[]).map((type) => (
                              <option key={type} value={type}>{RESPONSE_TYPE_INFO[type].label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div>{row.days === null ? "Sem saida" : row.days === 0 ? "Saida hoje" : `Ultima saida D+${row.days}`}</div>
                          <div className="muted-copy" style={{ fontSize: "11px" }}>
                            {row.lastInbound ? `Entrada: ${new Date(row.lastInbound).toLocaleString("pt-BR")}` : "Sem entrada"}
                          </div>
                          {row.responseTimeMinutes != null ? (
                            <div className="muted-copy" style={{ fontSize: "11px" }}>
                              Respondeu em {row.responseTimeMinutes} min
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <div>{row.nextActionAt ? new Date(row.nextActionAt).toLocaleString("pt-BR") : "Sem agenda"}</div>
                          <div className="muted-copy" style={{ fontSize: "11px" }}>{row.nextActionNote}</div>
                          <input
                            aria-label={`Agendar ${row.company}`}
                            className="queue-date-input"
                            onChange={(event) => void handleSchedule(row.id, event.target.value)}
                            type="date"
                            value={row.nextActionAt?.slice(0, 10) ?? ""}
                          />
                        </td>
                        <td style={{ maxWidth: "390px" }}>
                          {row.lastInboundText ? (
                            <div className="queue-message-preview">{row.lastInboundText}</div>
                          ) : null}
                          <div className="muted-copy" style={{ fontSize: "11px", marginTop: "6px" }}>
                            {row.message || (section === "responder_agora" ? "Responder com contexto no card." : section === "encaminhamentos" ? "Contatar o responsavel indicado." : `${TIER_INFO[row.tier === "aguardar" ? "M1" : row.tier].label}`)}
                          </div>
                        </td>
                        <td>
                          <div className="queue-actions">
                            {row.phone ? (
                              <a
                                className="topbar-btn primary"
                                href={row.message ? whatsappLink(row.phone, row.message) : `https://wa.me/${row.phone}`}
                                rel="noreferrer"
                                target="_blank"
                                onClick={(event) => {
                                  if (row.message) guardCompanyMessage(event, row.company, row.message);
                                  if (!event.defaultPrevented) {
                                    logWhatsappOpened(
                                      row.id,
                                      row.message
                                        ? `WhatsApp aberto para follow-up ${row.tier}`
                                        : "Conversa do WhatsApp aberta",
                                    );
                                  }
                                }}
                              >
                                {row.message ? "Enviar" : "Abrir conversa"}
                              </a>
                            ) : (
                              <span className="portfolio-status warning">Sem telefone</span>
                            )}
                            {row.message ? (
                              <button
                                className="topbar-btn"
                                onClick={() => navigator.clipboard?.writeText(row.message)}
                                type="button"
                              >
                                Copiar
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
