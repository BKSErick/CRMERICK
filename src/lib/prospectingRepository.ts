import { readFileSync } from "node:fs";
import path from "node:path";
import { getCrmSupabaseAdmin } from "./crmSupabase";
import { classifyCandidateAgainstCrm, createInstagramMessage } from "./prospectingSearch";
import { mapProspectingChannelFromRow, mapProspectingChannelToRow } from "./prospectingRecords";
import { planProspectingAction, type ProspectingAction } from "./prospectingActions";
import type { ProspectingChannel, ProspectingVertical } from "./prospecting";

type ImportCandidate = {
  name: string;
  city: string | null;
  uf: string | null;
  address: string | null;
  mapsCid: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewsCount: number;
  instagramUrl: string;
  instagramUsername: string;
  matchConfidence: "low" | "medium" | "high";
  matchSource: string | null;
  evidence: Record<string, unknown>;
};

export function loadSuppressionList() {
  try {
    const value = JSON.parse(readFileSync(path.join(process.cwd(), "data", "nao-prospectar.json"), "utf8"));
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return ["jotta", "metalthec", "ostrack", "backstage", "bks grow", "synkra"];
  }
}

async function references() {
  const supabase = getCrmSupabaseAdmin();
  const [contacts, deals, channels] = await Promise.all([
    supabase.from("contacts").select("id,name,company,phone,maps_cid,site_url,status").limit(5000),
    supabase.from("deals").select("id,name,company,phone,site_url").limit(5000),
    supabase.from("prospecting_channels").select("deal_id,identity,channel").eq("channel", "instagram").limit(5000),
  ]);
  if (contacts.error) throw contacts.error;
  if (deals.error) throw deals.error;
  if (channels.error) throw channels.error;
  const byId = new Map((contacts.data ?? []).map((row) => [Number(row.id), row]));
  const identityByDeal = new Map((channels.data ?? []).map((row) => [Number(row.deal_id), row.identity]));
  return (deals.data ?? []).map((deal) => {
    const contact = byId.get(Number(deal.id));
    return {
      dealId: Number(deal.id),
      name: deal.company || deal.name || contact?.company || contact?.name,
      mapsCid: contact?.maps_cid,
      phone: deal.phone || contact?.phone,
      website: deal.site_url || contact?.site_url,
      instagramUsername: identityByDeal.get(Number(deal.id)),
    };
  });
}

