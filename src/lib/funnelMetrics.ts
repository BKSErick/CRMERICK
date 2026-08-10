export const MEETING_STATUSES = ["scheduled", "confirmed", "held", "no_show", "cancelled"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export function meetingStatusUpdate(status: MeetingStatus, nowIso = new Date().toISOString()) {
  if (status === "scheduled") {
    return { meeting_status: status, confirmed_at: null, held_at: null, done: false };
  }
  if (status === "confirmed") {
    return { meeting_status: status, confirmed_at: nowIso, held_at: null, done: false };
  }
  if (status === "held") {
    return { meeting_status: status, held_at: nowIso, done: true };
  }
  return {
    meeting_status: status,
    held_at: null,
    done: status === "no_show" || status === "cancelled",
  };
}

type FunnelDeal = {
  id: number;
  stage?: string | null;
  response_type?: string | null;
  referred_phone?: string | null;
  value?: number | string | null;
  recurring?: boolean | null;
  is_prospect?: boolean | null;
  copy_variant?: string | null;
  experiment_id?: string | null;
};

type FunnelActivity = { deal_id?: number | null; type?: string | null };
type FunnelMeeting = {
  deal_id?: number | null;
  kind?: string | null;
  meeting_status?: string | null;
  done?: boolean | null;
};

const STAGE_ORDER = ["prospect", "abordado", "followup", "qualified", "proposal", "negotiation", "won"];
const VALID_RESPONSES = new Set(["humana", "encaminhamento", "objecao"]);

function atLeast(stage: string | null | undefined, target: string) {
  const current = STAGE_ORDER.indexOf(stage ?? "");
  return current >= STAGE_ORDER.indexOf(target) && current >= 0;
}

function rate(value: number, base: number) {
  return base > 0 ? Number(((value / base) * 100).toFixed(2)) : 0;
}

export function buildOperationalFunnel(input: {
  deals: FunnelDeal[];
  activities: FunnelActivity[];
  meetings: FunnelMeeting[];
}) {
  const deals = input.deals.filter((deal) => deal.is_prospect !== false);
  const outboundDealIds = new Set(
    input.activities
      .filter((activity) => activity.type === "whatsapp_sent" || activity.type === "whatsapp_sent_sync")
      .map((activity) => activity.deal_id)
      .filter((id): id is number => typeof id === "number"),
  );
  const meetings = input.meetings.filter((event) => event.kind === "reuniao");
  const scheduledStatuses = new Set(["scheduled", "confirmed", "held", "no_show"]);

  const counts = {
    leads: deals.length,
    approached: deals.filter((deal) => outboundDealIds.has(deal.id) || atLeast(deal.stage, "abordado")).length,
    validResponses: deals.filter((deal) => VALID_RESPONSES.has(deal.response_type ?? "")).length,
    referrals: deals.filter((deal) => deal.response_type === "encaminhamento" || Boolean(deal.referred_phone)).length,
    qualified: deals.filter((deal) => atLeast(deal.stage, "qualified")).length,
    meetingsScheduled: meetings.filter((event) => scheduledStatuses.has(event.meeting_status ?? (event.done ? "held" : "scheduled"))).length,
    meetingsHeld: meetings.filter((event) => (event.meeting_status ?? (event.done ? "held" : "scheduled")) === "held").length,
    proposals: deals.filter((deal) => atLeast(deal.stage, "proposal")).length,
    negotiations: deals.filter((deal) => atLeast(deal.stage, "negotiation")).length,
    won: deals.filter((deal) => deal.stage === "won").length,
  };

  const wonDeals = deals.filter((deal) => deal.stage === "won");
  const revenue = {
    mrr: wonDeals.filter((deal) => deal.recurring).reduce((sum, deal) => sum + Math.max(0, Number(deal.value) || 0), 0),
    oneOff: wonDeals.filter((deal) => !deal.recurring).reduce((sum, deal) => sum + Math.max(0, Number(deal.value) || 0), 0),
  };

  return {
    counts,
    rates: {
      responsePerApproach: rate(counts.validResponses, counts.approached),
      qualifiedPerResponse: rate(counts.qualified, counts.validResponses),
      meetingHeldPerScheduled: rate(counts.meetingsHeld, counts.meetingsScheduled),
      proposalPerHeldMeeting: rate(counts.proposals, counts.meetingsHeld),
      winPerProposal: rate(counts.won, counts.proposals),
    },
    revenue,
  };
}

export function buildVariantReport(input: {
  deals: FunnelDeal[];
  activities: FunnelActivity[];
  meetings: FunnelMeeting[];
  experimentId?: string;
}) {
  return (["A", "B"] as const).map((variant) => {
    const variantDeals = input.deals.filter(
      (deal) => deal.copy_variant === variant && (!input.experimentId || deal.experiment_id === input.experimentId),
    );
    const ids = new Set(variantDeals.map((deal) => deal.id));
    const funnel = buildOperationalFunnel({
      deals: variantDeals,
      activities: input.activities.filter((activity) => typeof activity.deal_id === "number" && ids.has(activity.deal_id)),
      meetings: input.meetings.filter((meeting) => typeof meeting.deal_id === "number" && ids.has(meeting.deal_id)),
    });
    return { variant, ...funnel };
  });
}
