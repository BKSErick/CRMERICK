"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClientContracts } from "@/components/ClientContracts";
import {
  DEMAND_BILLING_LABELS,
  DEMAND_STATUS_LABELS,
  DEMAND_TIME_ZONE,
  demandBillingMonth,
  demandBillsInMonth,
  demandPaidInMonth,
  demandValueInMonth,
  formatDemandCurrency,
  formatMonthKeyLabel,
  installmentSummary,
  isClosedDemand,
  type ClientDemand,
} from "@/lib/clientDemands";
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  CLIENT_SOURCE_LABELS,
  formatCnpj,
  type ClientStatus,
  type ClientWithTotals,
} from "@/lib/clients";

type ClientWorkspaceProps = {
  clientId: number;
  month: string;
  onClose: () => void;
  onChanged: () => void;
};

async function bodyJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.error ?? fallback);
  return body as T;
}

function shortDate(value: string | null) {
  if (!value) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: DEMAND_TIME_ZONE, day: "2-digit", month: "2-digit", year: "2-digit" })
    .format(new Date(value));
}

/** Como a demanda entra na conta: competencia unica, recorrencia ou parcelamento. */
function competenciaLabel(demand: ClientDemand) {
  if (demand.billingType === "monthly") {
    return `Mensal desde ${formatMonthKeyLabel(demandBillingMonth(demand) ?? "")}`;
  }
  if (demand.billingType === "installment") {
    const summary = installmentSummary(demand);
    if (summary.count === 0) return "Parcelado, sem parcelas geradas";
    return `${summary.count}x · ${summary.paidCount} paga(s)`;
  }
  return formatMonthKeyLabel(demandBillingMonth(demand) ?? "");
}

/** Pago, em aberto ou nada a cobrar naquele mes. A baixa em si e feita na demanda. */
function pagamentoLabel(demand: ClientDemand, month: string) {
  const devido = demandValueInMonth(demand, month);
  if (devido <= 0) return "-";
  const pago = demandPaidInMonth(demand, month);
  if (pago >= devido) return "Pago";
  if (pago > 0) return `${formatDemandCurrency(pago)} de ${formatDemandCurrency(devido)}`;
  return "Em aberto";
}

/** Campos do cadastro fiscal, na ordem em que a nota pede. */
const FIELDS: Array<{ key: keyof EditableClient; label: string; wide?: boolean; maxLength: number }> = [
  { key: "name", label: "Nome", maxLength: 240 },
  { key: "legalName", label: "Razao social", maxLength: 240, wide: true },
  { key: "cnpj", label: "CNPJ", maxLength: 18 },
  { key: "stateRegistration", label: "Inscricao estadual", maxLength: 40 },
  { key: "municipalRegistration", label: "Inscricao municipal", maxLength: 40 },
  { key: "email", label: "E-mail", maxLength: 240 },
  { key: "phone", label: "Telefone", maxLength: 40 },
  { key: "zipCode", label: "CEP", maxLength: 12 },
  { key: "representativeName", label: "Representante no contrato", maxLength: 240, wide: true },
  { key: "representativeDocument", label: "CPF/documento do representante", maxLength: 40 },
  { key: "address", label: "Endereco", maxLength: 400, wide: true },
  { key: "city", label: "Cidade", maxLength: 120 },
  { key: "state", label: "UF", maxLength: 2 },
  { key: "segment", label: "Segmento", maxLength: 240 },
];

type EditableClient = Pick<
  ClientWithTotals,
  | "name" | "legalName" | "cnpj" | "stateRegistration" | "municipalRegistration"
  | "email" | "phone" | "address" | "city" | "state" | "zipCode" | "segment" | "notes"
  | "representativeName" | "representativeDocument"
>;

