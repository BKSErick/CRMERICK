import type { NextActionType, ResponseType, ResponseTypeSource } from "./followup.ts";
import type { DealHealthClassification, DealHealthEvidence } from "./dealHealth.mjs";
import type { LossReasonCode } from "./dealLossReasons.mjs";
import {
  normalizeDealQualification,
  summarizeDealQualification,
  type DealQualification,
  type QualificationSummary,
} from "./dealQualification.mjs";

export type DealStage = "prospect" | "abordado" | "followup" | "qualified" | "proposal" | "negotiation" | "won" | "lost";

export type Deal = {
  id: number;
  name?: string;
  company: string;
  title?: string;
  stage: DealStage;
  value: number;
  prob?: number;
  probability?: number;
  owner?: string;
  ownerName?: string;
  close?: string;
  tag?: string;
  tagType?: string;
  ticketId?: string;
  points?: number;
  progress?: number;
  assignee?: string;
  phone?: string;
  whatsapp?: string;
  copyText?: string;
  analysisUrl?: string;
  siteUrl?: string;
  segment?: string;
  recurring?: boolean;
  closedAt?: string;
  updated_at?: string;
  priority?: string;
  prioritySource?: "automatic" | "manual";
  description?: string;
  pains?: string;
  leadMessages?: string;
  contactId?: number;
  origin?: string;
  originDetail?: string;
  responseType?: ResponseType;
  responseTypeSource?: ResponseTypeSource;
  nextActionAt?: string | null;
  nextActionType?: NextActionType | null;
  nextActionNote?: string | null;
  nextActionSource?: "automatic" | "manual";
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
  responseTimeMinutes?: number | null;
  copyVersion?: string;
  copyVariant?: "A" | "B";
  offerVersion?: string;
  experimentId?: string;
  stageEnteredAt?: string;
  dealHealthScore?: number;
  dealHealthClassification?: DealHealthClassification;
  dealHealthConfidence?: number;
  dealHealthFactors?: DealHealthEvidence[];
  dealHealthRisks?: DealHealthEvidence[];
  dealHealthWarnings?: string[];
  dealHealthRecommendedAction?: string;
  dealHealthCalculatedAt?: string;
  dealHealthRubricVersion?: number;
  qualification?: DealQualification;
  qualificationSummary?: QualificationSummary;
  lossReasonCode?: LossReasonCode;
  lossReasonNote?: string;
  lossRecordedAt?: string;
  lossRecordedBy?: string;
};

export type Contact = {
  id: number;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  status?: "lead" | "active" | "inactive" | "client" | "lost";
  initials?: string;
  owner?: string;
  ownerName?: string;
  notes?: string;
  updated_at?: string;
};

type DealRow = Record<string, unknown>;
type ContactRow = Record<string, unknown>;

