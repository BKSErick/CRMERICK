"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

// Reunioes le a MESMA fonte do Calendario (calendar_events, kind='reuniao'). Marcar
// uma reuniao aqui ou no Calendario e a mesma coisa — as duas abas conversam.

type MeetingStatus = "scheduled" | "confirmed" | "held" | "no_show" | "cancelled";

type CalEvent = {
  id: number;
  title: string;
  starts_at: string;
  location: string | null;
  notes: string | null;
  deal_id: number | null;
  done: boolean;
  meeting_status: MeetingStatus | null;
};

const STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  held: "Realizada",
  no_show: "No-show",
  cancelled: "Cancelada",
};

// Cores reaproveitadas dos modificadores que .status-pill ja tem no hub.css.
const STATUS_PILL: Record<MeetingStatus, string> = {
  scheduled: "prospect",
  confirmed: "qualified",
  held: "won",
  no_show: "negotiation",
  cancelled: "lost",
};

/**
 * Desfecho so existe depois da hora. Antes dela a reuniao so aceita acao de agenda:
 * nao da para dar no-show em quem ainda nem chegou. Marcada cedo por engano, ela volta
 * para agendada.
 */
const FUTURE_ACTIONS: Record<MeetingStatus, MeetingStatus[]> = {
  scheduled: ["confirmed", "cancelled"],
  confirmed: ["scheduled", "cancelled"],
  cancelled: ["scheduled"],
  held: ["scheduled"],
  no_show: ["scheduled"],
};

const PAST_ACTIONS: MeetingStatus[] = ["held", "no_show", "cancelled"];

// Passada sem desfecho marcado e trabalho pendente, nao historico fechado.
const PENDING_STATUSES: MeetingStatus[] = ["scheduled", "confirmed"];

function statusOf(event: CalEvent): MeetingStatus {
  return event.meeting_status ?? (event.done ? "held" : "scheduled");
}

function actionLabel(current: MeetingStatus, target: MeetingStatus) {
  if (target !== "scheduled") return STATUS_LABELS[target];
  return current === "confirmed" ? "Desfazer confirmação" : "Reabrir";
}

