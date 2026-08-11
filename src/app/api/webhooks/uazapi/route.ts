import { after, NextRequest, NextResponse } from "next/server";

import { aiComplete } from "@/lib/aiComplete";
import { processCommercialEventBestEffort } from "@/lib/commercialAutomationService.mjs";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import {
  classifyInboundResponse,
  extrairContatoIndicado,
  nextActionAfterInbound,
  nextActionAfterOutbound,
  type ResponseType,
} from "@/lib/followup";
import { phoneMatchVariants } from "@/lib/whatsappPhone";
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
type DealRef = {
  id: number;
  name: string | null;
  company: string | null;
  response_type: ResponseType | null;
  response_type_source: "automatic" | "manual" | null;
  next_action_at: string | null;
  next_action_source: "automatic" | "manual" | null;
  last_outbound_at: string | null;
};

const dealOperationalSelect =
  "id, name, company, response_type, response_type_source, next_action_at, next_action_source, last_outbound_at";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function fallbackContactName(message: UazapiMessage) {
  if (message.direction === "received" && message.senderName) return message.senderName;
  return `WhatsApp ${message.contactPhone.slice(-4)}`;
}

async function findOrCreateContact(supabase: SupabaseAdmin, message: UazapiMessage) {
  const phone = message.contactPhone;
  const variants = phoneMatchVariants(phone);
  const [byPhone, byWhatsapp] = await Promise.all([
    supabase.from("contacts").select("id, name, company").in("phone", variants).limit(3),
    supabase.from("contacts").select("id, name, company").in("whatsapp", variants).limit(3),
  ]);
  if (byPhone.error) throw byPhone.error;
  if (byWhatsapp.error) throw byWhatsapp.error;
  const matches = [...(byPhone.data ?? []), ...(byWhatsapp.data ?? [])].filter(
    (candidate, index, all) => all.findIndex((item) => item.id === candidate.id) === index,
  );
  if (matches.length > 1) {
    throw new Error(`Correspondencia ambigua de telefone para ${phone}.`);
  }
  if (matches[0]) return matches[0] as ContactRef;

  // A busca acima compara digitos com o valor GRAVADO, e a base guarda telefone
  // formatado ("(31) 97118-8838"). Sem esta varredura o webhook nunca casava e criava
  // card fantasma a cada resposta (aconteceu com Pressmix, Manuttech e HM Usinagem).
  const alvo = phone.replace(/\D/g, "").replace(/^55/, "").slice(-8);
  if (alvo.length === 8) {
    const todos = await supabase.from("contacts").select("id, name, company, phone, whatsapp");
    if (todos.error) throw todos.error;
    const porSufixo = (todos.data ?? []).filter((c) => {
      const campos = [c.phone, c.whatsapp].filter(Boolean).join(" ");
      return (campos.match(/\d{8,}/g) ?? []).some((n) => n.replace(/^55/, "").slice(-8) === alvo);
    });
    if (porSufixo.length === 1) {
      const { id, name, company } = porSufixo[0];
      return { id, name, company } as ContactRef;
    }
  }

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
    .select(dealOperationalSelect)
    .eq("contact_id", contact.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (linked.error) throw linked.error;
  if (linked.data) return linked.data as DealRef;

  const phone = message.contactPhone;
  const variants = phoneMatchVariants(phone);
  const [byPhone, byWhatsapp] = await Promise.all([
    supabase.from("deals").select(dealOperationalSelect).in("phone", variants).limit(3),
    supabase.from("deals").select(dealOperationalSelect).in("whatsapp", variants).limit(3),
  ]);
  if (byPhone.error) throw byPhone.error;
  if (byWhatsapp.error) throw byWhatsapp.error;
  const matches = [...(byPhone.data ?? []), ...(byWhatsapp.data ?? [])].filter(
    (candidate, index, all) => all.findIndex((item) => item.id === candidate.id) === index,
  );
  if (matches.length > 1) {
    throw new Error(`Correspondencia ambigua de deal para ${phone}.`);
  }
  if (matches[0]) {
    const existing = matches[0] as DealRef;
    await supabase.from("deals").update({ contact_id: contact.id }).eq("id", existing.id);
    return existing;
  }

  // Mesma varredura por sufixo que findOrCreateContact ja fazia. O deal nao tinha,
  // entao deal com telefone nulo ou formatado ("(11) 99961-0509") nunca casava e
  // virava card novo a cada resposta. Aconteceu com RC Performance e ATFM.
  const sufixo = phone.replace(/\D/g, "").replace(/^55/, "").slice(-8);
  if (sufixo.length === 8) {
    const todos = await supabase.from("deals").select(`${dealOperationalSelect}, phone, whatsapp`);
    if (todos.error) throw todos.error;
    const porSufixo = (todos.data ?? []).filter((d) => {
      const campos = [d.phone, d.whatsapp].filter(Boolean).join(" ");
      return (campos.match(/\d{8,}/g) ?? []).some((n) => n.replace(/^55/, "").slice(-8) === sufixo);
    });
    if (porSufixo.length === 1) {
      const existing = porSufixo[0] as DealRef;
      await supabase.from("deals").update({ contact_id: contact.id }).eq("id", existing.id);
      return existing;
    }
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
    .select(dealOperationalSelect)
    .single();

  if (created.error) throw created.error;
  return created.data as DealRef;
}

function activityDescription(message: UazapiMessage) {
  const label = message.direction === "sent" ? "WhatsApp enviado" : "WhatsApp recebido";
  const content = message.content.replace(/\s+/g, " ").slice(0, 500);
  return `${label}: ${content}`;
}

// Sem isto a falha some. Mensagem sem ai_insight ficava indistinguivel de mensagem que
// nem chegou a ser tentada, e nao havia como reprocessar com criterio depois.
async function registrarFalhaAi(
  supabase: SupabaseAdmin,
  messageRowId: number,
  motivo: string,
) {
  try {
    const atual = await supabase
      .from("messages")
      .select("ai_attempts")
      .eq("id", messageRowId)
      .maybeSingle();
    await supabase
      .from("messages")
      .update({
        ai_error: motivo.slice(0, 500),
        ai_attempts: (atual.data?.ai_attempts ?? 0) + 1,
        ai_last_attempt_at: new Date().toISOString(),
      })
      .eq("id", messageRowId);
  } catch (error) {
    console.error("Falha ao registrar erro da leitura de IA:", error);
  }
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
    if (!history.trim()) {
      await registrarFalhaAi(supabase, messageRowId, "Sem historico de conversa para resumir.");
      return;
    }

    const result = await aiComplete(
      [
        "Voce apenas analisa uma conversa comercial para alimentar um CRM.",
        "Nunca responda ao lead e nunca invente informacoes.",
        "Retorne em portugues, em no maximo 4 linhas: resumo, intencao, objecao (se houver) e proximo passo sugerido.",
      ].join(" "),
      `Deal: ${deal.company || deal.name || deal.id}\n\nConversa recente:\n${history}`,
    );
    if (!result) {
      // Caminho mais comum das 38 falhas de 29/07 e 07/08: aiComplete devolve null
      // quando o provider esta fora ou sem chave, e antes isso sumia em silencio.
      await registrarFalhaAi(supabase, messageRowId, "aiComplete retornou vazio (provider indisponivel ou sem chave).");
      return;
    }

    const insight = result.content.slice(0, 1500);
    const update = await supabase
      .from("messages")
      .update({
        ai_insight: insight,
        ai_provider: result.provider,
        ai_model: result.model,
        ai_processed_at: new Date().toISOString(),
        ai_error: null,
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
    await registrarFalhaAi(
      supabase,
      messageRowId,
      error instanceof Error ? error.message : String(error),
    );
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

    if (message.direction === "received") {
      const indicatedContact = extrairContatoIndicado(message.content, deal.company);
      const detectedResponseType = indicatedContact
        ? "encaminhamento"
        : classifyInboundResponse(message.content);
      const responseType =
        deal.response_type_source === "manual"
          ? (deal.response_type ?? detectedResponseType)
          : detectedResponseType;
      const plan = nextActionAfterInbound(responseType, message.occurredAt);
      const responseMinutes =
        deal.last_outbound_at &&
        new Date(message.occurredAt).getTime() >= new Date(deal.last_outbound_at).getTime()
          ? Math.round(
              (new Date(message.occurredAt).getTime() -
                new Date(deal.last_outbound_at).getTime()) /
                60000,
            )
          : null;
      const operationalUpdate: Record<string, unknown> = {
        last_inbound_at: message.occurredAt,
        response_time_minutes: responseMinutes,
      };
      if (indicatedContact) {
        operationalUpdate.referred_name = indicatedContact.nome;
        operationalUpdate.referred_phone = indicatedContact.telefone;
        operationalUpdate.referred_by = message.senderName || contact.name;
        operationalUpdate.referred_at = message.occurredAt;
      }
      if (deal.response_type_source !== "manual") {
        operationalUpdate.response_type = responseType;
        operationalUpdate.response_type_source = "automatic";
      }
      const updated = await supabase.from("deals").update(operationalUpdate).eq("id", deal.id);
      if (updated.error) throw updated.error;
      await processCommercialEventBestEffort(supabase, {
        id: `uazapi:${message.provider}:${message.providerMessageId}:received`,
        type: "message.received",
        dealId: deal.id,
        occurredAt: message.occurredAt,
        source: "webhook/uazapi",
        payload: {
          messageId: inserted.data.id,
          responseType,
          suggestedTask: {
            at: plan.at,
            type: indicatedContact ? "contactar_responsavel" : plan.type,
            note: plan.note,
          },
        },
      }, { apply: true });
    } else {
      const outboundCount = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("deal_id", deal.id)
        .eq("direction", "sent");
      if (outboundCount.error) throw outboundCount.error;
      const plan = nextActionAfterOutbound({
        responseType: deal.response_type === "bot" ? "bot" : "sem_resposta",
        occurredAt: message.occurredAt,
        outboundCount: outboundCount.count ?? 1,
      });
      const operationalUpdate: Record<string, unknown> = {
        last_outbound_at: message.occurredAt,
      };
      const updated = await supabase.from("deals").update(operationalUpdate).eq("id", deal.id);
      if (updated.error) throw updated.error;
      await processCommercialEventBestEffort(supabase, {
        id: `uazapi:${message.provider}:${message.providerMessageId}:sent`,
        type: "message.sent",
        dealId: deal.id,
        occurredAt: message.occurredAt,
        source: "webhook/uazapi",
        payload: {
          messageId: inserted.data.id,
          responseType: deal.response_type === "bot" ? "bot" : "sem_resposta",
          suggestedTask: { at: plan.at, type: plan.type, note: plan.note },
        },
      }, { apply: true });
    }

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
