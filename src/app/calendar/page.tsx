"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// Calendario do CRM: reunioes, lembretes e compromissos numa fonte unica (tabela
// calendar_events, via /api/calendar). A aba Reunioes le a mesma fonte filtrando
// kind='reuniao'. Cada evento pode amarrar a um lead do pipeline (deal_id).

type Kind = "reuniao" | "lembrete" | "compromisso";

type CalEvent = {
  id: number;
  title: string;
  kind: Kind;
  starts_at: string;
  ends_at: string | null;
  deal_id: number | null;
  contact_id: number | null;
  location: string | null;
  notes: string | null;
  done: boolean;
};

const KIND_META: Record<Kind, { label: string; color: string }> = {
  reuniao: { label: "Reunião", color: "#6d4aff" },
  lembrete: { label: "Lembrete", color: "#d8891f" },
  compromisso: { label: "Compromisso", color: "#12a37a" },
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

type DealLite = { id: number; company: string };

export default function CalendarPage() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [cursor, setCursor] = useState(() => new Date());
  const [nowTs] = useState(() => Date.now());
  const [deals, setDeals] = useState<DealLite[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: "",
    kind: "reuniao" as Kind,
    date: ymd(new Date()),
    time: "09:00",
    company: "",
    location: "",
    notes: "",
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar");
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Falha ao carregar a agenda");
      setEvents(body.events as CalEvent[]);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void (async () => { await load(); })();
    // lista de leads p/ vincular o evento a um deal (datalist)
    (async () => {
      try {
        const res = await fetch("/api/deals");
        const body = await res.json();
        const rows = Array.isArray(body) ? body : body.deals ?? body.data ?? [];
        const seen = new Set<string>();
        const list: DealLite[] = [];
        for (const d of rows) {
          const company = String(d.company ?? "").trim();
          if (company && !seen.has(company.toLowerCase())) {
            seen.add(company.toLowerCase());
            list.push({ id: Number(d.id), company });
          }
        }
        setDeals(list);
      } catch {
        setDeals([]);
      }
    })();
  }, [load]);

  const monthLabel = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;

  // Celulas do mes: semana comeca no domingo.
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(d);
    }
    return out;
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) {
      const key = ymd(new Date(e.starts_at));
      (map.get(key) ?? map.set(key, []).get(key)!).push(e);
    }
    return map;
  }, [events]);

  const upcoming = useMemo(() => {
    return events
      .filter((e) => new Date(e.starts_at).getTime() >= nowTs - 3600000 && !e.done)
      .slice(0, 12);
  }, [events, nowTs]);

  const todayKey = ymd(new Date(nowTs));

  function closeForm() {
    setFormOpen(false);
    setEditId(null);
    setForm({ title: "", kind: "reuniao", date: ymd(new Date()), time: "09:00", company: "", location: "", notes: "" });
  }

  // Abre o modal em modo criacao, opcionalmente com um dia pre-selecionado.
  function openCreate(date?: string) {
    setEditId(null);
    setForm({ title: "", kind: "reuniao", date: date ?? ymd(new Date()), time: "09:00", company: "", location: "", notes: "" });
    setFormOpen(true);
  }

  // Abre o modal em modo edicao, pre-preenchido com o evento clicado.
  function openEdit(e: CalEvent) {
    const d = new Date(e.starts_at);
    const company = e.deal_id ? deals.find((x) => x.id === e.deal_id)?.company ?? "" : "";
    setForm({
      title: e.title,
      kind: e.kind,
      date: ymd(d),
      time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      company,
      location: e.location ?? "",
      notes: e.notes ?? "",
    });
    setEditId(e.id);
    setFormOpen(true);
  }

  async function submit() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const startsAt = new Date(`${form.date}T${form.time || "09:00"}`).toISOString();
      const dealId = form.company
        ? deals.find((d) => d.company.toLowerCase() === form.company.trim().toLowerCase())?.id ?? null
        : null;
      const payload = {
        title: form.title.trim(),
        kind: form.kind,
        startsAt,
        dealId,
        location: form.location,
        notes: form.notes,
      };
      const res = editId
        ? await fetch("/api/calendar", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editId, ...payload }),
          })
        : await fetch("/api/calendar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) throw new Error("Falha ao salvar");
      closeForm();
      await load();
    } catch {
      // erro silencioso; o reload mantem o estado atual
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(e: CalEvent) {
    await fetch("/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: e.id, done: !e.done }),
    });
    await load();
  }

  async function remove(e: CalEvent) {
    await fetch(`/api/calendar?id=${e.id}`, { method: "DELETE" });
    await load();
  }

  const kindsCount = (k: Kind) => events.filter((e) => e.kind === k && !e.done).length;

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Calendário</h1>
          <div className="subtitle">
            Reuniões, lembretes e compromissos num lugar só. Reuniões também aparecem na aba Reuniões.
          </div>
        </div>
        <div className="page-header-right">
          <button className="topbar-btn primary" onClick={() => openCreate()} type="button">
            + Marcar
          </button>
        </div>
      </div>

      <div className="kpi-row">
        <article className="kpi-card">
          <div className="kpi-label">Próximos</div>
          <div className="kpi-value">{upcoming.length}</div>
          <div className="kpi-trend">Compromissos ativos</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Reuniões</div>
          <div className="kpi-value">{kindsCount("reuniao")}</div>
          <div className="kpi-trend">Agendadas</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Lembretes</div>
          <div className="kpi-value">{kindsCount("lembrete")}</div>
          <div className="kpi-trend">Pendentes</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Compromissos</div>
          <div className="kpi-value">{kindsCount("compromisso")}</div>
          <div className="kpi-trend">Ativos</div>
        </article>
      </div>

      {status === "error" ? (
        <div className="portfolio-status warning">Não foi possível carregar a agenda.</div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 0 10px" }}>
        <h2 style={{ margin: 0 }}>{monthLabel}</h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="topbar-btn" type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</button>
          <button className="topbar-btn" type="button" onClick={() => setCursor(new Date())}>Hoje</button>
          <button className="topbar-btn" type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</button>
        </div>
      </div>

      <div className="table-wrap">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "1px", background: "var(--line, #e0dcec)", border: "1px solid var(--line, #e0dcec)", borderRadius: "10px", overflow: "hidden", minWidth: "680px" }}>
          {WEEKDAYS.map((w) => (
            <div key={w} style={{ background: "var(--surface, #fff)", padding: "8px", fontSize: "11px", fontWeight: 700, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.7 }}>{w}</div>
          ))}
          {cells.map((d, i) => {
            const key = ymd(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const dayEvents = eventsByDay.get(key) ?? [];
            return (
              <div
                key={i}
                onClick={() => openCreate(key)}
                style={{ background: "var(--surface, #fff)", minHeight: "96px", padding: "6px", cursor: "pointer", opacity: inMonth ? 1 : 0.4, outline: key === todayKey ? "2px solid #6d4aff" : "none", outlineOffset: "-2px" }}
              >
                <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>{d.getDate()}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  {dayEvents.slice(0, 3).map((e) => (
                    <div key={e.id} title={`${e.title} — clique para editar`} onClick={(ev) => { ev.stopPropagation(); openEdit(e); }} style={{ fontSize: "10.5px", padding: "2px 5px", borderRadius: "4px", background: `${KIND_META[e.kind].color}22`, color: KIND_META[e.kind].color, borderLeft: `2px solid ${KIND_META[e.kind].color}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: e.done ? "line-through" : "none", cursor: "pointer" }}>
                      {fmtTime(e.starts_at)} {e.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 ? <div style={{ fontSize: "10px", opacity: 0.6 }}>+{dayEvents.length - 3}</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <h2 style={{ marginTop: "28px" }}>Próximos compromissos</h2>
      {upcoming.length === 0 ? (
        <div className="connection-status fallback">
          Nada agendado. Clique em “+ Marcar” ou num dia do calendário para criar uma reunião, lembrete ou compromisso.
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Quando</th><th>Tipo</th><th>Título</th><th>Local / Lead</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {upcoming.map((e) => (
                <tr key={e.id}>
                  <td className="font-mono">{fmtDay(e.starts_at)} {fmtTime(e.starts_at)}</td>
                  <td><span className="status-pill" style={{ background: `${KIND_META[e.kind].color}22`, color: KIND_META[e.kind].color }}>{KIND_META[e.kind].label}</span></td>
                  <td onClick={() => openEdit(e)} style={{ cursor: "pointer" }} title="Clique para editar">{e.title}{e.notes ? <div className="muted-copy" style={{ fontSize: "11px" }}>{e.notes}</div> : null}</td>
                  <td className="muted-copy" style={{ fontSize: "12px" }}>{e.location || (e.deal_id ? `Lead #${e.deal_id}` : "—")}</td>
                  <td style={{ display: "flex", gap: "6px" }}>
                    <button className="topbar-btn" type="button" onClick={() => toggleDone(e)}>Concluir</button>
                    <button className="icon-text danger" type="button" onClick={() => remove(e)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen ? (
        <div onClick={closeForm} style={{ position: "fixed", inset: 0, background: "rgba(10,12,20,0.55)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "8vh", zIndex: 50 }}>
          <div onClick={(ev) => ev.stopPropagation()} className="card" style={{ width: "min(460px, 94vw)", padding: "22px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>{editId ? "Editar compromisso" : "Marcar compromisso"}</h2>
              <button className="topbar-btn" type="button" onClick={closeForm}>Fechar</button>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {(Object.keys(KIND_META) as Kind[]).map((k) => (
                <button key={k} type="button" onClick={() => setForm((f) => ({ ...f, kind: k }))}
                  className="topbar-btn"
                  style={{ flex: 1, borderColor: form.kind === k ? KIND_META[k].color : undefined, color: form.kind === k ? KIND_META[k].color : undefined, fontWeight: form.kind === k ? 700 : 400 }}>
                  {KIND_META[k].label}
                </button>
              ))}
            </div>
            <input className="settings-input" placeholder="Título (ex: Call com RC Performance)" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <div style={{ display: "flex", gap: "8px" }}>
              <input className="settings-input" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={{ flex: 1 }} />
              <input className="settings-input" type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} style={{ width: "120px" }} />
            </div>
            <input className="settings-input" list="deal-list" placeholder="Vincular a um lead (opcional)" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
            <datalist id="deal-list">
              {deals.slice(0, 500).map((d) => <option key={d.id} value={d.company} />)}
            </datalist>
            <input className="settings-input" placeholder="Local ou link da call (opcional)" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
            <textarea className="settings-input" placeholder="Notas (opcional)" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            <button className="topbar-btn primary" type="button" disabled={saving || !form.title.trim()} onClick={submit}>
              {saving ? "Salvando..." : editId ? "Salvar alterações" : "Marcar"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
