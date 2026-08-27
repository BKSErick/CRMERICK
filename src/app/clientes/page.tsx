"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ClientWorkspace } from "@/components/ClientWorkspace";
import { currentMonthKey, formatDemandCurrency, formatMonthKeyLabel } from "@/lib/clientDemands";
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  CLIENT_SOURCE_LABELS,
  formatCnpj,
  type ClientStatus,
  type ClientWithTotals,
} from "@/lib/clients";

async function responseJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.error ?? fallback);
  return body as T;
}

const EMPTY_FORM = {
  name: "",
  legalName: "",
  cnpj: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  segment: "",
};

export default function ClientesPage() {
  const [clients, setClients] = useState<ClientWithTotals[]>([]);
  const [month, setMonth] = useState(currentMonthKey());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClientStatus | "all">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async (targetMonth: string) => {
    setError(null);
    try {
      const body = await responseJson<{ clients: ClientWithTotals[] }>(
        await fetch(`/api/clients?month=${targetMonth}`, { cache: "no-store" }),
        "Nao foi possivel carregar os clientes.",
      );
      setClients(body.clients ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  // A carga inicial (e a troca de mes) roda direto no fetch: chamar `load` aqui
  // colocaria um setState sincrono dentro do efeito.
  useEffect(() => {
    let active = true;
    fetch(`/api/clients?month=${month}`, { cache: "no-store" })
      .then((response) => responseJson<{ clients: ClientWithTotals[] }>(response, "Nao foi possivel carregar os clientes."))
      .then((body) => {
        if (!active) return;
        setClients(body.clients ?? []);
        setError(null);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [month]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return clients.filter((client) => {
      if (statusFilter !== "all" && client.status !== statusFilter) return false;
      if (!needle) return true;
      return `${client.name} ${client.legalName} ${client.cnpj ?? ""} ${client.segment}`
        .toLocaleLowerCase("pt-BR")
        .includes(needle);
    });
  }, [clients, query, statusFilter]);

  const totals = useMemo(() => filtered.reduce(
    (acc, client) => ({
      active: acc.active + (client.status === "active" ? 1 : 0),
      monthValue: acc.monthValue + client.totals.monthValue,
      monthPaid: acc.monthPaid + client.totals.monthPaidValue,
      recurring: acc.recurring + client.totals.recurringValue,
      openDemands: acc.openDemands + client.totals.openDemands,
    }),
    { active: 0, monthValue: 0, monthPaid: 0, recurring: 0, openDemands: 0 },
  ), [filtered]);

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const body = await responseJson<{ client: ClientWithTotals }>(
        await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }),
        "Nao foi possivel cadastrar o cliente.",
      );
      setForm(EMPTY_FORM);
      setShowCreate(false);
      setNotice(`${body.client.name} cadastrado.`);
      await load(month);
      setSelectedId(body.client.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="clients-page">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Clientes</h1>
          <div className="subtitle">
            Todo deal ganho vira cliente aqui. O valor de cada entrega fica na demanda; esta tela soma o mes.
          </div>
        </div>
        <div className="page-header-right clients-header-actions">
          <label className="clients-month">
            <span className="sr-only">Mes de referencia</span>
            <input aria-label="Mes de referencia" type="month" value={month} onChange={(event) => setMonth(event.target.value || currentMonthKey())} />
          </label>
          <button className="topbar-btn primary" onClick={() => setShowCreate((current) => !current)} type="button">
            {showCreate ? "Fechar" : "+ Novo cliente"}
          </button>
        </div>
      </div>

      {notice ? (
        <div className="demands-notice ok">
          {notice}
          <button className="demands-notice-close" onClick={() => setNotice(null)} type="button" aria-label="Fechar aviso">{"×"}</button>
        </div>
      ) : null}
      {error ? (
        <div className="demands-notice">
          {error} <button className="topbar-btn" onClick={() => void load(month)} type="button">Tentar novamente</button>
        </div>
      ) : null}

      <div className="kpi-row">
        <article className="kpi-card">
          <div className="kpi-label">Clientes ativos</div>
          <div className="kpi-value">{totals.active}</div>
          <div className="kpi-trend">{filtered.length} na lista</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Faturamento de {formatMonthKeyLabel(month)}</div>
          <div className="kpi-value">{formatDemandCurrency(totals.monthValue)}</div>
          <div className="kpi-trend">
            {totals.monthPaid > 0 ? `${formatDemandCurrency(totals.monthPaid)} ja recebido` : "Demandas da competencia"}
          </div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Recorrente / mes</div>
          <div className="kpi-value">{formatDemandCurrency(totals.recurring)}</div>
          <div className="kpi-trend">Demandas marcadas como mensais</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Demandas abertas</div>
          <div className="kpi-value">{totals.openDemands}</div>
          <div className="kpi-trend">Em todos os clientes listados</div>
        </article>
      </div>

      {showCreate ? (
        <form className="card demand-create-panel" onSubmit={createClient}>
          <div className="card-header demand-create-heading">
            <div>
              <div className="card-title">Novo cliente</div>
              <div className="muted-copy">Cadastro direto, sem passar pelo pipeline. CNPJ e endereco ficam prontos para a nota.</div>
            </div>
          </div>
          <label className="demand-create-title">Nome
            <input required maxLength={240} placeholder="Como voce chama o cliente" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label className="demand-create-title">Razao social
            <input maxLength={240} placeholder="Nome na nota fiscal" value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} />
          </label>
          <label>CNPJ
            <input maxLength={18} placeholder="00.000.000/0000-00" value={form.cnpj} onChange={(event) => setForm({ ...form, cnpj: event.target.value })} />
          </label>
          <label>E-mail
            <input maxLength={240} placeholder="financeiro@cliente.com.br" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </label>
          <label>Telefone
            <input maxLength={40} placeholder="(31) 90000-0000" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </label>
          <label>CEP
            <input maxLength={12} placeholder="35930-000" value={form.zipCode} onChange={(event) => setForm({ ...form, zipCode: event.target.value })} />
          </label>
          <label className="demand-create-title">Endereco
            <input maxLength={400} placeholder="Rua, numero, bairro" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
          </label>
          <label>Cidade
            <input maxLength={120} value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </label>
          <label>UF
            <input maxLength={2} placeholder="MG" value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value.toLocaleUpperCase("pt-BR") })} />
          </label>
          <label>Segmento
            <input maxLength={240} placeholder="Manutencao industrial" value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value })} />
          </label>
          <button className="topbar-btn primary" disabled={creating || !form.name.trim()} type="submit">
            {creating ? "Cadastrando..." : "Cadastrar cliente"}
          </button>
        </form>
      ) : null}

      <div className="demand-filterbar" aria-label="Filtros de clientes">
        <div className="demand-chip-filter" role="group" aria-label="Status do cliente">
          <button aria-pressed={statusFilter === "all"} className={`demand-chip ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")} type="button">
            Todos
          </button>
          {CLIENT_STATUSES.map((status) => (
            <button
              aria-pressed={statusFilter === status}
              className={`demand-chip ${statusFilter === status ? "active" : ""}`}
              key={status}
              onClick={() => setStatusFilter(status)}
              type="button"
            >
              {CLIENT_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
        <label className="demand-filter-search">
          <span className="sr-only">Buscar cliente</span>
          <input placeholder="Buscar por nome, CNPJ ou segmento" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>

      {loading ? (
        <div className="card demands-empty">Carregando clientes...</div>
      ) : filtered.length === 0 ? (
        <div className="card demands-empty">
          Nenhum cliente por aqui. Feche um deal no pipeline ou use o botao Novo cliente.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="clients-table">
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">CNPJ</th>
                <th scope="col">Origem</th>
                <th scope="col">Demandas</th>
                <th scope="col">{formatMonthKeyLabel(month)}</th>
                <th scope="col">Recorrente</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr
                  key={client.id}
                  onClick={() => setSelectedId(client.id)}
                  tabIndex={0}
                  title="Abrir cliente"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(client.id);
                    }
                  }}
                >
                  <td>
                    <strong>{client.name}</strong>
                    {client.segment ? <small className="demand-cell-muted"> {client.segment}</small> : null}
                  </td>
                  <td className="demand-cell-muted">{client.cnpj ? formatCnpj(client.cnpj) : "-"}</td>
                  <td className="demand-cell-muted">{CLIENT_SOURCE_LABELS[client.source]}</td>
                  <td>
                    {client.totals.openDemands}
                    <small className="demand-cell-muted"> / {client.totals.demands}</small>
                    {client.totals.overdueDemands > 0 ? (
                      <span className="demand-cell-date overdue"> {client.totals.overdueDemands} atrasada(s)</span>
                    ) : null}
                  </td>
                  <td className="demand-cell-value"><strong>{formatDemandCurrency(client.totals.monthValue)}</strong></td>
                  <td className="demand-cell-value">
                    {client.totals.recurringValue > 0 ? (
                      <>
                        <strong>{formatDemandCurrency(client.totals.recurringValue)}</strong>
                        <small>/mes</small>
                      </>
                    ) : (
                      <span className="demand-cell-muted">-</span>
                    )}
                  </td>
                  <td><span className={`demand-chip client-status-${client.status}`}>{CLIENT_STATUS_LABELS[client.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId ? (
        <ClientWorkspace
          clientId={selectedId}
          month={month}
          onChanged={() => void load(month)}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </section>
  );
}
