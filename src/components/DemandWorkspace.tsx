"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { DealWorkspace } from "@/components/DealWorkspace";
import { DemandDialog, type DemandDialogState } from "@/components/DemandDialog";
import {
  DEMAND_ATTACHMENTS_BUCKET,
  DEMAND_BILLING_LABELS as billingLabels,
  DEMAND_BILLING_TYPES,
  DEMAND_DESTINATIONS,
  DEMAND_DESTINATION_LABELS as destinationLabels,
  DEMAND_PRIORITIES,
  DEMAND_PRIORITY_LABELS as priorityLabels,
  DEMAND_STATUSES,
  DEMAND_STATUS_LABELS as statusLabels,
  MAX_DEMAND_INSTALLMENTS,
  type ClientDemand,
  checklistProgress,
  demandBillingMonth,
  demandClientName,
  formatDemandCurrency,
  formatMonthKeyLabel,
  installmentSummary,
  isMonthPaid,
  recurringMonthsUntil,
} from "@/lib/clientDemands";

export type DemandFolderOption = {
  id: number;
  label: string;
};

type DemandWorkspaceProps = {
  demandId: number;
  onClose: () => void;
  onChanged: () => void;
  folderOptions?: DemandFolderOption[];
};

async function bodyJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.error ?? fallback);
  return body as T;
}

function inputDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function dateToIso(value: string, endOfDay = false) {
  if (!value) return null;
  return new Date(`${value}T${endOfDay ? "23:59:59" : "09:00:00"}-03:00`).toISOString();
}

/** Data da baixa daquele mes, ja formatada. */
function paidLabel(demand: ClientDemand, month: string) {
  const charge = demand.charges.find((item) => item.billingMonth === month && item.paidAt);
  return charge?.paidAt ? new Date(charge.paidAt).toLocaleDateString("pt-BR") : "-";
}

/** Uma frase dizendo o que sera cobrado, para o campo nao virar adivinhacao. */
function billingHint(demand: ClientDemand, summary: ReturnType<typeof installmentSummary>) {
  const month = demand.billingMonth ?? demandBillingMonth(demand);
  const monthLabel = month ? formatMonthKeyLabel(month) : "o mes do prazo";

  if (demand.billingType === "monthly") {
    const end = demand.billingUntil ? ` ate ${formatMonthKeyLabel(demand.billingUntil)}` : "";
    return `${formatDemandCurrency(demand.value)} por mes a partir de ${monthLabel}${end}.`;
  }

  if (demand.billingType === "installment") {
    if (summary.count === 0) return `${formatDemandCurrency(demand.value)} ainda sem parcelas geradas.`;
    const next = summary.nextOpen
      ? ` Proxima: parcela ${summary.nextOpen.number} em ${formatMonthKeyLabel(summary.nextOpen.billingMonth)}.`
      : " Tudo pago.";
    return `${formatDemandCurrency(summary.total)} em ${summary.count}x.${next}`;
  }

  const semMes = demand.billingMonth ? "" : " Sem mes escolhido, entra no mes do prazo.";
  return `${formatDemandCurrency(demand.value)} na competencia ${monthLabel}.${semMes}`;
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function ChecklistActionIcon({ kind }: { kind: "up" | "down" | "trash" }) {
  if (kind === "trash") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M4 5h12M8 5V3h4v2m-6 0 .6 11h6.8L14 5M8.5 8v5m3-5v5" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d={kind === "up" ? "m5 12 5-5 5 5" : "m5 8 5 5 5-5"} />
    </svg>
  );
}

