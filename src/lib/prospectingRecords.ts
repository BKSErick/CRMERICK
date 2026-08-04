import type { NextActionType, ResponseType, ResponseTypeSource } from "./followup.ts";
import type { ChannelStatus, ProspectingChannel } from "./prospecting.ts";

export type MatchConfidence = "low" | "medium" | "high";

export type ProspectingChannelRecord = {
  id: number;
  dealId: number;
  channel: ProspectingChannel;
  identity?: string | null;
  profileUrl?: string | null;
  matchSource?: string | null;
  matchConfidence?: MatchConfidence;
  status?: ChannelStatus;
  lastOpenedAt?: string | null;
  lastOutboundAt?: string | null;
  lastInboundAt?: string | null;
  nextActionAt?: string | null;
  nextActionType?: NextActionType | null;
  nextActionNote?: string | null;
  responseType?: ResponseType;
  responseTypeSource?: ResponseTypeSource;
  optedOutAt?: string | null;
  evidence?: Record<string, unknown>;
};

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function asChannel(value: unknown): ProspectingChannel {
  if (value === "whatsapp" || value === "email" || value === "linkedin") return value;
  return "instagram";
}

function asStatus(value: unknown): ChannelStatus {
  if (
    value === "ready" || value === "opened" || value === "contacted" ||
    value === "replied" || value === "paused" || value === "opted_out"
  ) return value;
  return "review";
}

function asResponseType(value: unknown): ResponseType {
  if (
    value === "bot" || value === "humana" || value === "encaminhamento" ||
    value === "objecao" || value === "perdido"
  ) return value;
  return "sem_resposta";
}

export function mapProspectingChannelFromRow(row: Record<string, unknown>): ProspectingChannelRecord {
  return {
    id: asNumber(row.id),
    dealId: asNumber(row.deal_id ?? row.dealId),
    channel: asChannel(row.channel),
    identity: asNullableString(row.identity),
    profileUrl: asNullableString(row.profile_url ?? row.profileUrl),
    matchSource: asNullableString(row.match_source ?? row.matchSource),
    matchConfidence: row.match_confidence === "high" || row.match_confidence === "medium" ? row.match_confidence : "low",
    status: asStatus(row.status),
    lastOpenedAt: asNullableString(row.last_opened_at ?? row.lastOpenedAt),
    lastOutboundAt: asNullableString(row.last_outbound_at ?? row.lastOutboundAt),
    lastInboundAt: asNullableString(row.last_inbound_at ?? row.lastInboundAt),
    nextActionAt: asNullableString(row.next_action_at ?? row.nextActionAt),
    nextActionType: asNullableString(row.next_action_type ?? row.nextActionType) as NextActionType | null,
    nextActionNote: asNullableString(row.next_action_note ?? row.nextActionNote),
    responseType: asResponseType(row.response_type ?? row.responseType),
    responseTypeSource: row.response_type_source === "manual" || row.responseTypeSource === "manual" ? "manual" : "automatic",
    optedOutAt: asNullableString(row.opted_out_at ?? row.optedOutAt),
    evidence: row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence) ? row.evidence as Record<string, unknown> : {},
  };
}

export function mapProspectingChannelToRow(record: Partial<ProspectingChannelRecord>) {
  return Object.fromEntries(Object.entries({
    deal_id: record.dealId,
    channel: record.channel,
    identity: record.identity,
    profile_url: record.profileUrl,
    match_source: record.matchSource,
    match_confidence: record.matchConfidence,
    status: record.status,
    last_opened_at: record.lastOpenedAt,
    last_outbound_at: record.lastOutboundAt,
    last_inbound_at: record.lastInboundAt,
    next_action_at: record.nextActionAt,
    next_action_type: record.nextActionType,
    next_action_note: record.nextActionNote,
    response_type: record.responseType,
    response_type_source: record.responseTypeSource,
    opted_out_at: record.optedOutAt,
    evidence: record.evidence,
  }).filter(([, value]) => value !== undefined));
}
