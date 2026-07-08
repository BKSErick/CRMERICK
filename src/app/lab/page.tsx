"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

// Lab = laboratorio da meta: calculadora reversa (traduz o gap da North Star em disparos/dia)
// + CRUD de experimentos de prospeccao (tabela experiments, via /api/experiments server-side).
// Taxas observadas (activities) vs estimativas (goals.json) sao rotuladas separadamente.
// Zero dado fabricado: sem gap/experimento = estado vazio elegante.

type Experiment = {
  id: number;
  name: string;
  hypothesis: string;
  channel: string;
  segment: string;
  scriptRef: string;
  status: string;
  result: string;
};

type Assumptions = { responseRate: number; callToClose: number; ticketLP: number; ticketDFY: number };
type NorthStarLite = {
  gap: number;
  avgTicket: number;
  businessDays: { remaining: number };
  funnel: Record<string, number>;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const CHANNELS = ["whatsapp", "email", "linkedin", "instagram"];
const STATUSES = ["planejado", "rodando", "concluido"];
const emptyForm = { name: "", hypothesis: "", channel: "whatsapp", segment: "", scriptRef: "", status: "planejado", result: "" };

const FUNNEL_STEPS: Array<[string, string, string]> = [
  ["qualified", "prospect", "Prospect -> Qualified"],
  ["proposal", "qualified", "Qualified -> Proposal"],
  ["negotiation", "proposal", "Proposal -> Negotiation"],
  ["won", "negotiation", "Negotiation -> Won"],
];

export default function LabPage() {
  const [ns, setNs] = useState<NorthStarLite | null>(null);
  const [nsStatus, setNsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [ticket, setTicket] = useState("");
  const [ticketFromData, setTicketFromData] = useState(false);
  const [responsePct, setResponsePct] = useState("");
  const [closePct, setClosePct] = useState("");

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [expStatus, setExpStatus] = useState<"loading" | "ready" | "error">("loading");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/north-star");
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao carregar meta");
        if (cancelled) return;
        const nsData = body.northStar as NorthStarLite & { avgTicket: number };
        const assumptions = body.goals.assumptions as Assumptions;
        setNs(nsData);
        const hasTicket = nsData.avgTicket > 0;
        setTicket(String(hasTicket ? nsData.avgTicket : assumptions.ticketLP));
        setTicketFromData(hasTicket);
        setResponsePct(String(Math.round(assumptions.responseRate * 100)));
        setClosePct(String(Math.round(assumptions.callToClose * 100)));
        setNsStatus("ready");
      } catch {
        if (!cancelled) setNsStatus("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadExperiments() {
    try {
      const response = await fetch("/api/experiments");
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao carregar experimentos");
      setExperiments(body.experiments as Experiment[]);
      setExpStatus("ready");
    } catch {
      setExpStatus("error");
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/experiments");
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao carregar experimentos");
        if (!cancelled) {
          setExperiments(body.experiments as Experiment[]);
          setExpStatus("ready");
        }
      } catch {
        if (!cancelled) setExpStatus("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const calc = useMemo(() => {
    const gap = ns?.gap ?? 0;
    const remaining = ns?.businessDays.remaining ?? 0;
    const ticketNum = Number(ticket) || 0;
    const resp = (Number(responsePct) || 0) / 100;
    const close = (Number(closePct) || 0) / 100;
    const fechamentos = ticketNum > 0 && gap > 0 ? Math.ceil(gap / ticketNum) : 0;
    const conversas = close > 0 ? Math.ceil(fechamentos / close) : 0;
    const disparos = resp > 0 ? Math.ceil(conversas / resp) : 0;
    const perDia = remaining > 0 ? Math.ceil(disparos / remaining) : disparos;
    return { gap, remaining, fechamentos, conversas, disparos, perDia };
  }, [ns, ticket, responsePct, closePct]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const method = editingId ? "PATCH" : "POST";
      const payload = editingId ? { id: editingId, ...form } : form;
      const response = await fetch("/api/experiments", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao salvar");
      setForm(emptyForm);
      setEditingId(null);
      await loadExperiments();
    } catch {
      // erro silencioso evitado: mantem o form para reenvio
    } finally {
      setSaving(false);
    }
  }

  function startEdit(exp: Experiment) {
    setEditingId(exp.id);
    setForm({
      name: exp.name,
      hypothesis: exp.hypothesis,
      channel: exp.channel || "whatsapp",
      segment: exp.segment,
      scriptRef: exp.scriptRef,
      status: exp.status || "planejado",
      result: exp.result,
    });
  }

  async function handleDelete(id: number) {
    try {
      await fetch(`/api/experiments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (editingId === id) {
        setEditingId(null);
        setForm(emptyForm);
      }
      await loadExperiments();
    } catch {
      // ignore
    }
  }

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Lab</h1>
          <div className="subtitle">
            Laboratorio da meta: calculadora reversa (do gap ate os disparos do dia) e registro de experimentos de abordagem.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Experimentos</div>
          <div className="value">{experiments.length}</div>
        </div>
      </div>

      <div className="card-header" style={{ marginBottom: "12px" }}>
        <div className="card-title">Calculadora reversa da meta</div>
        <span className="card-badge">gap -&gt; atividade</span>
      </div>

      {nsStatus === "loading" ? (
        <div className="connection-status fallback">Carregando a meta...</div>
      ) : nsStatus === "error" || !ns ? (
        <div className="portfolio-status warning">Nao foi possivel carregar a meta para calcular.</div>
      ) : (
        <>
          <div className="grid-2col" style={{ marginBottom: "16px" }}>
            <article className="card">
              <div className="card-header">
                <div className="card-title">Premissas</div>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", marginBottom: "10px" }}>
                <span className="meta-label">Ticket medio (R$) - {ticketFromData ? "observado no mes" : "estimativa sua"}</span>
                <input className="settings-input" inputMode="numeric" value={ticket} onChange={(e) => setTicket(e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", marginBottom: "10px" }}>
                <span className="meta-label">Taxa de resposta (%) - estimativa sua</span>
                <input className="settings-input" inputMode="numeric" value={responsePct} onChange={(e) => setResponsePct(e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px" }}>
                <span className="meta-label">Conversa -&gt; fechamento (%) - estimativa sua</span>
                <input className="settings-input" inputMode="numeric" value={closePct} onChange={(e) => setClosePct(e.target.value)} />
              </label>
            </article>
            <article className="card">
              <div className="card-header">
                <div className="card-title">O que fazer no restante do mes</div>
              </div>
              <div className="kpi-row" style={{ marginTop: "4px" }}>
                <article className="kpi-card">
                  <div className="kpi-label">Gap restante</div>
                  <div className="kpi-value">{BRL.format(calc.gap)}</div>
                </article>
                <article className="kpi-card">
                  <div className="kpi-label">Fechamentos faltam</div>
                  <div className="kpi-value">{calc.fechamentos}</div>
                </article>
                <article className="kpi-card">
                  <div className="kpi-label">Conversas</div>
                  <div className="kpi-value">{calc.conversas}</div>
                </article>
                <article className="kpi-card">
                  <div className="kpi-label">Disparos</div>
                  <div className="kpi-value">{calc.disparos}</div>
                </article>
                <article className="kpi-card">
                  <div className="kpi-label">Disparos / dia util</div>
                  <div className="kpi-value">{calc.perDia}</div>
                  <div className="kpi-trend">{calc.remaining} dias restantes</div>
                </article>
              </div>
            </article>
          </div>

          <div className="card" style={{ marginBottom: "28px" }}>
            <div className="card-header">
              <div className="card-title">Taxas observadas no mes</div>
              <span className="card-badge">activities</span>
            </div>
            {FUNNEL_STEPS.every(([to]) => (ns.funnel[to] ?? 0) === 0) ? (
              <p className="muted-copy">Sem eventos de stage suficientes este mes. As taxas acima usam suas estimativas.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Transicao</th>
                      <th>Entradas destino</th>
                      <th>Taxa observada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FUNNEL_STEPS.map(([to, from, label]) => {
                      const denom = ns.funnel[from] ?? 0;
                      const num = ns.funnel[to] ?? 0;
                      return (
                        <tr key={label}>
                          <td>{label}</td>
                          <td>{num}</td>
                          <td>{denom > 0 ? `${Math.round((num / denom) * 100)}%` : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <div className="card-header" style={{ marginBottom: "12px" }}>
        <div className="card-title">{editingId ? "Editar experimento" : "Novo experimento"}</div>
      </div>
      <form className="card" onSubmit={handleSubmit} style={{ marginBottom: "24px", display: "grid", gap: "10px" }}>
        <input className="settings-input" placeholder="Nome do experimento" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <textarea className="settings-input" placeholder="Hipotese" value={form.hypothesis} onChange={(e) => setForm({ ...form, hypothesis: e.target.value })} style={{ minHeight: "60px" }} />
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <select className="settings-input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input className="settings-input" placeholder="Segmento" value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} />
          <input className="settings-input" placeholder="Referencia de script" value={form.scriptRef} onChange={(e) => setForm({ ...form, scriptRef: e.target.value })} />
          <select className="settings-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <textarea className="settings-input" placeholder="Resultado / notas" value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} style={{ minHeight: "60px" }} />
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="topbar-btn primary" type="submit" disabled={saving}>
            {saving ? "Salvando..." : editingId ? "Salvar alteracoes" : "Criar experimento"}
          </button>
          {editingId ? (
            <button className="topbar-btn" type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }}>
              Cancelar
            </button>
          ) : null}
        </div>
      </form>

      {expStatus === "loading" ? (
        <div className="connection-status fallback">Carregando experimentos...</div>
      ) : expStatus === "error" ? (
        <div className="portfolio-status warning">Nao foi possivel carregar os experimentos.</div>
      ) : experiments.length === 0 ? (
        <div className="connection-status fallback">Nenhum experimento cadastrado ainda. Crie o primeiro acima.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Canal</th>
                <th>Segmento</th>
                <th>Status</th>
                <th>Resultado</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((exp) => (
                <tr key={exp.id}>
                  <td>{exp.name}</td>
                  <td>{exp.channel || "-"}</td>
                  <td>{exp.segment || "-"}</td>
                  <td><span className={`status-pill ${exp.status}`}>{exp.status}</span></td>
                  <td>{exp.result || "-"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button className="badge-action-btn" type="button" onClick={() => startEdit(exp)}>Editar</button>
                      <button className="badge-action-btn" type="button" onClick={() => handleDelete(exp.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Evolucao futura (fora do v1): vincular experimento a deal(s) especificos para medir
          resultado direto no pipeline. Por ora, o vinculo fica na anotacao de resultado. */}
    </section>
  );
}
