import type { getCrmSupabaseAdmin } from "./crmSupabase";
import { classifyInboundResponse } from "./followup.ts";
import type { AiQueryPlan } from "./aiQueryRouter.ts";

type SupabaseAdmin = ReturnType<typeof getCrmSupabaseAdmin>;
type UnknownRow = Record<string, unknown>;

export type AiEvidenceEnvelope = {
  sourceId: string;
  label: string;
  query: AiQueryPlan["intent"];
  asOf: string;
  scope: string;
  total: number;
  facts: unknown[];
  filters: Record<string, unknown>;
  limitations: string[];
  links: Array<{ label: string; href: string }>;
  truncated: boolean;
};

export type EmailAwaitingFact = {
  threadId: number;
  dealId: number | null;
  participant: string;
  email: string;
  subject: string;
  preview: string;
  receivedAt: string;
  unreadCount: number;
  href: string;
};

export type WhatsappAwaitingFact = {
  dealId: number;
  company: string;
  receivedAt: string;
  preview: string;
  stage: string;
  href: string;
};

export type OverdueFact = {
  dealId: number;
  company: string;
  name: string;
  stage: string;
  nextActionAt: string;
  nextActionType: string;
  href: string;
};

function cleanInbound(value: unknown) {
  return String(value ?? "")
    .replace(/^\[UAZAPI-HISTORY[^\]]*\]\s*/, "")
    .replace(/^WhatsApp recebido:\s*/i, "")
    .trim();
}

