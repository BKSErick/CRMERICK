import { NextRequest, NextResponse } from "next/server";
import { requireAiChatAdminSession } from "@/lib/aiChatAuth";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { normalizeContextScope, requireAgentId } from "@/lib/aiConversation";

export const runtime = "nodejs";

function errorResponse(error: unknown, status = 500) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro inesperado no historico de IA." }, { status });
}

function conversationId(value: unknown) {
  const id = String(value ?? "").trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

async function ownedConversation(id: string, email: string) {
  const supabase = getCrmSupabaseAdmin();
  const result = await supabase.from("ai_conversations").select("*").eq("id", id).eq("created_by", email).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

export async function GET(request: NextRequest) {
  const auth = await requireAiChatAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const id = conversationId(request.nextUrl.searchParams.get("id"));
    if (id) {
      const conversation = await ownedConversation(id, auth.session.email);
      if (!conversation) return errorResponse(new Error("Conversa nao encontrada."), 404);
      const maximumMessages = Math.max(20, Math.min(Number(process.env.AI_CHAT_MAX_MESSAGES) || 300, 1000));
      const messages = await supabase.from("ai_conversation_messages").select("*").eq("conversation_id", id).order("created_at", { ascending: true }).limit(maximumMessages);
      if (messages.error) throw messages.error;
      return NextResponse.json({ ok: true, conversation, messages: messages.data ?? [] });
    }
    const includeArchived = request.nextUrl.searchParams.get("archived") === "true";
    let query = supabase.from("ai_conversations").select("*").eq("created_by", auth.session.email).order("updated_at", { ascending: false }).limit(100);
    if (!includeArchived) query = query.is("archived_at", null);
    const result = await query;
    if (result.error) throw result.error;
    return NextResponse.json({ ok: true, conversations: result.data ?? [] });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  const auth = await requireAiChatAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const row = {
      created_by: auth.session.email,
      title: String(body?.title ?? "Nova conversa").trim().slice(0, 160) || "Nova conversa",
      default_agent_id: requireAgentId(body?.defaultAgentId ?? "crm-copilot"),
      context_scope: normalizeContextScope(body?.contextScope),
    };
    const result = await getCrmSupabaseAdmin().from("ai_conversations").insert(row).select("*").single();
    if (result.error) throw result.error;
    return NextResponse.json({ ok: true, conversation: result.data, messages: [] }, { status: 201 });
  } catch (error) { return errorResponse(error, 400); }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAiChatAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = conversationId(body?.id);
    if (!id || !(await ownedConversation(id, auth.session.email))) return errorResponse(new Error("Conversa nao encontrada."), 404);
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = String(body.title).trim().slice(0, 160) || "Nova conversa";
    if (body.defaultAgentId !== undefined) updates.default_agent_id = requireAgentId(body.defaultAgentId);
    if (body.contextScope !== undefined) updates.context_scope = normalizeContextScope(body.contextScope);
    if (body.archived !== undefined) updates.archived_at = body.archived ? new Date().toISOString() : null;
    if (Object.keys(updates).length === 0) throw new Error("Nenhuma alteracao valida informada.");
    updates.updated_at = new Date().toISOString();
    const result = await getCrmSupabaseAdmin().from("ai_conversations").update(updates).eq("id", id).eq("created_by", auth.session.email).select("*").single();
    if (result.error) throw result.error;
    return NextResponse.json({ ok: true, conversation: result.data });
  } catch (error) { return errorResponse(error, 400); }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAiChatAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const id = conversationId(request.nextUrl.searchParams.get("id"));
    if (!id) throw new Error("id da conversa e obrigatorio.");
    const result = await getCrmSupabaseAdmin().from("ai_conversations").delete().eq("id", id).eq("created_by", auth.session.email).select("id").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return errorResponse(new Error("Conversa nao encontrada."), 404);
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error, 400); }
}
