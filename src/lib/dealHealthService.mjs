import { createHash } from "node:crypto";

import { calculateDealHealth } from "./dealHealth.mjs";

const DEAL_SELECT = [
  "id", "stage", "created_at", "updated_at", "stage_entered_at", "last_inbound_at", "last_outbound_at",
  "response_type", "response_type_source", "referred_phone", "next_action_at", "next_action_note",
  "next_action_source", "close_date", "deal_health_fingerprint",
].join(", ");

function latestMessage(messages, direction) {
  return [...messages]
    .filter((message) => message.direction === direction)
    .map((message) => message.occurred_at ?? message.sent_at ?? message.created_at)
    .filter(Boolean)
    .sort((left, right) => String(right).localeCompare(String(left)))[0] ?? null;
}

export function buildDealHealthInput({ deal, messages = [], meetings = [], now }) {
  return {
    now,
    deal: {
      id: Number(deal.id),
      stage: deal.stage ?? "prospect",
      stageEnteredAt: deal.stage_entered_at ?? deal.created_at ?? null,
      lastInboundAt: deal.last_inbound_at ?? latestMessage(messages, "received"),
      lastOutboundAt: deal.last_outbound_at ?? latestMessage(messages, "sent"),
      responseType: deal.response_type ?? "sem_resposta",
      responseTypeSource: deal.response_type_source ?? "automatic",
      referredPhone: deal.referred_phone ?? null,
      nextActionAt: deal.next_action_at ?? null,
      nextActionNote: deal.next_action_note ?? null,
      nextActionSource: deal.next_action_source ?? "automatic",
      closeDate: deal.close_date ?? null,
    },
    meetings: meetings.map((meeting) => ({
      status: meeting.meeting_status ?? (meeting.done ? "held" : "scheduled"),
      startsAt: meeting.starts_at ?? null,
      heldAt: meeting.held_at ?? null,
    })),
  };
}

export function dealHealthFingerprint(input, health) {
  const stable = {
    rubricVersion: health.rubricVersion,
    deal: input.deal,
    meetings: [...(input.meetings ?? [])].sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right))),
    result: {
      score: health.dealHealthScore,
      classification: health.classification,
      confidence: health.confidence,
      factors: health.factors,
      risks: health.risks,
      warnings: health.warnings,
      recommendation: health.recommendedNextAction,
    },
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

async function loadDealHealthSources(supabase, dealId) {
  const [dealResult, messageResult, meetingResult] = await Promise.all([
    supabase.from("deals").select(DEAL_SELECT).eq("id", dealId).single(),
    supabase
      .from("messages")
      .select("direction, occurred_at, sent_at, created_at")
      .eq("deal_id", dealId)
      .order("occurred_at", { ascending: false })
      .limit(200),
    supabase
      .from("calendar_events")
      .select("meeting_status, starts_at, held_at, done")
      .eq("deal_id", dealId)
      .eq("kind", "reuniao")
      .order("starts_at", { ascending: false })
      .limit(50),
  ]);
  if (dealResult.error) throw dealResult.error;
  if (messageResult.error) throw messageResult.error;
  if (meetingResult.error) throw meetingResult.error;
  return { deal: dealResult.data, messages: messageResult.data ?? [], meetings: meetingResult.data ?? [] };
}

export async function recalculateDealHealth(supabase, dealId, options = {}) {
  if (!Number.isInteger(Number(dealId)) || Number(dealId) <= 0) throw new Error("dealId valido e obrigatorio.");
  const sources = await loadDealHealthSources(supabase, Number(dealId));
  const input = buildDealHealthInput({ ...sources, now: options.now ?? new Date().toISOString() });
  const health = calculateDealHealth(input);
  const fingerprint = dealHealthFingerprint(input, health);
  const changed = sources.deal.deal_health_fingerprint !== fingerprint;

  if (options.apply !== true || !changed) {
    return { dealId: Number(dealId), health, fingerprint, changed, persisted: false };
  }

  const updated = await supabase
    .from("deals")
    .update({
      deal_health_score: health.dealHealthScore,
      deal_health_classification: health.classification,
      deal_health_confidence: health.confidence,
      deal_health_factors: health.factors,
      deal_health_risks: health.risks,
      deal_health_warnings: health.warnings,
      deal_health_recommended_action: health.recommendedNextAction,
      deal_health_calculated_at: health.computedAt,
      deal_health_fingerprint: fingerprint,
      deal_health_rubric_version: health.rubricVersion,
    })
    .eq("id", Number(dealId))
    .or(`deal_health_fingerprint.is.null,deal_health_fingerprint.neq.${fingerprint}`)
    .select("id");
  if (updated.error) throw updated.error;
  if ((updated.data ?? []).length === 0) {
    return { dealId: Number(dealId), health, fingerprint, changed: false, persisted: false };
  }

  const audit = await supabase.from("activities").insert({
    deal_id: Number(dealId),
    type: "deal_health_recalculated",
    description: `Saude do negocio: ${health.dealHealthScore}/100 (${health.classification}).`,
    metadata: {
      deal_health: true,
      rubric_version: health.rubricVersion,
      score: health.dealHealthScore,
      classification: health.classification,
      confidence: health.confidence,
      factors: health.factors,
      risks: health.risks,
      warnings: health.warnings,
      recommended_next_action: health.recommendedNextAction,
      fingerprint,
    },
  });
  if (audit.error) throw audit.error;

  return { dealId: Number(dealId), health, fingerprint, changed: true, persisted: true };
}

export async function recalculateDealHealthBestEffort(supabase, dealId, options = {}) {
  try {
    return await recalculateDealHealth(supabase, dealId, options);
  } catch (error) {
    console.error(`Falha ao recalcular saude do deal ${dealId}:`, error);
    return {
      dealId: Number(dealId),
      health: null,
      fingerprint: "",
      changed: false,
      persisted: false,
      failed: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
