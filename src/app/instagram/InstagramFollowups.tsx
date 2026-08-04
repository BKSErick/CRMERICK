"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  instagramKanbanColumnForStatus,
  type InstagramKanbanColumn,
} from "@/lib/prospecting";

type QueueMessage = {
  id: number;
  content: string;
  direction: string;
  status?: string;
  occurred_at?: string | null;
};

type QueueItem = {
  channel: {
    dealId: number;
    identity?: string | null;
    profileUrl?: string | null;
    status?: string;
    matchConfidence?: string;
    nextActionAt?: string | null;
    nextActionNote?: string | null;
    responseType?: string;
  };
  deal: { id: number; name?: string; company?: string; segment?: string } | null;
  messages: QueueMessage[];
  suggestedMessage: string;
};

type KanbanColumnDefinition = {
  id: InstagramKanbanColumn;
  label: string;
  description: string;
};

const ACTIVE_COLUMNS: KanbanColumnDefinition[] = [
  { id: "to_contact", label: "Para abordar", description: "Perfis prontos para o primeiro contato" },
  { id: "opened", label: "Perfil aberto", description: "Perfis revisados antes da abordagem" },
  { id: "followup", label: "Em follow-up", description: "Mensagens enviadas e proximos passos" },
  { id: "replied", label: "Respondeu", description: "Conversas que pedem sua atencao" },
];

const ARCHIVED_COLUMN: KanbanColumnDefinition = {
  id: "archived",
  label: "Arquivados",
  description: "Pausados e opt-outs",
};

