"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { emailPreview, normalizeSubject, splitQuotedEmail, type QuotedEmail } from "@/lib/emailThread";

type ThreadContext = {
  id: number;
  participant_email: string;
  participant_name: string | null;
  subject: string;
  last_message_preview: string | null;
  last_message_at: string | null;
  unread_count: number;
  deal: { id: number; name: string | null; company: string | null; stage: string | null } | null;
  contact: { id: number; name: string | null; company: string | null; email: string | null } | null;
};

type EmailMessage = {
  id: number;
  direction: "received" | "sent" | null;
  sender_name: string | null;
  from_email: string | null;
  recipient_emails: string[] | null;
  subject: string | null;
  content: string | null;
  occurred_at: string | null;
  attachments: Array<{ name?: string; link?: string; mimeType?: string; size?: number }> | null;
};

type InboxResponse = {
  ok: boolean;
  error?: string;
  items: ThreadContext[];
  page: number;
  total: number;
  totalPages: number;
  start: number;
  end: number;
  selected: { thread: ThreadContext; messages: EmailMessage[] } | null;
};

function formatMoment(value: string | null, compact = false): string {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", compact
    ? { day: "2-digit", month: "short" }
    : { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    .format(date);
}

function participantLabel(thread: ThreadContext): string {
  return thread.contact?.name || thread.participant_name || thread.participant_email || "Remetente desconhecido";
}

type Direction = "sent" | "received";

// Um card por "fala": a mensagem gravada no banco vira um item, e o e-mail citado
// dentro dela (o que o lead respondeu por cima) vira um item proprio, antes dela.
type StreamItem = {
  key: string;
  kind: "message" | "quoted";
  direction: Direction;
  senderName: string;
  senderEmail: string | null;
  occurredAt: string | null;
  occurredAtRaw: string | null;
  subject: string | null;
  to: string | null;
  body: string;
  attachments: EmailMessage["attachments"];
  quotedFromName: string | null;
};

function quotedDirection(quoted: QuotedEmail, message: EmailMessage, thread: ThreadContext): Direction {
  const participant = thread.participant_email.toLowerCase();
  if (quoted.fromEmail) return quoted.fromEmail === participant ? "received" : "sent";
  return message.direction === "sent" ? "received" : "sent";
}

function alreadyInThread(quoted: QuotedEmail, direction: Direction, messages: EmailMessage[], current: EmailMessage): boolean {
  const subject = normalizeSubject(quoted.subject);
  const bodyStart = quoted.body.replace(/\s+/g, " ").slice(0, 60);
  return messages.some((other) => {
    if (other.id === current.id || (other.direction ?? "received") !== direction) return false;
    if (subject && normalizeSubject(other.subject) === subject) return true;
    return bodyStart.length >= 20 && (other.content ?? "").replace(/\s+/g, " ").includes(bodyStart);
  });
}

function buildStream(thread: ThreadContext, messages: EmailMessage[]): StreamItem[] {
  const items: StreamItem[] = [];
  for (const message of messages) {
    const direction: Direction = message.direction === "sent" ? "sent" : "received";
    const { reply, quoted } = splitQuotedEmail(message.content);
    const senderName = direction === "sent"
      ? message.sender_name || "Mydrion"
      : message.sender_name || message.from_email || participantLabel(thread);

    if (quoted && quoted.body) {
      const quotedDir = quotedDirection(quoted, message, thread);
      if (!alreadyInThread(quoted, quotedDir, messages, message)) {
        items.push({
          key: `quoted-${message.id}`,
          kind: "quoted",
          direction: quotedDir,
          senderName: quoted.fromName || (quotedDir === "sent" ? "Mydrion" : participantLabel(thread)),
          senderEmail: quoted.fromEmail || (quotedDir === "sent" ? null : thread.participant_email),
          occurredAt: quoted.sentAt,
          occurredAtRaw: quoted.sentAtRaw,
          subject: quoted.subject,
          to: quoted.to,
          body: quoted.body,
          attachments: null,
          quotedFromName: senderName,
        });
      }
    }

    items.push({
      key: `message-${message.id}`,
      kind: "message",
      direction,
      senderName,
      senderEmail: message.from_email || (direction === "received" ? thread.participant_email : null),
      occurredAt: message.occurred_at,
      occurredAtRaw: null,
      subject: message.subject,
      to: message.recipient_emails?.join(", ") || null,
      body: reply,
      attachments: message.attachments,
      quotedFromName: null,
    });
  }
  return items;
}

function validAttachmentUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function requestInbox(
  input: { page: number; query: string; unreadOnly: boolean; selectedThreadId: number | null },
  signal?: AbortSignal,
): Promise<InboxResponse> {
  const searchParams = new URLSearchParams({ page: String(input.page) });
  if (input.query) searchParams.set("q", input.query);
  if (input.unreadOnly) searchParams.set("unread", "true");
  if (input.selectedThreadId) searchParams.set("thread", String(input.selectedThreadId));
  const response = await fetch(`/api/emails?${searchParams.toString()}`, { signal });
  const body = await response.json() as InboxResponse;
  if (!response.ok || !body.ok) throw new Error(body.error || "Nao foi possivel carregar os e-mails.");
  return body;
}

export default function EmailInboxPage() {
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const threadId = Number(new URLSearchParams(window.location.search).get("thread"));
    return Number.isInteger(threadId) && threadId > 0 ? threadId : null;
  });
  const [data, setData] = useState<InboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const controller = new AbortController();
    void requestInbox({ page, query, unreadOnly, selectedThreadId }, controller.signal)
      .then((body) => setData(body))
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Nao foi possivel carregar os e-mails.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, query, refreshKey, selectedThreadId, unreadOnly]);

  function selectThread(threadId: number) {
    setLoading(true);
    setError(null);
    setSelectedThreadId(threadId);
    const url = new URL(window.location.href);
    url.searchParams.set("thread", String(threadId));
    window.history.replaceState({}, "", url);

    setData((current) => current ? {
      ...current,
      items: current.items.map((item) => item.id === threadId ? { ...item, unread_count: 0 } : item),
    } : current);
    void fetch("/api/emails/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId }),
    });
  }

  function applySearch() {
    setLoading(true);
    setError(null);
    setQuery(draftQuery.trim());
    setPage(1);
  }

  const selected = data?.selected ?? null;
  const stream = useMemo(
    () => selected ? buildStream(selected.thread, selected.messages) : [],
    [selected],
  );
  const sentCount = stream.filter((item) => item.direction === "sent").length;
  const receivedCount = stream.length - sentCount;

  return (
    <section className="email-inbox-page">
      <header className="email-inbox-heading">
        <div>
          <span className="card-badge">Conversas comerciais</span>
          <h1>Caixa de entrada</h1>
          <p>E-mails recebidos no Brevo, ligados aos contatos e oportunidades do CRM.</p>
        </div>
        <span className="email-readonly-badge">Somente leitura</span>
      </header>

      <div className="email-inbox-toolbar">
        <label className="email-inbox-search">
          <span aria-hidden="true" className="search-mark" />
          <span className="email-sr-only">Buscar e-mails</span>
          <input
            onChange={(event) => setDraftQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") applySearch(); }}
            placeholder="Buscar por pessoa, empresa, assunto ou e-mail"
            value={draftQuery}
          />
          <button className="topbar-btn" onClick={applySearch} type="button">Buscar</button>
        </label>
        <label className="email-unread-filter">
          <input
            checked={unreadOnly}
            onChange={(event) => { setLoading(true); setError(null); setUnreadOnly(event.target.checked); setPage(1); }}
            type="checkbox"
          />
          Apenas nao lidos
        </label>
      </div>

      {error ? (
        <div className="portfolio-status warning" role="alert">
          {error} <button className="topbar-btn" onClick={() => { setLoading(true); setError(null); setRefreshKey((value) => value + 1); }} type="button">Tentar novamente</button>
        </div>
      ) : null}

      <div className="email-inbox-shell">
        <aside className="email-thread-list" aria-label="Lista de conversas de e-mail">
          <div className="email-thread-list-meta">
            <strong>{loading && !data ? "Carregando" : `${data?.total ?? 0} conversas`}</strong>
            <span aria-label="10 por pagina">10 por pagina</span>
          </div>

          {!loading && data?.items.length === 0 ? (
            <div className="email-inbox-empty">
              <span aria-hidden="true">✉</span>
              <strong>Nenhuma conversa encontrada</strong>
              <p>Os novos e-mails recebidos pelo Brevo aparecerao aqui.</p>
            </div>
          ) : null}

          <div className="email-thread-items">
            {(data?.items ?? []).map((thread) => (
              <button
                aria-current={selectedThreadId === thread.id ? "true" : undefined}
                className={`email-thread-row ${selectedThreadId === thread.id ? "active" : ""} ${thread.unread_count > 0 ? "unread" : ""}`}
                key={thread.id}
                onClick={() => selectThread(thread.id)}
                type="button"
              >
                <span className="email-thread-avatar" aria-hidden="true">
                  {participantLabel(thread).slice(0, 1).toLocaleUpperCase("pt-BR")}
                </span>
                <span className="email-thread-copy">
                  <span className="email-thread-line">
                    <strong>{participantLabel(thread)}</strong>
                    <time>{formatMoment(thread.last_message_at, true)}</time>
                  </span>
                  <span className="email-thread-company">
                    {thread.deal?.company || thread.contact?.company || thread.participant_email}
                  </span>
                  <span className="email-thread-subject">{thread.subject || "Sem assunto"}</span>
                  <span className="email-thread-preview">{thread.last_message_preview || "Mensagem sem previa"}</span>
                </span>
                {thread.unread_count > 0 ? <span className="email-unread-count">{thread.unread_count}</span> : null}
              </button>
            ))}
          </div>

          <footer className="email-inbox-pagination">
            <span>{data ? `${data.start}-${data.end} de ${data.total}` : "0-0 de 0"}</span>
            <div>
              <button className="topbar-btn" disabled={!data || data.page <= 1 || loading} onClick={() => { setLoading(true); setPage((value) => value - 1); }} type="button">Anterior</button>
              <span>Pagina {data?.page ?? 1} de {data?.totalPages ?? 1}</span>
              <button className="topbar-btn" disabled={!data || data.page >= data.totalPages || loading} onClick={() => { setLoading(true); setPage((value) => value + 1); }} type="button">Proxima</button>
            </div>
          </footer>
        </aside>

        <main className="email-conversation" aria-live="polite">
          {selected ? (
            <>
              <header className="email-conversation-header">
                <div>
                  <span>{selected.thread.participant_email}</span>
                  <h2>{selected.thread.subject || "Sem assunto"}</h2>
                  <p>
                    Conversa com {participantLabel(selected.thread)}
                    {" · "}{sentCount} {sentCount === 1 ? "enviado" : "enviados"}, {receivedCount} {receivedCount === 1 ? "recebido" : "recebidos"}
                  </p>
                </div>
                {selected.thread.deal ? (
                  <Link className="email-deal-link" href={`/lista?dealId=${selected.thread.deal.id}`}>
                    Abrir {selected.thread.deal.company || selected.thread.deal.name || `deal #${selected.thread.deal.id}`}
                  </Link>
                ) : (
                  <span className="email-unlinked-badge">Sem lead vinculado</span>
                )}
              </header>

              <div className="email-message-stream">
                {stream.map((item) => {
                  const isQuoted = item.kind === "quoted";
                  const isOpen = !isQuoted || expanded[item.key] === true;
                  const attachments = (item.attachments ?? []).filter((attachment) => validAttachmentUrl(attachment.link));
                  return (
                    <article
                      className={`email-message ${item.direction === "sent" ? "outbound" : "inbound"} ${isQuoted ? "quoted" : ""}`}
                      key={item.key}
                    >
                      <header>
                        <div>
                          <span className="email-direction-row">
                            <span className={`email-direction-chip ${item.direction}`}>
                              {item.direction === "sent" ? "Enviado por você" : "Recebido"}
                            </span>
                            {isQuoted ? <span className="email-quoted-note">citado na resposta de {item.quotedFromName}</span> : null}
                          </span>
                          <strong>{item.senderName}</strong>
                          {item.senderEmail ? <span>{item.senderEmail}</span> : null}
                          {isQuoted && item.to ? <span>Para: {item.to}</span> : null}
                          {isQuoted && item.subject ? <span>Assunto: {item.subject}</span> : null}
                        </div>
                        <time>{item.occurredAt ? formatMoment(item.occurredAt) : item.occurredAtRaw || "Sem data"}</time>
                      </header>

                      {isOpen ? (
                        <div className="email-message-body">{item.body || "Mensagem sem conteudo de texto."}</div>
                      ) : (
                        <div className="email-message-body email-message-preview">{emailPreview(item.body)}</div>
                      )}

                      {isQuoted ? (
                        <button
                          className="email-quoted-toggle"
                          onClick={() => setExpanded((current) => ({ ...current, [item.key]: !isOpen }))}
                          type="button"
                        >
                          {isOpen ? "Ocultar e-mail completo" : "Ver e-mail completo"}
                        </button>
                      ) : null}

                      {attachments.length ? (
                        <div className="email-attachments">
                          {attachments.map((attachment, index) => (
                            <a href={validAttachmentUrl(attachment.link) ?? "#"} key={`${item.key}-${index}`} rel="noreferrer" target="_blank">
                              {attachment.name || "Abrir anexo"}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="email-conversation-placeholder">
              <span aria-hidden="true">✉</span>
              <strong>Selecione uma conversa</strong>
              <p>O historico completo do contato sera aberto aqui.</p>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
