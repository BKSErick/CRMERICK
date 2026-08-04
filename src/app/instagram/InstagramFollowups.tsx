"use client";

import { useCallback, useEffect, useState } from "react";

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
  messages: Array<{ id: number; content: string; direction: string; occurred_at?: string | null }>;
  suggestedMessage: string;
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

function QueueCard({ item, refresh }: { item: QueueItem; refresh: () => Promise<void> }) {
  const [draft, setDraft] = useState(item.suggestedMessage);
  const [reply, setReply] = useState("");
  const [classification, setClassification] = useState("humana");
  const [scheduleAt, setScheduleAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const dealId = item.channel.dealId;
  const name = item.deal?.company || item.deal?.name || item.channel.identity || "Lead";

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
    void act({ action: "open" }, "Abertura registrada. Isso ainda não conta como mensagem enviada.");
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

  const nextAction = item.channel.nextActionAt
    ? new Date(item.channel.nextActionAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "Sem ação agendada";

  return (
    <article className="ig-queue-card">
      <header>
        <div>
          <span className="ig-queue-handle">@{item.channel.identity}</span>
          <h3>{name}</h3>
        </div>
        <span className={`ig-status-pill ${item.channel.status ?? "review"}`}>{item.channel.status ?? "revisar"}</span>
      </header>

      <div className="ig-next-action">
        <span>Próxima ação</span>
        <strong>{nextAction}</strong>
        <small>{item.channel.nextActionNote || "Revise o perfil e faça o primeiro contato manualmente."}</small>
      </div>

      <label className="ig-compose">
        Mensagem sugerida
        <textarea onChange={(event) => setDraft(event.target.value)} rows={5} value={draft} />
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
    </article>
  );
}

export function InstagramFollowups() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  if (loading) return <div className="ig-empty">Carregando fila do Instagram...</div>;
  if (error) return <div className="ig-notice error">{error}</div>;

  return (
    <section className="ig-workspace">
      <div className="ig-workspace-intro">
        <div>
          <span className="ig-kicker">Operação manual assistida</span>
          <h2>Leads e follow-ups do Instagram</h2>
          <p>O CRM prepara a mensagem e controla a cadência. Você envia no Instagram e confirma o registro.</p>
        </div>
        <div className="ig-queue-count"><strong>{items.length}</strong><span>perfis na fila</span></div>
      </div>
      <div className="ig-queue-grid">
        {items.map((item) => <QueueCard item={item} key={`${item.channel.dealId}-${item.suggestedMessage}`} refresh={load} />)}
      </div>
      {!items.length ? <div className="ig-empty">A fila está vazia. Suba um achado revisado para iniciar a abordagem.</div> : null}
    </section>
  );
}