function fmtFull(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ReunioesPage() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);

  // A tela inteira pivota no relogio: qual card a reuniao ocupa e quais botoes ela
  // aceita saem daqui. Congelado na montagem, uma aba aberta durante o horario da
  // reuniao mostraria a fase errada.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  async function updateMeetingStatus(id: number, meetingStatus: MeetingStatus) {
    const target = events.find((event) => event.id === id);
    if (target && statusOf(target) === meetingStatus) return;
    setSavingId(id);
    try {
      const response = await fetch("/api/calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, meetingStatus }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        setActionError(typeof body?.error === "string" ? body.error : "Não foi possível salvar a reunião.");
        return;
      }
      setActionError(null);
      setEvents((current) => current.map((event) => (event.id === id ? body.event : event)));
    } catch {
      setActionError("Não foi possível salvar a reunião.");
    } finally {
      setSavingId(null);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/calendar?kind=reuniao");
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error();
        setEvents(body.events as CalEvent[]);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    })();
  }, []);

  // O corte e so o relogio. `done` fica de fora: a API marca done=true para held,
  // no_show e cancelled, entao usa-lo aqui jogava reuniao futura no historico.
  const futuras = useMemo(
    () => events.filter((e) => new Date(e.starts_at).getTime() >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [events, now],
  );
  const passadas = useMemo(
    () => events.filter((e) => new Date(e.starts_at).getTime() < now).sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
    [events, now],
  );
  const pendentes = useMemo(
    () => passadas.filter((e) => PENDING_STATUSES.includes(statusOf(e))),
    [passadas],
  );

  const [destaque, ...proximas] = futuras;
  const historico = onlyPending ? pendentes : passadas;
  const visiveis = showAllPast ? historico : historico.slice(0, 8);

  function renderActions(event: CalEvent, targets: MeetingStatus[]) {
    const current = statusOf(event);
    return (
      <div className="meeting-actions">
        {targets.map((target) => (
          <button
            key={target}
            type="button"
            className={`topbar-btn${target === current ? " primary" : ""}`}
            disabled={savingId === event.id}
            aria-pressed={target === current}
            onClick={() => void updateMeetingStatus(event.id, target)}
          >
            {actionLabel(current, target)}
          </button>
        ))}
      </div>
    );
  }

  function statusPill(event: CalEvent) {
    const current = statusOf(event);
    return <span className={`status-pill ${STATUS_PILL[current]}`}>{STATUS_LABELS[current]}</span>;
  }

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Reunioes</h1>
          <div className="subtitle">
            Central de alinhamento. Puxa as reuniões do Calendário — marque em qualquer uma das duas abas.
          </div>
        </div>
        <div className="page-header-right">
          <Link className="topbar-btn primary" href="/calendar">Abrir Calendário</Link>
        </div>
      </div>

      {status === "error" ? <div className="portfolio-status warning">Não foi possível carregar as reuniões.</div> : null}
      {actionError ? <div className="portfolio-status warning">{actionError}</div> : null}

      <div className="grid-2col">
        <article className="card">
          <div className="card-header">
            <div className="card-title">Próximas Reuniões</div>
            {futuras.length > 0 ? <span className="card-badge">{futuras.length}</span> : null}
          </div>
          {!destaque ? (
            <div className="muted-copy" style={{ padding: "6px 2px" }}>Nenhuma reunião futura. Marque uma no Calendário.</div>
          ) : (
            <>
              <div className="meeting-highlight">
                <div className="meeting-highlight-title">{destaque.title}</div>
                <div className="muted-copy font-mono meeting-when">{fmtFull(destaque.starts_at)}</div>
                {destaque.location ? <div className="muted-copy meeting-meta">{destaque.location}</div> : null}
                {destaque.notes ? <div className="muted-copy meeting-meta">{destaque.notes}</div> : null}
                <div className="meeting-pills">
                  {statusPill(destaque)}
                  {destaque.deal_id ? <span className="status-pill lead">Lead #{destaque.deal_id}</span> : null}
                </div>
                {renderActions(destaque, FUTURE_ACTIONS[statusOf(destaque)])}
              </div>

              {proximas.length > 0 ? (
                <ul className="meeting-list">
                  {proximas.map((event) => (
                    <li key={event.id} className="meeting-row">
                      <div className="meeting-row-title">{event.title}</div>
                      <div className="muted-copy font-mono meeting-when">{fmtFull(event.starts_at)}</div>
                      <div className="meeting-pills">{statusPill(event)}</div>
                      {renderActions(event, FUTURE_ACTIONS[statusOf(event)])}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </article>

        <article className="card">
          <div className="card-header">
            <div className="card-title">Linha do Tempo</div>
            {pendentes.length > 0 ? (
              <button
                type="button"
                className={`topbar-btn${onlyPending ? " primary" : ""}`}
                onClick={() => setOnlyPending((value) => !value)}
              >
                {pendentes.length} aguardando desfecho
              </button>
            ) : null}
          </div>
          {visiveis.length === 0 ? (
            <div className="muted-copy" style={{ padding: "6px 2px" }}>
              {onlyPending ? "Nenhuma reunião aguardando desfecho." : "Sem reuniões passadas registradas."}
            </div>
          ) : (
            <>
              <ul className="meeting-list">
                {visiveis.map((event) => {
                  const pendente = PENDING_STATUSES.includes(statusOf(event));
                  return (
                    <li key={event.id} className={`meeting-row${pendente ? " pending" : ""}`}>
                      <div className="meeting-row-title">{event.title}</div>
                      <div className="muted-copy font-mono meeting-when">{fmtFull(event.starts_at)}</div>
                      <div className="meeting-pills">
                        {statusPill(event)}
                        {pendente ? <span className="meeting-pending-mark">aguardando desfecho</span> : null}
                      </div>
                      {event.notes ? <div className="muted-copy meeting-meta">{event.notes}</div> : null}
                      {renderActions(event, PAST_ACTIONS)}
                    </li>
                  );
                })}
              </ul>
              {historico.length > visiveis.length || showAllPast ? (
                <button
                  type="button"
                  className="topbar-btn meeting-more"
                  onClick={() => setShowAllPast((value) => !value)}
                >
                  {showAllPast ? "Mostrar menos" : `Mostrar todas (${historico.length})`}
                </button>
              ) : null}
            </>
          )}
        </article>
      </div>
    </section>
  );
}
