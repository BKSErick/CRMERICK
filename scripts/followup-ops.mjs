import { createClient } from "@supabase/supabase-js";

import {
  QUEUE_SECTION_INFO,
  classificationUpdate,
  queueSectionForDeal,
} from "../src/lib/followup.ts";
import { normalizeWhatsappPhone } from "../src/lib/whatsappPhone.ts";

const RESPONSE_TYPES = new Set([
  "sem_resposta",
  "bot",
  "humana",
  "encaminhamento",
  "objecao",
  "perdido",
]);

function usage() {
  console.log(`Follow-up Ops (nao envia WhatsApp e nao altera stage)

Uso:
  npm run followup:ops -- list [--limit=50] [--section=bots_d7]
  npm run followup:ops -- classify <dealId> <responseType>
  npm run followup:ops -- schedule <dealId> <ISO-8601> [nota]
`);
}

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function option(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function audit(supabase, dealId, type, description) {
  const { error } = await supabase.from("activities").insert({
    deal_id: dealId,
    type,
    description,
  });
  if (error) throw error;
}

async function listQueue(supabase) {
  const limit = Math.min(500, Math.max(1, Number(option("limit", "50")) || 50));
  const sectionFilter = option("section", "");
  const [dealsResult, contactsResult] = await Promise.all([
    supabase
      .from("deals")
      .select(
        "id, company, name, stage, phone, whatsapp, contact_id, response_type, next_action_at, next_action_type, next_action_note, next_action_source, last_inbound_at, last_outbound_at, response_time_minutes",
      )
      .in("stage", ["abordado", "followup", "qualified", "proposal", "negotiation"])
      .limit(2000),
    supabase
      .from("contacts")
      .select("id, name, company, phone, whatsapp")
      .limit(3000),
  ]);
  if (dealsResult.error) throw dealsResult.error;
  if (contactsResult.error) throw contactsResult.error;
  const contacts = contactsResult.data ?? [];
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));

  const now = new Date().toISOString();
  const rows = (dealsResult.data ?? [])
    .map((deal) => {
      const contact =
        contactById.get(deal.contact_id) ??
        contacts.find(
          (candidate) =>
            candidate.company === deal.company || candidate.name === deal.company,
        );
      const phone = normalizeWhatsappPhone(
        deal.phone || deal.whatsapp || contact?.phone || contact?.whatsapp,
      );
      const section = queueSectionForDeal(
        {
          responseType: deal.response_type || "sem_resposta",
          phone,
          nextActionAt: deal.next_action_at,
          nextActionSource: deal.next_action_source,
          lastInboundAt: deal.last_inbound_at,
          lastOutboundAt: deal.last_outbound_at,
        },
        now,
      );
      return { ...deal, phone, section };
    })
    .filter((deal) => !sectionFilter || deal.section === sectionFilter)
    .sort((a, b) => {
      const sectionOrder =
        QUEUE_SECTION_INFO[a.section].order - QUEUE_SECTION_INFO[b.section].order;
      if (sectionOrder !== 0) return sectionOrder;
      return String(a.next_action_at || "").localeCompare(String(b.next_action_at || ""));
    })
    .slice(0, limit);

  console.table(
    rows.map((deal) => ({
      id: deal.id,
      empresa: deal.company || deal.name,
      secao: QUEUE_SECTION_INFO[deal.section].label,
      resposta: deal.response_type || "sem_resposta",
      proxima_acao: deal.next_action_at || "-",
      motivo: deal.next_action_note || "-",
    })),
  );
}

async function classify(supabase, args) {
  const dealId = Number(args[0]);
  const responseType = args[1];
  if (!Number.isInteger(dealId) || dealId <= 0 || !RESPONSE_TYPES.has(responseType)) {
    throw new Error("Use: classify <dealId> <responseType valido>.");
  }
  const current = await supabase
    .from("deals")
    .select("next_action_source")
    .eq("id", dealId)
    .single();
  if (current.error) throw current.error;
  const update = classificationUpdate(
    responseType,
    new Date().toISOString(),
    current.data.next_action_source,
  );
  const payload = {
    response_type: update.responseType,
    response_type_source: update.responseTypeSource,
    ...("nextActionAt" in update
      ? {
          next_action_at: update.nextActionAt,
          next_action_type: update.nextActionType,
          next_action_note: update.nextActionNote,
          next_action_source: update.nextActionSource,
        }
      : {}),
  };
  const { error } = await supabase
    .from("deals")
    .update(payload)
    .eq("id", dealId);
  if (error) throw error;
  await audit(supabase, dealId, "followup_classified", `Resposta classificada como ${responseType} via CLI`);
  console.log(`Deal ${dealId} classificado como ${responseType}. Stage preservado.`);
}

async function schedule(supabase, args) {
  const dealId = Number(args[0]);
  const at = args[1];
  const note = args.slice(2).join(" ").trim() || "Proxima acao agendada manualmente.";
  if (!Number.isInteger(dealId) || dealId <= 0 || !at || Number.isNaN(new Date(at).getTime())) {
    throw new Error("Use: schedule <dealId> <ISO-8601> [nota].");
  }
  const normalizedAt = new Date(at).toISOString();
  const { error } = await supabase
    .from("deals")
    .update({
      next_action_at: normalizedAt,
      next_action_type: "followup_silencio",
      next_action_note: note,
      next_action_source: "manual",
    })
    .eq("id", dealId);
  if (error) throw error;
  await audit(supabase, dealId, "followup_scheduled", `Proxima acao agendada para ${normalizedAt} via CLI`);
  console.log(`Deal ${dealId} agendado para ${normalizedAt}. Stage preservado.`);
}

async function main() {
  const [command = "help", ...args] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (command === "help" || command === "--help") {
    usage();
    return;
  }
  const supabase = getClient();
  if (command === "list") return listQueue(supabase);
  if (command === "classify") return classify(supabase, args);
  if (command === "schedule") return schedule(supabase, args);
  throw new Error(`Comando desconhecido: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
