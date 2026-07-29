import { after, NextRequest, NextResponse } from "next/server";

import { aiComplete } from "@/lib/aiComplete";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import {
  isValidWebhookSecret,
  isValidWebhookSecretHash,
  normalizeUazapiWebhook,
  type UazapiMessage,
} from "@/lib/uazapiWebhook";

export const runtime = "nodejs";
export const maxDuration = 30;

type SupabaseAdmin = ReturnType<typeof getCrmSupabaseAdmin>;
type ContactRef = { id: number; name: string | null; company: string | null };
type DealRef = { id: number; name: string | null; company: string | null };

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function fallbackContactName(message: UazapiMessage) {
  if (message.direction === "received" && message.senderName) return message.senderName;
  return `WhatsApp ${message.contactPhone.slice(-4)}`;
}

async function findOrCreateContact(supabase: SupabaseAdmin, message: UazapiMessage) {
  const phone = message.contactPhone;
  const lookup = await supabase
    .from("contacts")
    .select("id, name, company")
    .or(`phone.eq.${phone},whatsapp.eq.${phone}`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookup.error) throw lookup.error;
  if (lookup.data) return lookup.data as ContactRef;

  const name = fallbackContactName(message);
  const created = await supabase
    .from("contacts")
    .insert({
      name,
      phone,
      whatsapp: phone,
      status: "lead",
      notes: "Contato capturado pelo webhook de WhatsApp (Uazapi).",
    })
    .select("id, name, company")
    .single();

  if (created.error) throw created.error;
  return created.data as ContactRef;
}

