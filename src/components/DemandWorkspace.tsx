"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { DealWorkspace } from "@/components/DealWorkspace";
import {
  DEMAND_ATTACHMENTS_BUCKET,
  DEMAND_DESTINATIONS,
  DEMAND_PRIORITIES,
  DEMAND_STATUSES,
  type ClientDemand,
  type DemandDestination,
  type DemandPriority,
  type DemandStatus,
  checklistProgress,
} from "@/lib/clientDemands";

type DemandWorkspaceProps = {
  demandId: number;
  onClose: () => void;
  onChanged: () => void;
};

const statusLabels: Record<DemandStatus, string> = {
  todo: "A fazer", in_progress: "Em andamento", review: "Em revisao", done: "Concluida", cancelled: "Cancelada",
};
const priorityLabels: Record<DemandPriority, string> = { low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" };
const destinationLabels: Record<DemandDestination, string> = {
  instagram: "Instagram", site: "Site", whatsapp: "WhatsApp", ads: "Anuncios", presentation: "Apresentacao", drive: "Drive", other: "Outro",
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

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function DemandWorkspace({ demandId, onClose, onChanged }: DemandWorkspaceProps) {
  const [demand, setDemand] = useState<ClientDemand | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"demand" | "deal">("demand");
  const [newChecklist, setNewChecklist] = useState("");
  const [newLink, setNewLink] = useState({ label: "", url: "" });
  const [comment, setComment] = useState("");

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
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const progress = useMemo(() => checklistProgress(demand?.checklistItems ?? []), [demand?.checklistItems]);

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
    <div className="demand-workspace-overlay" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="demand-workspace-shell" role="dialog" aria-modal="true" aria-label={demand ? `Demanda ${demand.title}` : "Demanda"}>
        {loading ? <div className="demand-workspace-loading">Carregando workspace...</div> : null}
        {!loading && error && !demand ? <div className="demand-workspace-loading"><p>{error}</p><button className="topbar-btn" onClick={onClose} type="button">Fechar</button></div> : null}
        {demand ? (
          <>
            <main className="demand-workspace-main">
              <header className="demand-workspace-header">
                <div className="demand-workspace-heading">
                  <div className="deal-breadcrumb">Demandas / {demand.deal?.company ?? "Deal removido"}</div>
                  <input aria-label="Titulo da demanda" className="demand-title-input" disabled={!demand.deal} maxLength={240} value={demand.title} onChange={(event) => updateLocal({ title: event.target.value })} onBlur={() => void updateDemand({ title: demand.title })} />
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
                    <label>Status<select disabled={busy || !demand.deal} value={demand.status} onChange={(event) => void updateDemand({ status: event.target.value })}>{DEMAND_STATUSES.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></label>
                    <label>Prioridade<select disabled={busy || !demand.deal} value={demand.priority} onChange={(event) => void updateDemand({ priority: event.target.value })}>{DEMAND_PRIORITIES.map((item) => <option key={item} value={item}>{priorityLabels[item]}</option>)}</select></label>
                    <label>Responsavel<input disabled={busy || !demand.deal} maxLength={160} value={demand.assignee} onChange={(event) => updateLocal({ assignee: event.target.value })} onBlur={() => void updateDemand({ assignee: demand.assignee })} /></label>
                    <label>Inicio<input disabled={busy || !demand.deal} type="date" value={inputDate(demand.startsAt)} onChange={(event) => void updateDemand({ startsAt: dateToIso(event.target.value) })} /></label>
                    <label>Prazo<input disabled={busy || !demand.deal} type="date" value={inputDate(demand.dueAt)} onChange={(event) => void updateDemand({ dueAt: dateToIso(event.target.value, true) })} /></label>
                    <label>Destino<select disabled={busy || !demand.deal} value={demand.destinationType} onChange={(event) => void updateDemand({ destinationType: event.target.value })}>{DEMAND_DESTINATIONS.map((item) => <option key={item} value={item}>{destinationLabels[item]}</option>)}</select></label>
                    <label className="demand-property-wide">Onde vai estar<input disabled={busy || !demand.deal} maxLength={240} value={demand.destinationLabel} onChange={(event) => updateLocal({ destinationLabel: event.target.value })} onBlur={() => void updateDemand({ destinationLabel: demand.destinationLabel })} /></label>
                  </section>

                  <section className="demand-editor-section">
                    <div className="demand-section-heading"><div><span>Descricao</span><small>Briefing e contexto da entrega</small></div><span>{demand.description.length}/50000</span></div>
                    <textarea aria-label="Descricao da demanda" disabled={!demand.deal} maxLength={50000} placeholder="Descreva objetivo, referencias, formato e criterios de aprovacao..." value={demand.description} onChange={(event) => updateLocal({ description: event.target.value })} onBlur={() => void updateDemand({ description: demand.description })} />
                  </section>

                  <section className="demand-editor-section">
                    <div className="demand-section-heading"><div><span>Copy</span><small>Texto final ou rascunho da demanda</small></div><button className="topbar-btn" onClick={() => navigator.clipboard?.writeText(demand.copyText)} type="button">Copiar</button></div>
                    <textarea aria-label="Copy da demanda" disabled={!demand.deal} maxLength={50000} placeholder="Escreva a copy, legenda, roteiro ou CTA..." value={demand.copyText} onChange={(event) => updateLocal({ copyText: event.target.value })} onBlur={() => void updateDemand({ copyText: demand.copyText })} />
                  </section>

                  <section className="demand-editor-section">
                    <div className="demand-section-heading"><div><span>Checklist</span><small>{progress.completed}/{progress.total} concluidos</small></div><strong>{progress.percentage}%</strong></div>
                    <div className="demand-progress"><span style={{ width: `${progress.percentage}%` }} /></div>
                    <div className="demand-checklist">
                      {demand.checklistItems.map((item, index) => (
                        <div className="demand-checklist-row" key={item.id}>
                          <input aria-label={`Concluir ${item.title}`} checked={item.isDone} disabled={busy || !demand.deal} onChange={(event) => void updateChecklist(item.id, { isDone: event.target.checked })} type="checkbox" />
                          <input aria-label="Texto do checklist" disabled={!demand.deal} value={item.title} onChange={(event) => setDemand((current) => current ? { ...current, checklistItems: current.checklistItems.map((row) => row.id === item.id ? { ...row, title: event.target.value } : row) } : current)} onBlur={() => void updateChecklist(item.id, { title: item.title })} />
                          <button aria-label="Mover item para cima" disabled={busy || index === 0 || !demand.deal} onClick={() => void moveChecklist(index, -1)} type="button">↑</button>
                          <button aria-label="Mover item para baixo" disabled={busy || index === demand.checklistItems.length - 1 || !demand.deal} onClick={() => void moveChecklist(index, 1)} type="button">↓</button>
                          <button aria-label={`Remover ${item.title}`} disabled={busy || !demand.deal} onClick={() => window.confirm("Remover este item do checklist?") && void mutate(`/api/demands/checklist?id=${item.id}`, { method: "DELETE" }, "Nao foi possivel remover o item.")} type="button">×</button>
                        </div>
                      ))}
                    </div>
                    <form className="demand-inline-form" onSubmit={addChecklist}><input aria-label="Novo item do checklist" disabled={!demand.deal} placeholder="Adicionar item" value={newChecklist} onChange={(event) => setNewChecklist(event.target.value)} /><button className="topbar-btn" disabled={busy || !newChecklist.trim() || !demand.deal} type="submit">Adicionar</button></form>
                  </section>

                  <section className="demand-editor-section">
                    <div className="demand-section-heading"><div><span>Links</span><small>Drive, referencias e publicacoes</small></div></div>
                    <div className="demand-links">
                      {demand.links.map((link) => (
                        <div className="demand-link-row" key={link.id}>
                          <input aria-label="Rotulo do link" disabled={!demand.deal} value={link.label} onChange={(event) => setDemand((current) => current ? { ...current, links: current.links.map((row) => row.id === link.id ? { ...row, label: event.target.value } : row) } : current)} onBlur={() => void mutate("/api/demands/links", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: link.id, label: link.label, url: link.url }) }, "Nao foi possivel salvar o link.")} />
                          <input aria-label="URL do link" disabled={!demand.deal} value={link.url} onChange={(event) => setDemand((current) => current ? { ...current, links: current.links.map((row) => row.id === link.id ? { ...row, url: event.target.value } : row) } : current)} onBlur={() => void mutate("/api/demands/links", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: link.id, label: link.label, url: link.url }) }, "Nao foi possivel salvar o link.")} />
                          <a aria-label={`Abrir ${link.label}`} href={link.url} rel="noreferrer" target="_blank">Abrir</a>
                          <button aria-label={`Remover ${link.label}`} disabled={!demand.deal} onClick={() => window.confirm("Remover este link?") && void mutate(`/api/demands/links?id=${link.id}`, { method: "DELETE" }, "Nao foi possivel remover o link.")} type="button">×</button>
                        </div>
                      ))}
                    </div>
                    <form className="demand-inline-form demand-link-form" onSubmit={addLink}><input aria-label="Rotulo do novo link" disabled={!demand.deal} required placeholder="Rotulo" value={newLink.label} onChange={(event) => setNewLink((current) => ({ ...current, label: event.target.value }))} /><input aria-label="URL do novo link" disabled={!demand.deal} required placeholder="https://" type="url" value={newLink.url} onChange={(event) => setNewLink((current) => ({ ...current, url: event.target.value }))} /><button className="topbar-btn" disabled={busy || !demand.deal} type="submit">Adicionar</button></form>
                  </section>

                  <section className="demand-editor-section">
                    <div className="demand-section-heading"><div><span>Anexos</span><small>Imagens, videos e documentos ate 100 MB</small></div><label className={`topbar-btn ${!demand.deal ? "disabled" : ""}`}>Anexar<input aria-label="Anexar arquivo" disabled={busy || !demand.deal} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); event.target.value = ""; }} type="file" /></label></div>
                    <div className="demand-attachments">
                      {demand.attachments.length === 0 ? <p className="muted-copy">Nenhum arquivo anexado.</p> : demand.attachments.map((attachment) => (
                        <div className="demand-attachment-row" key={attachment.id}><div><strong>{attachment.fileName}</strong><small>{attachment.mimeType} · {formatBytes(attachment.sizeBytes)}</small></div><button className="topbar-btn" onClick={() => void downloadAttachment(attachment.id)} type="button">Baixar</button><button className="topbar-btn danger" disabled={!demand.deal} onClick={() => window.confirm("Remover este anexo?") && void mutate(`/api/demands/attachments?id=${attachment.id}`, { method: "DELETE" }, "Nao foi possivel remover o anexo.")} type="button">Remover</button></div>
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
              <form className="demand-comment-composer" onSubmit={addComment}><textarea aria-label="Comentario da demanda" disabled={!demand.deal} maxLength={5000} placeholder="Adicionar comentario..." value={comment} onChange={(event) => setComment(event.target.value)} /><button className="topbar-btn primary" disabled={busy || !comment.trim() || !demand.deal} type="submit">Comentar</button></form>
            </aside>
          </>
        ) : null}
      </div>
    </div>
  );
}