async function postAction(payload: Record<string, unknown>) {
  const response = await fetch("/api/prospecting/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json() as { ok?: boolean; error?: string };
  if (!response.ok || !body.ok) throw new Error(body.error ?? "Não foi possível registrar a ação.");
}

async function fetchQueue() {
  const response = await fetch("/api/prospecting", { cache: "no-store" });
  const body = await response.json() as { ok?: boolean; items?: QueueItem[]; error?: string };
  if (!response.ok || !body.ok) throw new Error(body.error ?? "Fila indisponível.");
  return body.items ?? [];
}

function leadName(item: QueueItem) {
  return item.deal?.company || item.deal?.name || item.channel.identity || "Lead";
}

function nextActionLabel(item: QueueItem) {
  return item.channel.nextActionAt
    ? new Date(item.channel.nextActionAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "Sem ação agendada";
}

function KanbanCard({ item, selected, onSelect }: {
  item: QueueItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={`ig-kanban-card${selected ? " selected" : ""}`}
      data-deal-id={item.channel.dealId}
      onClick={onSelect}
      type="button"
    >
      <span className="ig-kanban-card-topline">
        <span>@{item.channel.identity}</span>
        <span className={`ig-kanban-dot ${item.channel.status ?? "review"}`} />
      </span>
      <strong>{leadName(item)}</strong>
      <span className="ig-kanban-segment">{item.deal?.segment || "Instagram"}</span>
      <span className="ig-kanban-next">
        <small>Próxima ação</small>
        <span>{nextActionLabel(item)}</span>
      </span>
    </button>
  );
}

function KanbanColumn({ column, items, selectedDealId, onSelect }: {
  column: KanbanColumnDefinition;
  items: QueueItem[];
  selectedDealId: number | null;
  onSelect: (dealId: number) => void;
}) {
  return (
    <section className={`ig-kanban-column ${column.id}`}>
      <header>
        <div>
          <h3>{column.label}</h3>
          <p>{column.description}</p>
        </div>
        <strong>{items.length}</strong>
      </header>
      <div className="ig-kanban-stack">
        {items.map((item) => (
          <KanbanCard
            item={item}
            key={item.channel.dealId}
            onSelect={() => onSelect(item.channel.dealId)}
            selected={selectedDealId === item.channel.dealId}
          />
        ))}
        {!items.length ? <div className="ig-kanban-empty">Nenhum lead nesta etapa.</div> : null}
      </div>
    </section>
  );
}

function LeadPanel({ item, refresh, onClose }: {
  item: QueueItem;
  refresh: () => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(item.suggestedMessage);
  const [reply, setReply] = useState("");
  const [classification, setClassification] = useState("humana");
  const [scheduleAt, setScheduleAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const dealId = item.channel.dealId;

  async function act(payload: Record<string, unknown>, success: string) {
    setBusy(true);
    setNotice("");
    try {
      await postAction({ dealId, ...payload });
      setNotice(success);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao registrar a ação.");
    } finally {
      setBusy(false);
    }
  }

  function openProfile() {
    if (item.channel.profileUrl) window.open(item.channel.profileUrl, "_blank", "noopener,noreferrer");
    void act({ action: "open" }, "Perfil aberto. O lead continua selecionado na coluna Perfil aberto.");
  }

  async function copyDraft() {
    await navigator.clipboard.writeText(draft);
    setNotice("Mensagem copiada. Envie no Instagram e confirme abaixo somente depois do envio.");
  }

  function confirmSent() {
    if (!window.confirm("Você já enviou esta mensagem manualmente no Instagram?")) return;
    void act({ action: "confirm_sent", content: draft }, "Envio manual registrado e próximo follow-up calculado.");
  }

  function registerReply() {
    if (!reply.trim()) return;
    void act({ action: "register_reply", content: reply }, "Resposta registrada e classificada.");
  }

  return (
    <aside aria-label={`Painel do lead ${leadName(item)}`} className="ig-lead-panel">
      <header className="ig-lead-panel-head">
        <div>
          <span className="ig-queue-handle">@{item.channel.identity}</span>
          <h3>{leadName(item)}</h3>
          <p>{item.deal?.segment || "Instagram"} · Deal #{dealId}</p>
        </div>
        <button aria-label="Fechar painel do lead" onClick={onClose} type="button">×</button>
      </header>

      <div className="ig-lead-panel-status">
        <span className={`ig-status-pill ${item.channel.status ?? "review"}`}>{item.channel.status ?? "revisar"}</span>
        <div><small>Próxima ação</small><strong>{nextActionLabel(item)}</strong></div>
      </div>

      <label className="ig-compose">
        Mensagem sugerida
        <textarea onChange={(event) => setDraft(event.target.value)} rows={7} value={draft} />
      </label>
      <div className="ig-action-row">
        <button className="secondary" disabled={busy} onClick={openProfile} type="button">Abrir perfil</button>
        <button className="secondary" disabled={busy} onClick={copyDraft} type="button">Copiar mensagem</button>
        <button disabled={busy || !draft.trim()} onClick={confirmSent} type="button">Confirmar como enviada</button>
      </div>

      <details className="ig-reply-panel">
        <summary>Registrar resposta ou ajustar o lead</summary>
        <label>
          Resposta recebida
          <textarea onChange={(event) => setReply(event.target.value)} rows={3} value={reply} />
        </label>
        <div className="ig-action-row">
          <button disabled={busy || !reply.trim()} onClick={registerReply} type="button">Registrar resposta</button>
        </div>
        <div className="ig-classify-row">
          <select onChange={(event) => setClassification(event.target.value)} value={classification}>
            <option value="humana">Resposta humana</option>
            <option value="encaminhamento">Encaminhamento</option>
            <option value="objecao">Objeção</option>
            <option value="bot">Bot</option>
            <option value="perdido">Sem interesse</option>
          </select>
          <button className="secondary" disabled={busy} onClick={() => act({ action: "classify", responseType: classification }, "Classificação atualizada.")} type="button">Classificar</button>
          <button className="secondary" disabled={busy} onClick={() => act({ action: "pause", note: "Pausado pelo administrador" }, "Lead pausado.")} type="button">Pausar</button>
          <button className="danger" disabled={busy} onClick={() => window.confirm("Registrar opt-out e parar todos os follow-ups deste Instagram?") && void act({ action: "opt_out" }, "Opt-out registrado.")} type="button">Opt-out</button>
        </div>
        <div className="ig-schedule-row">
          <label>
            Agendar próxima ação
            <input onChange={(event) => setScheduleAt(event.target.value)} type="datetime-local" value={scheduleAt} />
          </label>
          <button className="secondary" disabled={busy || !scheduleAt} onClick={() => act({ action: "schedule", nextActionAt: new Date(scheduleAt).toISOString(), nextActionType: "followup_silencio", note: "Agendado pelo administrador" }, "Próxima ação agendada.")} type="button">Agendar</button>
        </div>
      </details>

      {notice ? <p className="ig-card-notice" role="status">{notice}</p> : null}
      {item.messages.length ? (
        <details className="ig-history">
          <summary>Histórico ({item.messages.length})</summary>
          {item.messages.slice(0, 5).map((message) => (
            <div key={message.id}><strong>{message.direction === "received" ? "Recebida" : message.direction === "sent" ? "Enviada" : "Rascunho"}</strong><span>{message.content}</span></div>
          ))}
        </details>
      ) : null}
    </aside>
  );
}

export function InstagramFollowups() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<number | null>();
  const boardRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchQueue());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Fila indisponível.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchQueue()
      .then((queue) => {
        if (active) {
          setItems(queue);
          setError("");
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Fila indisponível.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const fallbackItem = items.find((item) => (
    instagramKanbanColumnForStatus(item.channel.status) !== "archived"
  )) ?? items[0] ?? null;
  const selectedItem = selectedDealId === null
    ? null
    : items.find((item) => item.channel.dealId === selectedDealId) ?? fallbackItem;
  const effectiveSelectedDealId = selectedItem?.channel.dealId ?? null;
  const selectedColumn = selectedItem
    ? instagramKanbanColumnForStatus(selectedItem.channel.status)
    : null;

  useEffect(() => {
    if (effectiveSelectedDealId === null) return;
    const frame = window.requestAnimationFrame(() => {
      const board = boardRef.current;
      const card = board?.querySelector<HTMLElement>(`[data-deal-id="${effectiveSelectedDealId}"]`);
      if (!board || !card) return;

      const boardRect = board.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const horizontalDelta = cardRect.left < boardRect.left
        ? cardRect.left - boardRect.left - 12
        : cardRect.right > boardRect.right
          ? cardRect.right - boardRect.right + 12
          : 0;
      if (horizontalDelta) board.scrollBy({ behavior: "smooth", left: horizontalDelta });

      const stack = card.closest(".ig-kanban-stack") as HTMLElement | null;
      if (!stack) return;
      const stackRect = stack.getBoundingClientRect();
      const verticalDelta = cardRect.top < stackRect.top
        ? cardRect.top - stackRect.top - 8
        : cardRect.bottom > stackRect.bottom
          ? cardRect.bottom - stackRect.bottom + 8
          : 0;
      if (verticalDelta) stack.scrollBy({ behavior: "smooth", top: verticalDelta });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedColumn, effectiveSelectedDealId]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return items;
    return items.filter((item) => (
      `${leadName(item)} ${item.channel.identity ?? ""}`.toLocaleLowerCase("pt-BR").includes(term)
    ));
  }, [items, query]);

  const groupedItems = useMemo(() => {
    const groups: Record<InstagramKanbanColumn, QueueItem[]> = {
      to_contact: [], opened: [], followup: [], replied: [], archived: [],
    };
    for (const item of filteredItems) {
      groups[instagramKanbanColumnForStatus(item.channel.status)].push(item);
    }
    return groups;
  }, [filteredItems]);

  const archivedCount = items.filter((item) => (
    instagramKanbanColumnForStatus(item.channel.status) === "archived"
  )).length;
  const archiveVisible = showArchived || selectedColumn === "archived";
  const columns = archiveVisible ? [...ACTIVE_COLUMNS, ARCHIVED_COLUMN] : ACTIVE_COLUMNS;

  if (loading) return <div className="ig-empty">Carregando fila do Instagram...</div>;
  if (error) return <div className="ig-notice error">{error}</div>;

  return (
    <section className="ig-workspace">
      <div className="ig-workspace-intro">
        <div>
          <span className="ig-kicker">Operação manual assistida</span>
          <h2>Kanban de prospecção do Instagram</h2>
          <p>Selecione um card e opere pelo painel. Cada ação move o lead sem tirar você do contexto.</p>
        </div>
        <div className="ig-queue-count"><strong>{items.length}</strong><span>perfis na fila</span></div>
      </div>

      <div className="ig-kanban-toolbar">
        <label>
          <span>Buscar lead</span>
          <input
            aria-label="Buscar por clinica ou @"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por clínica ou @"
            type="search"
            value={query}
          />
        </label>
        <button className={archiveVisible ? "active" : ""} onClick={() => setShowArchived((value) => !value)} type="button">
          Arquivados <strong>{archivedCount}</strong>
        </button>
      </div>

      <div className={`ig-kanban-layout${selectedItem ? " has-panel" : ""}`}>
        <div className="ig-kanban-board" ref={boardRef}>
          {columns.map((column) => (
            <KanbanColumn
              column={column}
              items={groupedItems[column.id]}
              key={column.id}
              onSelect={setSelectedDealId}
              selectedDealId={effectiveSelectedDealId}
            />
          ))}
        </div>
        {selectedItem ? (
          <LeadPanel
            item={selectedItem}
            key={`${selectedItem.channel.dealId}-${selectedItem.suggestedMessage}`}
            onClose={() => setSelectedDealId(null)}
            refresh={load}
          />
        ) : (
          <div className="ig-lead-panel-empty">Selecione um card para abrir a copy e as ações.</div>
        )}
      </div>

      {!items.length ? <div className="ig-empty">A fila está vazia. Suba um achado revisado para iniciar a abordagem.</div> : null}
    </section>
  );
}