function timestamp(value: unknown) {
  const parsed = new Date(String(value ?? "")).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildEmailAwaitingFacts(rows: UnknownRow[], limit: number): EmailAwaitingFact[] {
  return rows
    .filter((row) => row.status === "open" && row.last_message_direction === "received")
    .sort((a, b) => timestamp(b.last_message_at) - timestamp(a.last_message_at) || Number(b.id) - Number(a.id))
    .slice(0, Math.max(1, Math.min(limit, 50)))
    .map((row) => ({
      threadId: Number(row.id),
      dealId: Number(row.deal_id) > 0 ? Number(row.deal_id) : null,
      participant: String(row.participant_name ?? row.participant_email ?? "Sem nome"),
      email: String(row.participant_email ?? ""),
      subject: String(row.subject ?? "Sem assunto"),
      preview: String(row.last_message_preview ?? "").slice(0, 240),
      receivedAt: String(row.last_message_at ?? ""),
      unreadCount: Math.max(0, Number(row.unread_count) || 0),
      href: `/emails?thread=${Number(row.id)}`,
    }));
}

export function buildWhatsappAwaitingFacts(activities: UnknownRow[], deals: UnknownRow[], limit: number): WhatsappAwaitingFact[] {
  const sorted = [...activities].sort(
    (a, b) => timestamp(b.created_at) - timestamp(a.created_at) || Number(b.id) - Number(a.id),
  );
  const latestByDeal = new Map<number, UnknownRow>();
  for (const activity of sorted) {
    const dealId = Number(activity.deal_id);
    if (dealId > 0 && !latestByDeal.has(dealId)) latestByDeal.set(dealId, activity);
  }
  const dealsById = new Map(deals.map((deal) => [Number(deal.id), deal]));
  const facts: WhatsappAwaitingFact[] = [];
  for (const [dealId, activity] of latestByDeal) {
    if (activity.type !== "whatsapp_received") continue;
    const preview = cleanInbound(activity.description);
    if (!preview || classifyInboundResponse(preview) === "bot") continue;
    const deal = dealsById.get(dealId) ?? {};
    facts.push({
      dealId,
      company: String(deal.company ?? deal.name ?? `Deal ${dealId}`),
      receivedAt: String(activity.created_at ?? ""),
      preview: preview.slice(0, 240),
      stage: String(deal.stage ?? ""),
      href: `/pipeline?dealId=${dealId}`,
    });
  }
  return facts.slice(0, Math.max(1, Math.min(limit, 50)));
}

export function sanitizeDealSearchTerm(value: unknown) {
  return String(value ?? "")
    .replace(/[%_,().\\]/g, " ")
    .replace(/[^\p{L}\p{N}\s&'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export function buildDailyPriorityFacts(input: {
  whatsapp: WhatsappAwaitingFact[];
  email: EmailAwaitingFact[];
  overdue: OverdueFact[];
  limit: number;
}) {
  const facts = [
    ...input.whatsapp.map((item) => ({ kind: "whatsapp_reply" as const, priority: 1, reason: "Resposta humana no WhatsApp aguardando voce", ...item })),
    ...input.email.map((item) => ({ kind: "email_reply" as const, priority: 2, reason: "Ultimo e-mail foi recebido e ainda nao houve envio posterior", ...item })),
    ...input.overdue.map((item) => ({ kind: "overdue_followup" as const, priority: 3, reason: "Proxima acao vencida", ...item })),
  ];
  return facts.slice(0, Math.max(1, Math.min(input.limit, 50)));
}

function periodCutoff(period: AiQueryPlan["filters"]["period"], now: Date) {
  const days = period === "today" ? 1 : period === "last_7_days" ? 7 : 30;
  return new Date(now.getTime() - days * 86400000).toISOString();
}

async function loadEmailAwaiting(supabase: SupabaseAdmin, plan: AiQueryPlan, now: Date) {
  const limit = plan.filters.limit;
  const result = await supabase
    .from("email_threads")
    .select("id, deal_id, participant_email, participant_name, subject, last_message_preview, last_message_at, last_message_direction, unread_count, status", { count: "exact" })
    .eq("status", "open")
    .eq("last_message_direction", "received")
    .gte("last_message_at", periodCutoff(plan.filters.period, now))
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(0, limit - 1);
  if (result.error) throw result.error;
  const facts = buildEmailAwaitingFacts((result.data ?? []) as UnknownRow[], limit);
  return { facts, total: result.count ?? facts.length };
}

async function loadWhatsappAwaiting(supabase: SupabaseAdmin, plan: AiQueryPlan, now: Date) {
  const activityLimit = Math.min(Math.max(plan.filters.limit * 25, 250), 5000);
  const result = await supabase
    .from("activities")
    .select("id, deal_id, type, description, created_at")
    .in("type", ["whatsapp_received", "whatsapp_sent", "whatsapp_sent_sync"])
    .gte("created_at", periodCutoff(plan.filters.period, now))
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(activityLimit);
  if (result.error) throw result.error;
  const rows = (result.data ?? []) as UnknownRow[];
  const dealIds = [...new Set(rows.map((row) => Number(row.deal_id)).filter((id) => id > 0))];
  const deals = dealIds.length
    ? await supabase.from("deals").select("id, company, name, stage").in("id", dealIds)
    : { data: [] as UnknownRow[], error: null };
  if (deals.error) throw deals.error;
  const allFacts = buildWhatsappAwaitingFacts(rows, (deals.data ?? []) as UnknownRow[], activityLimit);
  return { facts: allFacts.slice(0, plan.filters.limit), total: allFacts.length, activityLimitReached: rows.length >= activityLimit };
}

async function loadOverdue(supabase: SupabaseAdmin, limit: number, now: Date) {
  const result = await supabase
    .from("deals")
    .select("id, company, name, stage, next_action_at, next_action_type", { count: "exact" })
    .eq("status", "open")
    .lte("next_action_at", now.toISOString())
    .order("next_action_at", { ascending: true })
    .range(0, Math.max(0, limit - 1));
  if (result.error) throw result.error;
  const facts: OverdueFact[] = ((result.data ?? []) as UnknownRow[]).map((row) => ({
    dealId: Number(row.id),
    company: String(row.company ?? ""),
    name: String(row.name ?? ""),
    stage: String(row.stage ?? ""),
    nextActionAt: String(row.next_action_at ?? ""),
    nextActionType: String(row.next_action_type ?? "followup"),
    href: `/pipeline?dealId=${Number(row.id)}`,
  }));
  return { facts, total: result.count ?? facts.length };
}

export async function loadDailyPriorityEvidence(supabase: SupabaseAdmin, limit = 20, now = new Date()) {
  const basePlan: AiQueryPlan = { intent: "daily_priorities", filters: { period: "last_30_days", limit }, requiresSalesPlaybook: false };
  const [whatsapp, email, overdue] = await Promise.all([
    loadWhatsappAwaiting(supabase, basePlan, now),
    loadEmailAwaiting(supabase, basePlan, now),
    loadOverdue(supabase, limit, now),
  ]);
  const facts = buildDailyPriorityFacts({ whatsapp: whatsapp.facts, email: email.facts, overdue: overdue.facts, limit });
  return { facts, total: whatsapp.total + email.total + overdue.total, whatsapp, email, overdue };
}

async function loadDealSearch(supabase: SupabaseAdmin, plan: AiQueryPlan) {
  const term = sanitizeDealSearchTerm(plan.filters.textContains);
  let request = supabase
    .from("deals")
    .select("id, company, name, segment, stage, status, points, priority, next_action_at, next_action_type, updated_at", { count: "exact" });
  if (plan.filters.statusIn?.length) request = request.in("status", plan.filters.statusIn);
  else request = request.eq("status", "open");
  if (plan.filters.stageIn?.length) request = request.in("stage", plan.filters.stageIn);
  if (plan.filters.minPoints !== undefined) request = request.gte("points", plan.filters.minPoints);
  if (term) request = request.or(`company.ilike.%${term}%,name.ilike.%${term}%,segment.ilike.%${term}%`);
  const result = await request.order("points", { ascending: false }).order("updated_at", { ascending: false }).range(0, plan.filters.limit - 1);
  if (result.error) throw result.error;
  const facts = ((result.data ?? []) as UnknownRow[]).map((row) => ({
    dealId: Number(row.id),
    company: String(row.company ?? ""),
    name: String(row.name ?? ""),
    segment: String(row.segment ?? ""),
    stage: String(row.stage ?? ""),
    status: String(row.status ?? ""),
    points: Number(row.points ?? 0),
    priority: row.priority ? String(row.priority) : null,
    nextActionAt: row.next_action_at ? String(row.next_action_at) : null,
    nextActionType: row.next_action_type ? String(row.next_action_type) : null,
    href: `/pipeline?dealId=${Number(row.id)}`,
  }));
  return { facts, total: result.count ?? facts.length, term };
}

export async function retrieveAiEvidence(supabase: SupabaseAdmin, plan: AiQueryPlan, now = new Date()): Promise<AiEvidenceEnvelope[]> {
  const asOf = now.toISOString();
  if (plan.intent === "unknown") {
    return [{
      sourceId: "smart-retrieval-limit",
      label: "Limite da busca inteligente",
      query: "unknown",
      asOf,
      scope: "minimal",
      total: 0,
      facts: [],
      filters: plan.filters,
      limitations: ["Nao identifiquei uma consulta autorizada. Nenhum dado amplo do CRM foi carregado."],
      links: [],
      truncated: false,
    }];
  }

  if (plan.intent === "email_replies") {
    const data = await loadEmailAwaiting(supabase, plan, now);
    return [{ sourceId: "email-awaiting-reply", label: "E-mails aguardando resposta", query: plan.intent, asOf, scope: "email", total: data.total, facts: data.facts, filters: plan.filters, limitations: [], links: [{ label: "Abrir e-mails", href: "/emails" }], truncated: data.total > data.facts.length }];
  }
  if (plan.intent === "whatsapp_replies") {
    const data = await loadWhatsappAwaiting(supabase, plan, now);
    return [{ sourceId: "whatsapp-awaiting-reply", label: "WhatsApp aguardando resposta", query: plan.intent, asOf, scope: "whatsapp", total: data.total, facts: data.facts, filters: plan.filters, limitations: data.activityLimitReached ? ["O teto de leitura da timeline foi atingido."] : [], links: [{ label: "Abrir pipeline", href: "/pipeline" }], truncated: data.total > data.facts.length || data.activityLimitReached }];
  }
  if (plan.intent === "deal_search") {
    const data = await loadDealSearch(supabase, plan);
    return [{ sourceId: "deal-search", label: "Busca de oportunidades", query: plan.intent, asOf, scope: "deals", total: data.total, facts: data.facts, filters: { ...plan.filters, textContains: data.term }, limitations: [], links: [{ label: "Abrir pipeline", href: "/pipeline" }], truncated: data.total > data.facts.length }];
  }

  const data = await loadDailyPriorityEvidence(supabase, plan.filters.limit, now);
  return [{ sourceId: "daily-priorities", label: "Prioridades do dia", query: plan.intent, asOf, scope: "operations", total: data.total, facts: data.facts, filters: plan.filters, limitations: data.whatsapp.activityLimitReached ? ["O teto de leitura da timeline de WhatsApp foi atingido."] : [], links: [{ label: "Abrir Sala de Comando", href: "/comando" }], truncated: data.total > data.facts.length }];
}