export function DemandWorkspace({ demandId, onClose, onChanged, folderOptions = [] }: DemandWorkspaceProps) {
  const [demand, setDemand] = useState<ClientDemand | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"demand" | "deal">("demand");
  const [newChecklist, setNewChecklist] = useState("");
  const [newLink, setNewLink] = useState({ label: "", url: "" });
  const [comment, setComment] = useState("");
  // Nulo = "ainda nao mexi": o campo mostra o parcelamento que a demanda ja tem.
  const [parcelCount, setParcelCount] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<DemandDialogState | null>(null);

  async function refresh(showLoading = false) {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const body = await bodyJson<{ demand: ClientDemand }>(
        await fetch(`/api/demands?demandId=${encodeURIComponent(demandId)}`, { cache: "no-store" }),
        "Nao foi possivel abrir a demanda.",
      );
      setDemand(body.demand);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/demands?demandId=${encodeURIComponent(demandId)}`, { cache: "no-store" })
      .then((response) => bodyJson<{ demand: ClientDemand }>(response, "Nao foi possivel abrir a demanda."))
      .then((body) => {
        if (active) setDemand(body.demand);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [demandId]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !confirmDialog) onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [confirmDialog, onClose]);

  const progress = useMemo(() => checklistProgress(demand?.checklistItems ?? []), [demand?.checklistItems]);
  /**
   * Meses em que essa demanda pode receber baixa. Pontual tem um; mensal tem os meses
   * ja vencidos; parcelado nao usa (a baixa e por parcela).
   */
  const paymentMonths = useMemo(() => {
    if (!demand || demand.billingType === "installment") return [];
    if (demand.billingType === "monthly") return recurringMonthsUntil(demand);
    const month = demandBillingMonth(demand);
    return month ? [month] : [];
  }, [demand]);

  const summary = useMemo(
    () => installmentSummary({
      status: demand?.status ?? "todo",
      value: demand?.value ?? 0,
      billingType: demand?.billingType ?? "one_off",
      billingMonth: demand?.billingMonth ?? null,
      billingUntil: demand?.billingUntil ?? null,
      dueAt: demand?.dueAt ?? null,
      createdAt: demand?.createdAt ?? "",
      charges: demand?.charges ?? [],
    }),
    [demand],
  );
  // Sem cliente E sem deal a demanda perdeu o dono: vira historico so de leitura.
  const readOnly = Boolean(demand) && !demand?.client && !demand?.deal;

  async function mutate(path: string, options: RequestInit, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await bodyJson(await fetch(path, options), fallback);
      await refresh();
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  function requestRemoval(title: string, message: string, path: string, fallback: string) {
    setConfirmDialog({
      mode: "confirm",
      title,
      message,
      confirmLabel: "Remover",
      destructive: true,
      onConfirm: () => { void mutate(path, { method: "DELETE" }, fallback).catch(() => undefined); },
    });
  }

  async function updateDemand(updates: Record<string, unknown>) {
    await mutate("/api/demands", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: demandId, ...updates }),
    }, "Nao foi possivel salvar a demanda.");
  }

  function updateLocal(updates: Partial<ClientDemand>) {
    setDemand((current) => current ? { ...current, ...updates } : current);
  }

  async function generateInstallments() {
    await mutate("/api/demands/charges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demandId, count: Number(parcelCount ?? summary.count ?? 3) }),
    }, "Nao foi possivel gerar as parcelas.").catch(() => undefined);
  }

  async function updateInstallment(id: number, updates: Record<string, unknown>) {
    await mutate("/api/demands/charges", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    }, "Nao foi possivel atualizar a parcela.").catch(() => undefined);
  }

  /** Baixa do mes inteiro: e assim que pontual e mensal registram pagamento. */
  async function toggleMonthPaid(month: string, paid: boolean) {
    await mutate("/api/demands/charges", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demandId, month, paid }),
    }, "Nao foi possivel registrar o pagamento.").catch(() => undefined);
  }

  async function addChecklist(event: FormEvent) {
    event.preventDefault();
    if (!newChecklist.trim()) return;
    await mutate("/api/demands/checklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demandId, title: newChecklist }) }, "Nao foi possivel adicionar o item.");
    setNewChecklist("");
  }

  async function updateChecklist(id: number, updates: Record<string, unknown>) {
    await mutate("/api/demands/checklist", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...updates }) }, "Nao foi possivel atualizar o checklist.");
  }

  async function moveChecklist(index: number, direction: -1 | 1) {
    if (!demand) return;
    const target = index + direction;
    if (target < 0 || target >= demand.checklistItems.length) return;
    const currentItem = demand.checklistItems[index];
    const targetItem = demand.checklistItems[target];
    setBusy(true);
    try {
      await bodyJson(await fetch("/api/demands/checklist", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: currentItem.id, position: targetItem.position }) }), "Falha ao reordenar.");
      await bodyJson(await fetch("/api/demands/checklist", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: targetItem.id, position: currentItem.position }) }), "Falha ao reordenar.");
      await refresh(); onChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  async function addLink(event: FormEvent) {
    event.preventDefault();
    await mutate("/api/demands/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demandId, ...newLink }) }, "Nao foi possivel adicionar o link.");
    setNewLink({ label: "", url: "" });
  }

  async function uploadAttachment(file: File) {
    setBusy(true); setError(null);
    try {
      const prepared = await bodyJson<{ upload: { path: string; token: string; storageUrl: string; anonKey: string } }>(
        await fetch("/api/demands/attachments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare-upload", demandId, fileName: file.name, mimeType: file.type, sizeBytes: file.size }) }),
        "Nao foi possivel preparar o upload.",
      );
      const client = createClient(prepared.upload.storageUrl, prepared.upload.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const uploaded = await client.storage.from(DEMAND_ATTACHMENTS_BUCKET).uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, { contentType: file.type });
      if (uploaded.error) throw uploaded.error;
      await bodyJson(await fetch("/api/demands/attachments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm-upload", demandId, storagePath: prepared.upload.path, fileName: file.name, mimeType: file.type, sizeBytes: file.size }) }), "Nao foi possivel confirmar o upload.");
      await refresh(); onChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  async function downloadAttachment(id: number) {
    try {
      const body = await bodyJson<{ signedUrl: string }>(await fetch(`/api/demands/attachments?id=${id}`), "Nao foi possivel baixar o anexo.");
      window.open(body.signedUrl, "_blank", "noopener,noreferrer");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!comment.trim()) return;
    await mutate("/api/demands/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demandId, description: comment }) }, "Nao foi possivel comentar.");
    setComment("");
  }

  return (
    <>
      <div className="demand-workspace-overlay" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="demand-workspace-shell" role="dialog" aria-modal="true" aria-label={demand ? `Demanda ${demand.title}` : "Demanda"}>
        {loading ? <div className="demand-workspace-loading">Carregando workspace...</div> : null}
        {!loading && error && !demand ? <div className="demand-workspace-loading"><p>{error}</p><button className="topbar-btn" onClick={onClose} type="button">Fechar</button></div> : null}
        {demand ? (
          <>
            <main className="demand-workspace-main">
              <header className="demand-workspace-header">
                <div className="demand-workspace-heading">
                  <div className="deal-breadcrumb">Demandas / {demandClientName(demand)}</div>
                  <input aria-label="Titulo da demanda" className="demand-title-input" disabled={readOnly} maxLength={240} value={demand.title} onChange={(event) => updateLocal({ title: event.target.value })} onBlur={() => void updateDemand({ title: demand.title })} />
                </div>
                <button className="deal-header-btn" aria-label="Fechar demanda" onClick={onClose} type="button">Fechar</button>
              </header>

              <nav className="demand-workspace-tabs" aria-label="Areas do workspace">
                <button className={tab === "demand" ? "active" : ""} onClick={() => setTab("demand")} type="button">Demanda</button>
                <button className={tab === "deal" ? "active" : ""} onClick={() => setTab("deal")} type="button">Deal comercial</button>
              </nav>

              {error ? <div className="connection-status fallback demand-workspace-error">{error}</div> : null}

              {tab === "deal" ? (
                <DealWorkspace deal={demand.deal} />
              ) : (
                <>
                  <section className="demand-properties" aria-label="Propriedades da demanda">
                    <label>Status<select disabled={busy || readOnly} value={demand.status} onChange={(event) => void updateDemand({ status: event.target.value })}>{DEMAND_STATUSES.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></label>
                    <label>Prioridade<select disabled={busy || readOnly} value={demand.priority} onChange={(event) => void updateDemand({ priority: event.target.value })}>{DEMAND_PRIORITIES.map((item) => <option key={item} value={item}>{priorityLabels[item]}</option>)}</select></label>
                    <label>Responsavel<input disabled={busy || readOnly} maxLength={160} value={demand.assignee} onChange={(event) => updateLocal({ assignee: event.target.value })} onBlur={() => void updateDemand({ assignee: demand.assignee })} /></label>
                    <label>Inicio<input disabled={busy || readOnly} type="date" value={inputDate(demand.startsAt)} onChange={(event) => void updateDemand({ startsAt: dateToIso(event.target.value) })} /></label>
                    <label>Prazo<input disabled={busy || readOnly} type="date" value={inputDate(demand.dueAt)} onChange={(event) => void updateDemand({ dueAt: dateToIso(event.target.value, true) })} /></label>
                    <label>Destino<select disabled={busy || readOnly} value={demand.destinationType} onChange={(event) => void updateDemand({ destinationType: event.target.value })}>{DEMAND_DESTINATIONS.map((item) => <option key={item} value={item}>{destinationLabels[item]}</option>)}</select></label>
                    <label>Pasta
                      <select
                        disabled={busy || readOnly || folderOptions.length === 0}
                        value={demand.folderId ?? ""}
                        onChange={(event) => void updateDemand({ folderId: event.target.value === "" ? null : Number(event.target.value) })}
                      >
                        <option value="">Sem pasta</option>
                        {folderOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="demand-property-wide">Onde vai estar<input disabled={busy || readOnly} maxLength={240} value={demand.destinationLabel} onChange={(event) => updateLocal({ destinationLabel: event.target.value })} onBlur={() => void updateDemand({ destinationLabel: demand.destinationLabel })} /></label>
                  </section>

                  <section className="demand-properties demand-billing" aria-label="Cobranca da demanda">
                    <label>Valor (R$)
                      <input
                        disabled={busy || readOnly}
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        type="number"
                        value={demand.value ? String(demand.value) : ""}
                        placeholder="0,00"
                        onChange={(event) => updateLocal({ value: Number(event.target.value) || 0 })}
                        onBlur={() => void updateDemand({ value: demand.value })}
                      />
                    </label>
                    <label>Cobranca
                      <select disabled={busy || readOnly} value={demand.billingType} onChange={(event) => void updateDemand({ billingType: event.target.value })}>
                        {DEMAND_BILLING_TYPES.map((item) => <option key={item} value={item}>{billingLabels[item]}</option>)}
                      </select>
                    </label>
                    <label>Mes de cobranca
                      <input
                        disabled={busy || readOnly}
                        type="month"
                        value={demand.billingMonth ?? ""}
                        onChange={(event) => void updateDemand({ billingMonth: event.target.value || null })}
                      />
                    </label>
                    {demand.billingType === "monthly" ? (
                      <label>Cobrar ate
                        <input
                          disabled={busy || readOnly}
                          type="month"
                          value={demand.billingUntil ?? ""}
                          onChange={(event) => void updateDemand({ billingUntil: event.target.value || null })}
                        />
                      </label>
                    ) : null}
                    {demand.billingType === "installment" ? (
                      <label>Parcelas
                        <span className="demand-installment-generate">
                          <input
                            aria-label="Numero de parcelas"
                            disabled={busy || readOnly}
                            max={MAX_DEMAND_INSTALLMENTS}
                            min={1}
                            type="number"
                            value={parcelCount ?? String(summary.count || 3)}
                            onChange={(event) => setParcelCount(event.target.value)}
                          />
                          <button className="topbar-btn" disabled={busy || readOnly} onClick={() => void generateInstallments()} type="button">
                            {summary.count > 0 ? "Refazer" : "Gerar"}
                          </button>
                        </span>
                      </label>
                    ) : null}
                    <p className="demand-billing-hint demand-property-wide">
                      {billingHint(demand, summary)}
                    </p>
                  </section>

                  {demand.billingType !== "installment" ? (
                    <section className="demand-editor-section">
                      <div className="demand-section-heading">
                        <div>
                          <span>Pagamento</span>
                          <small>
                            {demand.billingType === "monthly"
                              ? "Uma baixa por mes cobrado"
                              : "Baixa unica, na competencia da demanda"}
                          </small>
                        </div>
                      </div>
                      <div className="demand-installments">
                        {paymentMonths.length === 0 ? (
                          <p className="muted-copy">Defina o mes de cobranca para dar baixa.</p>
                        ) : paymentMonths.map((month) => {
                          const paid = isMonthPaid(demand, month);
                          return (
                            <div className={`demand-installment-row ${paid ? "paid" : ""}`} key={month}>
                              <span className="demand-installment-number">{formatMonthKeyLabel(month)}</span>
                              <span className="demand-cell-value"><strong>{formatDemandCurrency(demand.value)}</strong></span>
                              <span className="demand-installment-status">
                                {paid ? `Pago em ${paidLabel(demand, month)}` : "Em aberto"}
                              </span>
                              <button
                                className={`topbar-btn ${paid ? "" : "primary"}`}
                                disabled={busy || readOnly}
                                onClick={() => void toggleMonthPaid(month, !paid)}
                                type="button"
                              >
                                {paid ? "Desfazer" : "Marcar pago"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}

                  {demand.billingType === "installment" ? (
                    <section className="demand-editor-section">
                      <div className="demand-section-heading">
                        <div>
                          <span>Parcelas</span>
                          <small>
                            {summary.count === 0
                              ? "Escolha em quantas vezes e clique em Gerar"
                              : `${summary.paidCount} de ${summary.count} pagas · ${formatDemandCurrency(summary.openValue)} em aberto`}
                          </small>
                        </div>
                        {summary.count > 0 ? <strong>{formatDemandCurrency(summary.total)}</strong> : null}
                      </div>
                      {summary.count > 0 ? (
                        <div className="demand-installments">
                          {demand.charges.map((parcel) => (
                            <div className={`demand-installment-row ${parcel.paidAt ? "paid" : ""}`} key={parcel.id}>
                              <span className="demand-installment-number">{parcel.number}/{summary.count}</span>
                              <input
                                aria-label={`Mes da parcela ${parcel.number}`}
                                disabled={busy || readOnly}
                                type="month"
                                value={parcel.billingMonth}
                                onChange={(event) => void updateInstallment(parcel.id, { billingMonth: event.target.value })}
                              />
                              <input
                                aria-label={`Valor da parcela ${parcel.number}`}
                                disabled={busy || readOnly}
                                min={0}
                                step="0.01"
                                type="number"
                                defaultValue={parcel.value}
                                onBlur={(event) => {
                                  const next = Number(event.target.value);
                                  if (next !== parcel.value) void updateInstallment(parcel.id, { value: next });
                                }}
                              />
                              <span className="demand-installment-status">
                                {parcel.paidAt ? `Pago em ${new Date(parcel.paidAt).toLocaleDateString("pt-BR")}` : "Em aberto"}
                              </span>
                              <button
                                className={`topbar-btn ${parcel.paidAt ? "" : "primary"}`}
                                disabled={busy || readOnly}
                                onClick={() => void updateInstallment(parcel.id, { paid: !parcel.paidAt })}
                                type="button"
                              >
                                {parcel.paidAt ? "Desfazer" : "Marcar pago"}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  <section className="demand-editor-section">
                    <div className="demand-section-heading"><div><span>Descricao</span><small>Briefing e contexto da entrega</small></div><span>{demand.description.length}/50000</span></div>
                    <textarea aria-label="Descricao da demanda" disabled={readOnly} maxLength={50000} placeholder="Descreva objetivo, referencias, formato e criterios de aprovacao..." value={demand.description} onChange={(event) => updateLocal({ description: event.target.value })} onBlur={() => void updateDemand({ description: demand.description })} />
                  </section>

                  <section className="demand-editor-section">
                    <div className="demand-section-heading"><div><span>Copy</span><small>Texto final ou rascunho da demanda</small></div><button className="topbar-btn" onClick={() => navigator.clipboard?.writeText(demand.copyText)} type="button">Copiar</button></div>
                    <textarea aria-label="Copy da demanda" disabled={readOnly} maxLength={50000} placeholder="Escreva a copy, legenda, roteiro ou CTA..." value={demand.copyText} onChange={(event) => updateLocal({ copyText: event.target.value })} onBlur={() => void updateDemand({ copyText: demand.copyText })} />
                  </section>

                  <section className="demand-editor-section">
                    <div className="demand-section-heading"><div><span>Checklist</span><small>{progress.completed}/{progress.total} concluidos</small></div><strong>{progress.percentage}%</strong></div>
                    <div className="demand-progress"><span style={{ width: `${progress.percentage}%` }} /></div>
                    <div className="demand-checklist">
                      {demand.checklistItems.map((item, index) => (
                        <div className={`demand-checklist-row ${item.isDone ? "done" : ""}`} key={item.id}>
                          <input aria-label={`Concluir ${item.title}`} checked={item.isDone} disabled={busy || readOnly} onChange={(event) => void updateChecklist(item.id, { isDone: event.target.checked })} type="checkbox" />
                          <input aria-label="Texto do checklist" className="demand-checklist-title" disabled={busy || readOnly} type="text" value={item.title} onChange={(event) => setDemand((current) => current ? { ...current, checklistItems: current.checklistItems.map((row) => row.id === item.id ? { ...row, title: event.target.value } : row) } : current)} onBlur={() => void updateChecklist(item.id, { title: item.title })} />
                          <div className="demand-checklist-actions">
                            <button aria-label="Mover item para cima" className="demand-checklist-action" disabled={busy || index === 0 || readOnly} onClick={() => void moveChecklist(index, -1)} type="button"><ChecklistActionIcon kind="up" /></button>
                            <button aria-label="Mover item para baixo" className="demand-checklist-action" disabled={busy || index === demand.checklistItems.length - 1 || readOnly} onClick={() => void moveChecklist(index, 1)} type="button"><ChecklistActionIcon kind="down" /></button>
                            <button aria-label={`Remover ${item.title}`} className="demand-checklist-action danger" disabled={busy || readOnly} onClick={() => requestRemoval("Remover item", `Remover \"${item.title}\" do checklist?`, `/api/demands/checklist?id=${item.id}`, "Nao foi possivel remover o item.")} type="button"><ChecklistActionIcon kind="trash" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <form className="demand-inline-form" onSubmit={addChecklist}><input aria-label="Novo item do checklist" disabled={readOnly} placeholder="Adicionar item" value={newChecklist} onChange={(event) => setNewChecklist(event.target.value)} /><button className="topbar-btn" disabled={busy || !newChecklist.trim() || readOnly} type="submit">Adicionar</button></form>
                  </section>

                  <section className="demand-editor-section">
                    <div className="demand-section-heading"><div><span>Links</span><small>Drive, referencias e publicacoes</small></div></div>
                    <div className="demand-links">
                      {demand.links.map((link) => (
                        <div className="demand-link-row" key={link.id}>
                          <input aria-label="Rotulo do link" disabled={readOnly} value={link.label} onChange={(event) => setDemand((current) => current ? { ...current, links: current.links.map((row) => row.id === link.id ? { ...row, label: event.target.value } : row) } : current)} onBlur={() => void mutate("/api/demands/links", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: link.id, label: link.label, url: link.url }) }, "Nao foi possivel salvar o link.")} />
                          <input aria-label="URL do link" disabled={readOnly} value={link.url} onChange={(event) => setDemand((current) => current ? { ...current, links: current.links.map((row) => row.id === link.id ? { ...row, url: event.target.value } : row) } : current)} onBlur={() => void mutate("/api/demands/links", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: link.id, label: link.label, url: link.url }) }, "Nao foi possivel salvar o link.")} />
                          <a aria-label={`Abrir ${link.label}`} href={link.url} rel="noreferrer" target="_blank">Abrir</a>
                          <button aria-label={`Remover ${link.label}`} className="demand-row-action danger" disabled={busy || readOnly} onClick={() => requestRemoval("Remover link", `Remover o link \"${link.label}\"?`, `/api/demands/links?id=${link.id}`, "Nao foi possivel remover o link.")} type="button"><ChecklistActionIcon kind="trash" /></button>
                        </div>
                      ))}
                    </div>
                    <form className="demand-inline-form demand-link-form" onSubmit={addLink}><input aria-label="Rotulo do novo link" disabled={readOnly} required placeholder="Rotulo" value={newLink.label} onChange={(event) => setNewLink((current) => ({ ...current, label: event.target.value }))} /><input aria-label="URL do novo link" disabled={readOnly} required placeholder="https://" type="url" value={newLink.url} onChange={(event) => setNewLink((current) => ({ ...current, url: event.target.value }))} /><button className="topbar-btn" disabled={busy || readOnly} type="submit">Adicionar</button></form>
                  </section>

                  <section className="demand-editor-section">
                    <div className="demand-section-heading"><div><span>Anexos</span><small>Imagens, videos e documentos ate 100 MB</small></div><label className={`topbar-btn ${readOnly ? "disabled" : ""}`}>Anexar<input aria-label="Anexar arquivo" disabled={busy || readOnly} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); event.target.value = ""; }} type="file" /></label></div>
                    <div className="demand-attachments">
                      {demand.attachments.length === 0 ? <p className="muted-copy">Nenhum arquivo anexado.</p> : demand.attachments.map((attachment) => (
                        <div className="demand-attachment-row" key={attachment.id}><div><strong>{attachment.fileName}</strong><small>{attachment.mimeType} · {formatBytes(attachment.sizeBytes)}</small></div><button className="topbar-btn" onClick={() => void downloadAttachment(attachment.id)} type="button">Baixar</button><button className="topbar-btn danger" disabled={busy || readOnly} onClick={() => requestRemoval("Remover anexo", `Remover o arquivo \"${attachment.fileName}\"?`, `/api/demands/attachments?id=${attachment.id}`, "Nao foi possivel remover o anexo.")} type="button">Remover</button></div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </main>

            <aside className="demand-activity-panel">
              <div className="activity-header"><span className="activity-title">Atividade</span><span className="status-pill">{demand.events.length}</span></div>
              <div className="activity-feed">
                {demand.events.length === 0 ? <p className="muted-copy">Nenhuma atividade registrada.</p> : demand.events.map((event) => (
                  <div className="activity-item" key={event.id}><div className="activity-avatar">{event.actor.slice(0, 2).toUpperCase()}</div><div className="activity-content"><div className="activity-text"><strong>{event.actor}</strong> {event.description}</div><span className="activity-time">{new Date(event.createdAt).toLocaleString("pt-BR")}</span></div></div>
                ))}
              </div>
              <form className="demand-comment-composer" onSubmit={addComment}><textarea aria-label="Comentario da demanda" disabled={readOnly} maxLength={5000} placeholder="Adicionar comentario..." value={comment} onChange={(event) => setComment(event.target.value)} /><button className="topbar-btn primary" disabled={busy || !comment.trim() || readOnly} type="submit">Comentar</button></form>
            </aside>
          </>
        ) : null}
        </div>
      </div>
      <DemandDialog onClose={() => setConfirmDialog(null)} state={confirmDialog} />
    </>
  );
}