function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asHealthEvidence(value: unknown): DealHealthEvidence[] {
  return Array.isArray(value)
    ? value.filter((item): item is DealHealthEvidence => Boolean(item) && typeof item === "object" && typeof item.key === "string")
    : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asDealStage(value: unknown): DealStage {
  const stage = asString(value);
  if (stage === "prospect" || stage === "abordado" || stage === "followup" || stage === "qualified" || stage === "proposal" || stage === "negotiation" || stage === "won" || stage === "lost") {
    return stage;
  }
  return "prospect";
}

function asResponseType(value: unknown): ResponseType {
  const responseType = asString(value);
  if (
    responseType === "bot" ||
    responseType === "humana" ||
    responseType === "encaminhamento" ||
    responseType === "objecao" ||
    responseType === "perdido"
  ) {
    return responseType;
  }
  return "sem_resposta";
}

export function mapDealFromRow(row: DealRow): Deal {
  const prob = asNumber(row.prob ?? row.probability);
  const company = asString(row.company) || asString(row.name) || "Sem empresa";
  const name = asString(row.name) || asString(row.title) || company;

  return {
    id: asNumber(row.id),
    name,
    company,
    title: asString(row.title) || name,
    stage: asDealStage(row.stage),
    value: asNumber(row.value),
    prob,
    probability: prob,
    owner: asString(row.owner),
    ownerName: asString(row.owner_name ?? row.ownerName),
    close: asString(row.close_date ?? row.close),
    tag: asString(row.tag),
    tagType: asString(row.tag_type ?? row.tagType),
    ticketId: asString(row.ticket_id ?? row.ticketId),
    points: asNumber(row.points, 1),
    progress: asNumber(row.progress),
    assignee: asString(row.assignee),
    phone: asString(row.phone),
    whatsapp: asString(row.whatsapp),
    copyText: asString(row.copy_text ?? row.copyText),
    analysisUrl: asString(row.analysis_url ?? row.analysisUrl),
    siteUrl: asString(row.site_url ?? row.siteUrl),
    segment: asString(row.segment),
    recurring: typeof row.recurring === "boolean" ? row.recurring : Boolean(row.recurring),
    closedAt: asString(row.closed_at ?? row.closedAt),
    updated_at: asString(row.updated_at),
    priority: asString(row.priority),
    prioritySource: asString(row.priority_source ?? row.prioritySource) as Deal["prioritySource"],
    description: asString(row.description),
    pains: asString(row.pains),
    leadMessages: asString(row.lead_messages ?? row.leadMessages),
    contactId: row.contact_id != null ? asNumber(row.contact_id) : undefined,
    origin: asString(row.origin),
    originDetail: asString(row.origin_detail ?? row.originDetail),
    responseType: asResponseType(row.response_type ?? row.responseType),
    responseTypeSource: asString(row.response_type_source ?? row.responseTypeSource) as Deal["responseTypeSource"],
    nextActionAt: asString(row.next_action_at ?? row.nextActionAt),
    nextActionType: asString(row.next_action_type ?? row.nextActionType) as Deal["nextActionType"],
    nextActionNote: asString(row.next_action_note ?? row.nextActionNote),
    nextActionSource: asString(row.next_action_source ?? row.nextActionSource) as Deal["nextActionSource"],
    lastInboundAt: asString(row.last_inbound_at ?? row.lastInboundAt),
    lastOutboundAt: asString(row.last_outbound_at ?? row.lastOutboundAt),
    responseTimeMinutes:
      row.response_time_minutes != null || row.responseTimeMinutes != null
        ? asNumber(row.response_time_minutes ?? row.responseTimeMinutes)
        : undefined,
    copyVersion: asString(row.copy_version ?? row.copyVersion),
    copyVariant: asString(row.copy_variant ?? row.copyVariant) as Deal["copyVariant"],
    offerVersion: asString(row.offer_version ?? row.offerVersion),
    experimentId: asString(row.experiment_id ?? row.experimentId),
    stageEnteredAt: asString(row.stage_entered_at ?? row.stageEnteredAt),
    dealHealthScore: row.deal_health_score == null ? undefined : asNumber(row.deal_health_score),
    dealHealthClassification: asString(row.deal_health_classification) as Deal["dealHealthClassification"],
    dealHealthConfidence: row.deal_health_confidence == null ? undefined : asNumber(row.deal_health_confidence),
    dealHealthFactors: asHealthEvidence(row.deal_health_factors),
    dealHealthRisks: asHealthEvidence(row.deal_health_risks),
    dealHealthWarnings: asStringArray(row.deal_health_warnings),
    dealHealthRecommendedAction: asString(row.deal_health_recommended_action),
    dealHealthCalculatedAt: asString(row.deal_health_calculated_at),
    dealHealthRubricVersion: row.deal_health_rubric_version == null ? undefined : asNumber(row.deal_health_rubric_version),
    qualification: normalizeDealQualification(row.qualification),
    qualificationSummary: summarizeDealQualification(row.qualification),
    lossReasonCode: asString(row.loss_reason_code ?? row.lossReasonCode) as LossReasonCode | undefined,
    lossReasonNote: asString(row.loss_reason_note ?? row.lossReasonNote),
    lossRecordedAt: asString(row.loss_recorded_at ?? row.lossRecordedAt),
    lossRecordedBy: asString(row.loss_recorded_by ?? row.lossRecordedBy),
  };
}

export function mapContactFromRow(row: ContactRow): Contact {
  return {
    id: asNumber(row.id),
    name: asString(row.name) || "Sem nome",
    company: asString(row.company),
    email: asString(row.email),
    phone: asString(row.phone),
    whatsapp: asString(row.whatsapp),
    status: (asString(row.status) as Contact["status"]) || "lead",
    initials: asString(row.initials),
    owner: asString(row.owner),
    ownerName: asString(row.owner_name ?? row.ownerName),
    notes: asString(row.notes),
    updated_at: asString(row.updated_at),
  };
}

export function mapDealToRow(deal: Partial<Deal>) {
  return stripUndefined({
    name: deal.name ?? deal.title ?? deal.company,
    company: deal.company,
    segment: deal.segment,
    value: deal.value,
    prob: deal.prob ?? deal.probability,
    stage: deal.stage,
    owner: deal.owner,
    owner_name: deal.ownerName,
    close_date: deal.close,
    tag: deal.tag,
    tag_type: deal.tagType,
    ticket_id: deal.ticketId,
    points: deal.points,
    progress: deal.progress,
    assignee: deal.assignee,
    analysis_url: deal.analysisUrl,
    copy_text: deal.copyText,
    site_url: deal.siteUrl,
    phone: deal.phone,
    whatsapp: deal.whatsapp,
    recurring: deal.recurring,
    closed_at: deal.closedAt,
    priority: deal.priority,
    priority_source: deal.prioritySource,
    description: deal.description,
    pains: deal.pains,
    lead_messages: deal.leadMessages,
    response_type: deal.responseType,
    response_type_source: deal.responseTypeSource,
    next_action_at: deal.nextActionAt,
    next_action_type: deal.nextActionType,
    next_action_note: deal.nextActionNote,
    next_action_source: deal.nextActionSource,
    last_inbound_at: deal.lastInboundAt,
    last_outbound_at: deal.lastOutboundAt,
    response_time_minutes: deal.responseTimeMinutes,
    copy_version: deal.copyVersion,
    copy_variant: deal.copyVariant,
    offer_version: deal.offerVersion,
    experiment_id: deal.experimentId,
  });
}

export function mapContactToRow(contact: Partial<Contact>) {
  return stripUndefined({
    name: contact.name,
    company: contact.company,
    email: contact.email,
    phone: contact.phone,
    whatsapp: contact.whatsapp,
    status: contact.status,
    initials: contact.initials,
    owner: contact.owner,
    owner_name: contact.ownerName,
    notes: contact.notes,
  });
}

function stripUndefined<T extends Record<string, unknown>>(record: T) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}
