"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AiAgentId, AiAgentPublic } from "@/lib/aiAgentRegistry";
import { collapseRetryMessages } from "@/lib/aiMessageHistory";
import AgentPicker from "./AgentPicker";

type ScopeType = "all" | "deal" | "reports" | "integrations" | "content";
type Conversation = { id: string; title: string; default_agent_id: AiAgentId; context_scope: { type: ScopeType; dealId?: number }; archived_at?: string | null; updated_at: string };
type ChatMessage = { id: string; role: "user" | "assistant"; status: "pending" | "complete" | "failed"; agent_id?: AiAgentId; content: string; citations?: Array<{ sourceId: string; label: string; asOf: string; links?: Array<{ label: string; href: string }> }>; error?: string | null };

const scopes: Array<{ value: ScopeType; label: string }> = [
  { value: "all", label: "CRM inteiro" }, { value: "deal", label: "Deal especifico" },
  { value: "reports", label: "Relatorios" }, { value: "integrations", label: "Integracoes" },
  { value: "content", label: "Conteudo e marca" },
];

async function jsonFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Falha ao comunicar com o chat.");
  return data;
}

export default function AgentChatWorkspace({ agents }: { agents: AiAgentPublic[] }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [agentId, setAgentId] = useState<AiAgentId>("crm-copilot");
  const [scopeType, setScopeType] = useState<ScopeType>("all");
  const [dealId, setDealId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadList = useCallback(async () => {
    try { const data = await jsonFetch(`/api/ai/conversations?archived=${showArchived}`); setConversations(data.conversations); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao carregar conversas."); }
  }, [showArchived]);

  useEffect(() => {
    let ignore = false;
    void jsonFetch(`/api/ai/conversations?archived=${showArchived}`)
      .then((data) => { if (!ignore) setConversations(data.conversations); })
      .catch((reason) => { if (!ignore) setError(reason instanceof Error ? reason.message : "Falha ao carregar conversas."); });
    return () => { ignore = true; };
  }, [showArchived]);

  async function openConversation(conversation: Conversation) {
    setLoading(true); setError("");
    try {
      const data = await jsonFetch(`/api/ai/conversations?id=${conversation.id}`);
      setActive(data.conversation); setMessages(data.messages); setAgentId(data.conversation.default_agent_id);
      setScopeType(data.conversation.context_scope?.type ?? "all"); setDealId(String(data.conversation.context_scope?.dealId ?? ""));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao abrir conversa."); }
    finally { setLoading(false); }
  }

  async function newConversation() {
    setLoading(true); setError("");
    try {
      const contextScope = scopeType === "deal" ? { type: scopeType, dealId: Number(dealId) } : { type: scopeType };
      const data = await jsonFetch("/api/ai/conversations", { method: "POST", body: JSON.stringify({ defaultAgentId: agentId, contextScope }) });
      await loadList(); await openConversation(data.conversation);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao criar conversa."); }
    finally { setLoading(false); }
  }

  async function updateConversation(patch: Record<string, unknown>) {
    if (!active) return;
    try { const data = await jsonFetch("/api/ai/conversations", { method: "PATCH", body: JSON.stringify({ id: active.id, ...patch }) }); setActive(data.conversation); await loadList(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao atualizar conversa."); }
  }

  async function removeConversation() {
    if (!active || !window.confirm("Excluir esta conversa e todo o historico?")) return;
    try { await jsonFetch(`/api/ai/conversations?id=${active.id}`, { method: "DELETE" }); setActive(null); setMessages([]); await loadList(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao excluir conversa."); }
  }

  const sendMessage = useCallback(async (retryText?: string) => {
    const text = (retryText ?? draft).trim();
    if (!text || loading) return;
    if (scopeType === "deal" && (!Number.isInteger(Number(dealId)) || Number(dealId) <= 0)) { setError("Informe o ID numerico do deal."); return; }
    let conversation = active;
    setLoading(true); setError("");
    try {
      if (!conversation) {
        const contextScope = scopeType === "deal" ? { type: scopeType, dealId: Number(dealId) } : { type: scopeType };
        const created = await jsonFetch("/api/ai/conversations", { method: "POST", body: JSON.stringify({ defaultAgentId: agentId, contextScope }) });
        conversation = created.conversation; setActive(conversation);
      }
      if (!conversation) throw new Error("Nao foi possivel iniciar a conversa.");
      setDraft(""); setMessages((current) => [...current, { id: `local-${Date.now()}`, role: "user", status: "complete", content: text }, { id: `pending-${Date.now()}`, role: "assistant", status: "pending", agent_id: agentId, content: "" }]);
      abortRef.current = new AbortController();
      const contextScope = scopeType === "deal" ? { type: scopeType, dealId: Number(dealId) } : { type: scopeType };
      await jsonFetch("/api/ai/chat", { method: "POST", signal: abortRef.current.signal, body: JSON.stringify({ conversationId: conversation.id, message: text, contextScope }) });
      const refreshed = await jsonFetch(`/api/ai/conversations?id=${conversation.id}`); setMessages(refreshed.messages); setActive(refreshed.conversation); await loadList();
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") setError("Resposta cancelada.");
      else setError(reason instanceof Error ? reason.message : "Falha ao responder.");
      if (conversation) { try { const refreshed = await jsonFetch(`/api/ai/conversations?id=${conversation.id}`); setMessages(refreshed.messages); } catch {} }
    } finally { setLoading(false); abortRef.current = null; }
  }, [active, agentId, dealId, draft, loadList, loading, scopeType]);

  const selectedAgent = agents.find((agent) => agent.id === agentId) ?? agents[0];
  const lastUserText = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const visibleMessages = collapseRetryMessages(messages);

  return (
    <section className="agent-chat-shell" aria-label="Chat contextual do CRM">
      <div className="agent-chat-layout">
        <aside className="agent-chat-sidebar">
          <button type="button" className="primary-button" onClick={() => void newConversation()}>+ Nova conversa</button>
          <label className="agent-archive-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Ver arquivadas</label>
          <nav aria-label="Historico de conversas">
            {conversations.map((conversation) => <button type="button" key={conversation.id} className={conversation.id === active?.id ? "active" : ""} onClick={() => void openConversation(conversation)}><strong>{conversation.title}</strong><small>{new Date(conversation.updated_at).toLocaleDateString("pt-BR")}</small></button>)}
          </nav>
        </aside>
        <div className="agent-chat-main">
          <header className="agent-chat-toolbar">
            <AgentPicker agents={agents} selectedId={agentId} onSelect={(id) => { setAgentId(id); if (active) void updateConversation({ defaultAgentId: id }); }} />
            <select aria-label="Escopo do contexto" value={scopeType} onChange={(event) => setScopeType(event.target.value as ScopeType)}>{scopes.map((scope) => <option key={scope.value} value={scope.value}>{scope.label}</option>)}</select>
            {scopeType === "deal" ? <input aria-label="ID do deal" inputMode="numeric" value={dealId} onChange={(event) => setDealId(event.target.value.replace(/\D/g, ""))} placeholder="ID do deal" /> : null}
            {active ? <div className="agent-chat-actions"><button type="button" onClick={() => { const title = window.prompt("Novo titulo", active.title); if (title) void updateConversation({ title }); }}>Renomear</button><button type="button" onClick={() => void updateConversation({ archived: !active.archived_at })}>{active.archived_at ? "Reabrir" : "Arquivar"}</button><button type="button" onClick={() => void removeConversation()}>Excluir</button></div> : null}
          </header>
          <div className="agent-chat-disclosure"><strong>{selectedAgent?.name}</strong> · {selectedAgent?.disclosure} · Respostas sao consultivas e somente leitura.</div>
          <div className="agent-chat-messages" aria-live="polite">
            {visibleMessages.length === 0 ? <div className="agent-chat-empty"><h3>Converse com todo o seu CRM</h3><p>Use um especialista, escolha o escopo e faca uma pergunta. Atalhos como <code>@copy</code>, <code>@willian</code>, <code>@finch</code> e <code>@hormozi</code> trocam apenas a proxima resposta.</p><div>{selectedAgent?.suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => setDraft(suggestion)}>{suggestion}</button>)}</div></div> : null}
            {visibleMessages.map((message) => { const messageAgent = agents.find((agent) => agent.id === message.agent_id); return <article key={message.id} className={`agent-chat-message ${message.role} ${message.status}`}><header>{message.role === "user" ? "Voce" : messageAgent?.name ?? "Especialista"}{messageAgent ? ` · DNA v${messageAgent.version}` : ""}{message.status === "pending" ? " · analisando..." : ""}</header><div>{message.content || (message.status === "pending" ? "Consultando fontes seguras do CRM..." : "Resposta indisponivel.")}</div>{message.citations?.length ? <details><summary>Fontes usadas ({message.citations.length})</summary>{message.citations.map((citation) => <p key={`${message.id}-${citation.sourceId}`}><strong>[{citation.sourceId}]</strong> {citation.label} · {new Date(citation.asOf).toLocaleString("pt-BR")}{citation.links?.map((link) => <a key={link.href} href={link.href}> {link.label}</a>)}</p>)}</details> : null}{message.status === "failed" ? <button type="button" onClick={() => void sendMessage(lastUserText)}>Tentar novamente</button> : null}</article>; })}
          </div>
          {error ? <div className="agent-chat-error" role="alert">{error}</div> : null}
          <form className="agent-chat-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
            <textarea aria-label="Mensagem para o especialista" value={draft} onChange={(event) => { const value = event.target.value; setDraft(value); if (/(^|\s)@$/.test(value)) window.dispatchEvent(new Event("ai-agent-picker")); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder={`Pergunte ao ${selectedAgent?.name ?? "especialista"} ou comece com @atalho`} rows={3} />
            <div><span>Enter envia · Shift+Enter quebra linha</span>{loading ? <button type="button" onClick={() => abortRef.current?.abort()}>Cancelar</button> : <button type="submit">Enviar</button>}</div>
          </form>
        </div>
      </div>
    </section>
  );
}