async function findOrCreateDeal(
  supabase: SupabaseAdmin,
  contact: ContactRef,
  message: UazapiMessage,
) {
  const linked = await supabase
    .from("deals")
    .select("id, name, company")
    .eq("contact_id", contact.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (linked.error) throw linked.error;
  if (linked.data) return linked.data as DealRef;

  const phone = message.contactPhone;
  const byPhone = await supabase
    .from("deals")
    .select("id, name, company")
    .or(`phone.eq.${phone},whatsapp.eq.${phone}`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byPhone.error) throw byPhone.error;
  if (byPhone.data) {
    const existing = byPhone.data as DealRef;
    await supabase.from("deals").update({ contact_id: contact.id }).eq("id", existing.id);
    return existing;
  }

  const name = contact.name || fallbackContactName(message);
  const created = await supabase
    .from("deals")
    .insert({
      name,
      company: contact.company || name,
      stage: "prospect",
      status: "open",
      phone,
      whatsapp: phone,
      contact_id: contact.id,
      origin: "whatsapp",
      origin_detail: "uazapi",
    })
    .select("id, name, company")
    .single();

  if (created.error) throw created.error;
  return created.data as DealRef;
}

function activityDescription(message: UazapiMessage) {
  const label = message.direction === "sent" ? "WhatsApp enviado" : "WhatsApp recebido";
  const content = message.content.replace(/\s+/g, " ").slice(0, 500);
  return `${label}: ${content}`;
}

async function enrichWithAi(
  supabase: SupabaseAdmin,
  messageRowId: number,
  deal: DealRef,
) {
  try {
    const historyResult = await supabase
      .from("messages")
      .select("direction, content, occurred_at")
      .eq("deal_id", deal.id)
      .eq("provider", "uazapi")
      .order("occurred_at", { ascending: false })
      .limit(10);
    if (historyResult.error) throw historyResult.error;

    const history = (historyResult.data ?? [])
      .reverse()
      .map((item) => `${item.direction === "sent" ? "Erick" : "Lead"}: ${item.content}`)
      .join("\n");
    if (!history.trim()) return;

    const result = await aiComplete(
      [
        "Voce apenas analisa uma conversa comercial para alimentar um CRM.",
        "Nunca responda ao lead e nunca invente informacoes.",
        "Retorne em portugues, em no maximo 4 linhas: resumo, intencao, objecao (se houver) e proximo passo sugerido.",
      ].join(" "),
      `Deal: ${deal.company || deal.name || deal.id}\n\nConversa recente:\n${history}`,
    );
    if (!result) return;

    const insight = result.content.slice(0, 1500);
    const update = await supabase
      .from("messages")
      .update({
        ai_insight: insight,
        ai_provider: result.provider,
        ai_model: result.model,
        ai_processed_at: new Date().toISOString(),
      })
      .eq("id", messageRowId);
    if (update.error) throw update.error;

    const activity = await supabase.from("activities").insert({
      deal_id: deal.id,
      type: "whatsapp_ai_insight",
      description: `Leitura da IA:\n${insight}`,
    });
    if (activity.error) throw activity.error;
  } catch (error) {
    console.error("Falha best-effort ao enriquecer mensagem de WhatsApp:", error);
  }
}

export async function POST(request: NextRequest) {
  const supabase = getCrmSupabaseAdmin();
  const providedSecret = request.nextUrl.searchParams.get("secret");
  let authorized = isValidWebhookSecret(
    providedSecret,
    process.env.UAZAPI_WEBHOOK_SECRET,
  );
  if (!authorized && !process.env.UAZAPI_WEBHOOK_SECRET) {
    const setting = await supabase
      .from("integration_settings")
      .select("webhook_secret_hash")
      .eq("provider", "uazapi")
      .maybeSingle();
    if (setting.error) {
      console.error("Falha ao carregar autenticacao da Uazapi:", setting.error);
      return jsonError("Autenticacao do webhook indisponivel.", 503);
    }
    authorized = isValidWebhookSecretHash(
      providedSecret,
      setting.data?.webhook_secret_hash,
    );
  }
  if (!authorized) {
    return jsonError("Webhook nao autorizado.", 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("JSON invalido.", 400);
  }

  const normalized = normalizeUazapiWebhook(payload);
  if (normalized.kind === "ignored") {
    return NextResponse.json({ ok: true, ignored: true, reason: normalized.reason });
  }

  try {
    const message = normalized.message;
    const duplicate = await supabase
      .from("messages")
      .select("id")
      .eq("provider", message.provider)
      .eq("provider_message_id", message.providerMessageId)
      .maybeSingle();
    if (duplicate.error) throw duplicate.error;
    if (duplicate.data) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    const contact = await findOrCreateContact(supabase, message);
    const deal = await findOrCreateDeal(supabase, contact, message);

    const inserted = await supabase
      .from("messages")
      .insert({
        deal_id: deal.id,
        contact_id: contact.id,
        channel: "whatsapp",
        content: message.content,
        status: message.direction === "sent" ? "sent" : "received",
        sent_at: message.direction === "sent" ? message.occurredAt : null,
        provider: message.provider,
        provider_message_id: message.providerMessageId,
        provider_instance_id: message.instanceId || null,
        chat_id: message.chatId,
        direction: message.direction,
        sender_phone: message.contactPhone,
        sender_name: message.senderName || null,
        message_type: message.messageType,
        occurred_at: message.occurredAt,
      })
      .select("id")
      .single();

    if (inserted.error?.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    if (inserted.error) throw inserted.error;

    const activity = await supabase.from("activities").insert({
      deal_id: deal.id,
      contact_id: contact.id,
      type: message.direction === "sent" ? "whatsapp_sent_sync" : "whatsapp_received",
      description: activityDescription(message),
    });
    if (activity.error) throw activity.error;

    if (message.direction === "received" && !message.content.startsWith("[")) {
      after(() => enrichWithAi(supabase, Number(inserted.data.id), deal));
    }

    return NextResponse.json(
      {
        ok: true,
        messageId: inserted.data.id,
        contactId: contact.id,
        dealId: deal.id,
        direction: message.direction,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Falha ao ingerir webhook da Uazapi:", error);
    return jsonError(
      error instanceof Error ? error.message : "Falha ao ingerir mensagem.",
      500,
    );
  }
}
