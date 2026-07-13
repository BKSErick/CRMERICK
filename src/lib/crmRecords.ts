export type DealStage = "prospect" | "abordado" | "qualified" | "proposal" | "negotiation" | "won" | "lost";

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
  if (stage === "prospect" || stage === "abordado" || stage === "qualified" || stage === "proposal" || stage === "negotiation" || stage === "won" || stage === "lost") {
    return stage;
  }
  return "prospect";
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
