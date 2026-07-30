import type { NextActionType, ResponseType, ResponseTypeSource } from "./followup.ts";

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