function toDraft(client: ClientWithTotals): EditableClient {
  return {
    name: client.name,
    legalName: client.legalName,
    cnpj: client.cnpj,
    stateRegistration: client.stateRegistration,
    municipalRegistration: client.municipalRegistration,
    email: client.email,
    phone: client.phone,
    address: client.address,
    city: client.city,
    state: client.state,
    zipCode: client.zipCode,
    representativeName: client.representativeName,
    representativeDocument: client.representativeDocument,
    segment: client.segment,
    notes: client.notes,
  };
}

export function ClientWorkspace({ clientId, month, onClose, onChanged }: ClientWorkspaceProps) {
  const [client, setClient] = useState<ClientWithTotals | null>(null);
  const [demands, setDemands] = useState<ClientDemand[]>([]);
  const [draft, setDraft] = useState<EditableClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const body = await bodyJson<{ client: ClientWithTotals; demands: ClientDemand[] }>(
        await fetch(`/api/clients?clientId=${clientId}&month=${month}`, { cache: "no-store" }),
        "Nao foi possivel abrir o cliente.",
      );
      setClient(body.client);
      setDemands(body.demands ?? []);
      setDraft(toDraft(body.client));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [clientId, month]);

  // Abertura do painel: fetch direto, sem setState sincrono dentro do efeito.
  useEffect(() => {
    let active = true;
    fetch(`/api/clients?clientId=${clientId}&month=${month}`, { cache: "no-store" })
      .then((response) => bodyJson<{ client: ClientWithTotals; demands: ClientDemand[] }>(response, "Nao foi possivel abrir o cliente."))
      .then((body) => {
        if (!active) return;
        setClient(body.client);
        setDemands(body.demands ?? []);
        setDraft(toDraft(body.client));
        setError(null);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [clientId, month]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function save(updates: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await bodyJson(
        await fetch("/api/clients", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: clientId, ...updates }),
        }),
        "Nao foi possivel salvar o cliente.",
      );
      await load();
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      // Recarrega para a tela nao ficar mostrando um valor que o banco recusou.
      await load();
    } finally {
      setBusy(false);
    }
  }

  const totals = client?.totals;
  const openDemands = demands.filter((demand) => !isClosedDemand(demand)).length;

  return (
    <div className="demand-workspace-overlay" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="demand-workspace-shell client-workspace" role="dialog" aria-modal="true" aria-label={client ? `Cliente ${client.name}` : "Cliente"}>
        {loading ? <div className="demand-workspace-loading">Carregando cliente...</div> : null}
        {!loading && !client ? (
          <div className="demand-workspace-loading">
            <p>{error ?? "Cliente nao encontrado."}</p>
            <button className="topbar-btn" onClick={onClose} type="button">Fechar</button>
          </div>
        ) : null}

        {client && draft ? (
          <main className="demand-workspace-main">
            <header className="demand-workspace-header">
              <div className="demand-workspace-heading">
                <div className="deal-breadcrumb">
                  Clientes / {CLIENT_SOURCE_LABELS[client.source]}
                  {client.dealId ? ` / deal #${client.dealId}` : ""}
                </div>
                <input
                  aria-label="Nome do cliente"
                  className="demand-title-input"
                  maxLength={240}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  onBlur={() => { if (draft.name !== client.name) void save({ name: draft.name }); }}
                />
              </div>
              <button className="deal-header-btn" aria-label="Fechar cliente" onClick={onClose} type="button">Fechar</button>
            </header>

            {error ? <div className="connection-status fallback demand-workspace-error">{error}</div> : null}

            <section className="client-totals" aria-label={`Numeros de ${formatMonthKeyLabel(month)}`}>
              <article><span>Valor em {formatMonthKeyLabel(month)}</span><strong>{formatDemandCurrency(totals?.monthValue ?? 0)}</strong></article>
              <article>
                <span>Recebido no mes</span>
                <strong>{formatDemandCurrency(totals?.monthPaidValue ?? 0)}</strong>
              </article>
              <article><span>Recorrente / mes</span><strong>{formatDemandCurrency(totals?.recurringValue ?? 0)}</strong></article>
              <article><span>Demandas abertas</span><strong>{openDemands}</strong></article>
              <article><span>Total ja contratado</span><strong>{formatDemandCurrency(totals?.contractedValue ?? 0)}</strong></article>
            </section>

            <section className="demand-properties" aria-label="Dados cadastrais">
              {FIELDS.map((field) => (
                <label className={field.wide ? "demand-property-wide" : undefined} key={field.key}>
                  {field.label}
                  <input
                    disabled={busy}
                    maxLength={field.maxLength}
                    value={field.key === "cnpj" ? (draft.cnpj ?? "") : String(draft[field.key] ?? "")}
                    onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                    onBlur={() => {
                      const next = draft[field.key] ?? "";
                      if (next !== (client[field.key] ?? "")) void save({ [field.key]: next });
                    }}
                  />
                </label>
              ))}
              <label>Status
                <select
                  disabled={busy}
                  value={client.status}
                  onChange={(event) => void save({ status: event.target.value as ClientStatus })}
                >
                  {CLIENT_STATUSES.map((status) => <option key={status} value={status}>{CLIENT_STATUS_LABELS[status]}</option>)}
                </select>
              </label>
              {client.cnpj ? (
                <p className="demand-billing-hint demand-property-wide">CNPJ formatado para a nota: {formatCnpj(client.cnpj)}</p>
              ) : null}
            </section>

            <section className="demand-editor-section">
              <ClientContracts client={client} onClientChanged={() => void load()} />
            </section>

            <section className="demand-editor-section">
              <div className="demand-section-heading">
                <div><span>Observacoes</span><small>Contexto do cliente, contatos e combinados</small></div>
              </div>
              <textarea
                aria-label="Observacoes do cliente"
                disabled={busy}
                maxLength={5000}
                placeholder="Quem decide, como cobra, o que ja foi entregue..."
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                onBlur={() => { if (draft.notes !== client.notes) void save({ notes: draft.notes }); }}
              />
            </section>

            <section className="demand-editor-section">
              <div className="demand-section-heading">
                <div><span>Demandas</span><small>{demands.length} no total, {openDemands} abertas</small></div>
                <Link className="topbar-btn" href="/demandas">Abrir Demandas</Link>
              </div>
              {demands.length === 0 ? (
                <p className="muted-copy">Nenhuma demanda registrada para este cliente.</p>
              ) : (
                <div className="demand-table-scroll">
                  <table className="demand-group-table">
                    <thead>
                      <tr>
                        <th scope="col">Demanda</th>
                        <th scope="col">Prazo</th>
                        <th scope="col">Competencia</th>
                        <th scope="col">Valor</th>
                        <th scope="col">Pagamento</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {demands.map((demand) => (
                        <tr className={demandBillsInMonth(demand, month) ? "client-demand-in-month" : ""} key={demand.id}>
                          <td>
                            <Link href={`/demandas?demandId=${demand.id}`}>{demand.title}</Link>
                          </td>
                          <td className="demand-cell-muted">{shortDate(demand.dueAt)}</td>
                          <td className="demand-cell-muted">{competenciaLabel(demand)}</td>
                          <td className="demand-cell-value">
                            <strong>
                              {demand.billingType === "installment"
                                ? formatDemandCurrency(demandValueInMonth(demand, month) || demand.value)
                                : formatDemandCurrency(demand.value)}
                            </strong>
                            <small>
                              {demand.billingType === "installment" && demandValueInMonth(demand, month) > 0
                                ? `parcela · total ${formatDemandCurrency(demand.value)}`
                                : DEMAND_BILLING_LABELS[demand.billingType]}
                            </small>
                          </td>
                          <td className="demand-cell-muted">{pagamentoLabel(demand, month)}</td>
                          <td><span className={`demand-chip status-${demand.status}`}>{DEMAND_STATUS_LABELS[demand.status]}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </main>
        ) : null}
      </div>
    </div>
  );
}
