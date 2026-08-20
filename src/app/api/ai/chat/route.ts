import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireAiChatAdminSession } from "@/lib/aiChatAuth";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { aiComplete } from "@/lib/aiComplete";
import { loadAiContext } from "@/lib/aiContextBroker";
import { assertReadOnlyChatPayload, composeChatPrompts, normalizeContextScope, parseAgentMention, requireAgentId, truncateContextEnvelopes } from "@/lib/aiConversation";
import { AI_AGENT_PERSONAS } from "@/server/aiAgentPersonas.generated.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;

function responseError(error: unknown, status = 500) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha inesperada no chat de IA." }, { status });
}

export async function POST(request: NextRequest) {
  const auth = await requireAiChatAdminSession(request);
  if (!auth.ok) return auth.response;
  if (process.env.AI_AGENTS_CHAT_ENABLED !== "true") return responseError(new Error("Chat de IA temporariamente desabilitado."), 503);

  const supabase = getCrmSupabaseAdmin();
  let assistantMessageId: string | null = null;
  const startedAt = Date.now();
  try {
    const body = await request.json();
    const message = assertReadOnlyChatPayload(body);
    const conversationId = String(body?.conversationId ?? "");
    const conversationResult = await supabase.from("ai_conversations").select("*").eq("id", conversationId).eq("created_by", auth.session.email).maybeSingle();
    if (conversationResult.error) throw conversationResult.error;
    if (!conversationResult.data) return responseError(new Error("Conversa nao encontrada."), 404);
    const conversation = conversationResult.data;
    const defaultAgentId = requireAgentId(conversation.default_agent_id);
    const mention = parseAgentMention(message, defaultAgentId);
    if (!mention.message) throw new Error("Escreva uma pergunta depois do atalho do especialista.");
    const scope = normalizeContextScope(body?.contextScope ?? conversation.context_scope);
    const persona = AI_AGENT_PERSONAS.find((item) => item.id === mention.agentId);
    if (!persona) throw new Error("DNA do especialista indisponivel.");

    const context = await loadAiContext(supabase, scope);
    const maximum = Math.max(1000, Math.min(Number(process.env.AI_CHAT_MAX_CONTEXT_CHARS) || 18000, 50000));
    const minimized = truncateContextEnvelopes(context, maximum);
    const prompts = composeChatPrompts({ persona, scope, sources: minimized.sources, question: mention.message });
    const citations = minimized.sources.map((source) => ({ sourceId: source.sourceId, label: source.label, asOf: source.asOf, links: source.links }));
    const contextManifest = minimized.sources.map((source) => ({ sourceId: source.sourceId, asOf: source.asOf, limitations: source.limitations, factCount: source.facts.length }));

    const userInsert = await supabase.from("ai_conversation_messages").insert({ conversation_id: conversationId, role: "user", status: "complete", agent_id: mention.agentId, content: message }).select("*").single();
    if (userInsert.error) throw userInsert.error;
    const pending = await supabase.from("ai_conversation_messages").insert({ conversation_id: conversationId, role: "assistant", status: "pending", agent_id: mention.agentId, content: "", citations, context_manifest: contextManifest, prompt_version: persona.promptVersion, source_hash: persona.sourceHash }).select("*").single();
    if (pending.error) throw pending.error;
    assistantMessageId = pending.data.id;

    const result = await aiComplete(prompts.systemPrompt, prompts.userPrompt, { signal: request.signal, timeoutMs: Math.max(5000, Math.min(Number(process.env.AI_CHAT_TIMEOUT_MS) || 45000, 55000)) });
    if (!result) throw new Error("Nenhum provedor de IA configurado ou disponivel. Configure OPENROUTER_API_KEY ou GROQ_API_KEY e tente novamente.");
    const completed = await supabase.from("ai_conversation_messages").update({ status: "complete", content: result.content, provider: result.provider, model: result.model, latency_ms: Date.now() - startedAt, error: null }).eq("id", assistantMessageId).select("*").single();
    if (completed.error) throw completed.error;
    await supabase.from("ai_conversations").update({ context_scope: scope, updated_at: new Date().toISOString() }).eq("id", conversationId).eq("created_by", auth.session.email);
    return NextResponse.json({ ok: true, userMessage: userInsert.data, message: completed.data, agent: { id: persona.id, name: persona.name, alias: persona.alias, disclosure: persona.type === "clone" ? "Resposta gerada por um clone de IA, nao pela pessoa real." : persona.specialty }, overridden: mention.overridden, contextTruncated: minimized.truncated });
  } catch (error) {
    if (assistantMessageId) {
      const raw = error instanceof Error ? error.message : "Falha inesperada.";
      const safeError = raw.slice(0, 500);
      await supabase.from("ai_conversation_messages").update({ status: "failed", content: "Nao consegui concluir esta resposta.", error: safeError, latency_ms: Date.now() - startedAt }).eq("id", assistantMessageId);
    }
    const fingerprint = createHash("sha256").update(error instanceof Error ? error.message : String(error)).digest("hex").slice(0, 12);
    console.error("[ai-chat] failure", { fingerprint, assistantMessageId });
    return responseError(new Error(`Nao foi possivel concluir a resposta. Tente novamente. Referencia: ${fingerprint}`), 502);
  }
}
