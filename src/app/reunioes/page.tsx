"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

// Reunioes le a MESMA fonte do Calendario (calendar_events, kind='reuniao'). Marcar
// uma reuniao aqui ou no Calendario e a mesma coisa — as duas abas conversam.

type CalEvent = {
  id: number;
  title: string;
  starts_at: string;
  location: string | null;
  notes: string | null;
  deal_id: number | null;
  done: boolean;
};

function fmtFull(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ReunioesPage() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

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

  const [now] = useState(() => Date.now());
  const proxima = useMemo(
    () => events.filter((e) => new Date(e.starts_at).getTime() >= now && !e.done).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null,
    [events, now],
  );
  const passadas = useMemo(
    () => events.filter((e) => new Date(e.starts_at).getTime() < now || e.done).sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
    [events, now],
  );

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

      <div className="grid-2col">
        <article className="card">
          <div className="card-header"><div className="card-title">Próxima Reunião</div></div>
          {proxima ? (
            <div style={{ padding: "4px 2px" }}>
              <div style={{ fontSize: "16px", fontWeight: 700 }}>{proxima.title}</div>
              <div className="muted-copy font-mono" style={{ marginTop: "4px" }}>{fmtFull(proxima.starts_at)}</div>
              {proxima.location ? <div className="muted-copy" style={{ marginTop: "4px", fontSize: "13px" }}>{proxima.location}</div> : null}
              {proxima.notes ? <div className="muted-copy" style={{ marginTop: "6px", fontSize: "13px" }}>{proxima.notes}</div> : null}
              {proxima.deal_id ? <div style={{ marginTop: "8px" }}><span className="status-pill">Lead #{proxima.deal_id}</span></div> : null}
            </div>
          ) : (
            <div className="muted-copy" style={{ padding: "6px 2px" }}>Nenhuma reunião futura. Marque uma no Calendário.</div>
          )}
        </article>

        <article className="card">
          <div className="card-header"><div className="card-title">Linha do Tempo</div></div>
          {passadas.length === 0 ? (
            <div className="muted-copy" style={{ padding: "6px 2px" }}>Sem reuniões passadas registradas.</div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
              {passadas.slice(0, 8).map((e) => (
                <li key={e.id} style={{ borderLeft: "2px solid var(--line, #e0dcec)", paddingLeft: "12px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>{e.title}</div>
                  <div className="muted-copy font-mono" style={{ fontSize: "12px" }}>{fmtFull(e.starts_at)}</div>
                  {e.notes ? <div className="muted-copy" style={{ fontSize: "12px" }}>{e.notes}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
}