async function createDeal(candidate: ImportCandidate, vertical: ProspectingVertical) {
  const supabase = getCrmSupabaseAdmin();
  const [lastContact, lastDeal] = await Promise.all([
    supabase.from("contacts").select("id").order("id", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("deals").select("id").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (lastContact.error) throw lastContact.error;
  if (lastDeal.error) throw lastDeal.error;
  const id = Math.max(Number(lastContact.data?.id ?? 0), Number(lastDeal.data?.id ?? 0)) + 1;
  const initials = candidate.name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
  const contact = await supabase.from("contacts").insert({
    id,
    name: candidate.name,
    company: candidate.name,
    phone: candidate.phone || "—",
    status: "lead",
    initials,
    city: candidate.city,
    uf: candidate.uf,
    address: candidate.address,
    rating: candidate.rating,
    reviews_count: candidate.reviewsCount,
    maps_cid: candidate.mapsCid,
    source: "serper_instagram",
    site_url: candidate.website,
  });
  if (contact.error) throw contact.error;
  const deal = await supabase.from("deals").insert({
    id,
    name: candidate.name,
    company: candidate.name,
    segment: vertical,
    stage: "prospect",
    status: "open",
    phone: candidate.phone,
    site_url: candidate.website,
    points: 1,
    origin: "serper_instagram",
    origin_detail: `${vertical}:${candidate.city ?? "sem_cidade"}`,
  });
  if (deal.error) {
    await supabase.from("contacts").delete().eq("id", id);
    throw deal.error;
  }
  return id;
}

export async function importInstagramProspect(candidate: ImportCandidate, vertical: ProspectingVertical) {
  const supabase = getCrmSupabaseAdmin();
  const existing = await references();
  const match = classifyCandidateAgainstCrm(candidate, existing, loadSuppressionList());
  if (match.state === "blocked") throw new Error("Empresa bloqueada pela lista de nao prospectar.");
  const dealId = match.state === "existing" ? match.dealId : await createDeal(candidate, vertical);
  const status = candidate.matchConfidence === "high" ? "ready" : "review";
  const channelResult = await supabase.from("prospecting_channels").upsert(
    mapProspectingChannelToRow({
      dealId,
      channel: "instagram",
      identity: candidate.instagramUsername,
      profileUrl: candidate.instagramUrl,
      matchSource: candidate.matchSource,
      matchConfidence: candidate.matchConfidence,
      status,
      evidence: { ...candidate.evidence, vertical, city: candidate.city, uf: candidate.uf },
    }),
    { onConflict: "deal_id,channel" },
  ).select("*").single();
  if (channelResult.error) throw channelResult.error;

  const existingDraft = await supabase.from("messages").select("id").eq("deal_id", dealId)
    .eq("channel", "instagram").eq("status", "draft").limit(1).maybeSingle();
  if (existingDraft.error) throw existingDraft.error;
  if (!existingDraft.data) {
    const draft = await supabase.from("messages").insert({
      deal_id: dealId,
      channel: "instagram",
      content: createInstagramMessage({ tier: "initial", vertical, company: candidate.name, city: candidate.city }),
      status: "draft",
      provider: "manual",
      direction: "draft",
    });
    if (draft.error) throw draft.error;
  }
  return { dealId, reusedDeal: match.state === "existing", channel: mapProspectingChannelFromRow(channelResult.data) };
}

export async function applyProspectingAction(input: {
  action: ProspectingAction;
  dealId: number;
  channel: ProspectingChannel;
  content?: string;
  responseType?: Parameters<typeof planProspectingAction>[0]["responseType"];
  nextActionAt?: string | null;
  nextActionType?: Parameters<typeof planProspectingAction>[0]["nextActionType"];
  note?: string | null;
}) {
  const supabase = getCrmSupabaseAdmin();
  const existingChannel = await supabase.from("prospecting_channels").select("*")
    .eq("deal_id", input.dealId).eq("channel", input.channel).single();
  if (existingChannel.error) throw existingChannel.error;
  const sentCount = await supabase.from("messages").select("id", { count: "exact", head: true })
    .eq("deal_id", input.dealId).eq("channel", input.channel).eq("direction", "sent");
  if (sentCount.error) throw sentCount.error;
  const plan = planProspectingAction({ ...input, previousOutboundCount: sentCount.count ?? 0 });
  if (plan.message) {
    const message = await supabase.from("messages").insert({
      deal_id: input.dealId,
      channel: plan.message.channel,
      content: plan.message.content,
      status: plan.message.status,
      provider: plan.message.provider,
      direction: plan.message.direction,
      occurred_at: plan.message.occurredAt,
      sent_at: plan.message.sentAt,
    });
    if (message.error) throw message.error;
  }
  if (plan.activity) {
    const activity = await supabase.from("activities").insert({
      deal_id: input.dealId,
      type: plan.activity.type,
      description: plan.activity.description,
    });
    if (activity.error) throw activity.error;
  }
  const update = await supabase.from("prospecting_channels").update(mapProspectingChannelToRow(plan.channelUpdate))
    .eq("id", existingChannel.data.id).select("*").single();
  if (update.error) throw update.error;
  return mapProspectingChannelFromRow(update.data);
}

export async function getProspectingQueue(channel: ProspectingChannel = "instagram") {
  const supabase = getCrmSupabaseAdmin();
  const channelsResult = await supabase.from("prospecting_channels").select("*")
    .eq("channel", channel).order("next_action_at", { ascending: true, nullsFirst: false }).limit(1000);
  if (channelsResult.error) throw channelsResult.error;
  const rows = channelsResult.data ?? [];
  const dealIds = rows.map((row) => Number(row.deal_id));
  if (!dealIds.length) return [];
  const [dealsResult, messagesResult] = await Promise.all([
    supabase.from("deals").select("id,name,company,segment,stage,phone,site_url,points").in("id", dealIds),
    supabase.from("messages").select("id,deal_id,channel,content,status,direction,occurred_at,sent_at,created_at")
      .in("deal_id", dealIds).eq("channel", channel).order("created_at", { ascending: false }).limit(5000),
  ]);
  if (dealsResult.error) throw dealsResult.error;
  if (messagesResult.error) throw messagesResult.error;
  const deals = new Map((dealsResult.data ?? []).map((deal) => [Number(deal.id), deal]));
  const messages = messagesResult.data ?? [];
  return rows.map((row) => {
    const dealId = Number(row.deal_id);
    const channel = mapProspectingChannelFromRow(row);
    const deal = deals.get(dealId) ?? null;
    const dealMessages = messages.filter((message) => Number(message.deal_id) === dealId).slice(0, 12);
    const outboundCount = dealMessages.filter((message) => message.direction === "sent").length;
    const tiers = ["initial", "M1", "M2", "M3"] as const;
    const vertical = deal?.segment === "odontologia" ? "odontologia" : "estetica";
    return {
      channel,
      deal,
      messages: dealMessages,
      suggestedMessage: createInstagramMessage({
        tier: tiers[Math.min(outboundCount, tiers.length - 1)],
        vertical,
        company: String(deal?.company || deal?.name || channel.identity || "empresa"),
        city: typeof channel.evidence?.city === "string" ? channel.evidence.city : null,
      }),
    };
  });
}
