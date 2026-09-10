import type { getCrmSupabaseAdmin } from "./crmSupabase";
import { normalizeEvent, parseRecipientFromDescription, type BrevoEvent } from "./emailFunnel";
import type {
  ManualDispatchCandidate,
  ManualDispatchDependencies,
  ManualEnrollment,
} from "./emailManualDispatch";
import type { EmailAutomationGraph } from "./emailAutomationGraph";

type SupabaseAdmin = ReturnType<typeof getCrmSupabaseAdmin>;
type Row = Record<string, unknown>;

const BREVO_BASE_URL = "https://api.brevo.com/v3";
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const FREE_MAIL = new Set([
  "gmail.com", "hotmail.com", "outlook.com", "live.com", "yahoo.com", "yahoo.com.br",
  "icloud.com", "aol.com", "msn.com", "bol.com.br", "uol.com.br", "terra.com.br",
  "ig.com.br", "globo.com",
]);
const THIRD_PARTY = [
  /contab/i, /contabil/i, /escritcont/i, /escritab/i, /\bescrit/i, /\badv\b/i,
  /advocacia/i, /advogad/i, /juridic/i, /assessoria/i, /consultori/i, /\bcrc\b/i,
  /fiscal/i, /tribut/i,
];
const GENERIC_COMPANY_MAILBOX = /^(contato|comercial|atendimento|financeiro|adm|administracao|faleconosco|sac|vendas|recepcao|secretaria)$/i;
const STOP_EVENT_TYPES = new Set(["hard_bounce", "soft_bounce", "spam", "blocked", "unsubscribed"]);

function lowerEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : "";
}

function domainOf(value: string) {
  return value.split("@")[1]?.toLowerCase() ?? "";
}

function normalize(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function tokens(value: unknown) {
  const stop = new Set(["industria", "industrial", "comercio", "servicos", "servico", "ltda", "eireli", "grupo", "de", "da", "do", "dos", "das"]);
  return normalize(value).split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !stop.has(token));
}

function companyDomain(siteUrl: unknown) {
  const match = String(siteUrl ?? "").match(/^(?:https?:\/\/)?(?:www\.)?([^/:?#]+)/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function qualifiesRecipient(input: { email: string; decisionMaker: unknown; company: unknown; siteUrl: unknown }) {
  const [local, domain] = input.email.split("@");
  if (!local || !domain) return false;
  if (THIRD_PARTY.some((pattern) => pattern.test(local) || pattern.test(domain))) return false;
  const ownDomain = companyDomain(input.siteUrl);
  if (ownDomain && (domain === ownDomain || ownDomain.endsWith(`.${domain}`) || domain.endsWith(`.${ownDomain}`))) return true;
  if (tokens(input.decisionMaker).some((token) => normalize(local).includes(token))) return true;
  if (tokens(input.company).some((token) => normalize(local).includes(token) || domain.includes(token))) return true;
  return GENERIC_COMPANY_MAILBOX.test(local) && !FREE_MAIL.has(domain);
}

function atPath(input: Row, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Row)[key];
  }, input);
}

function passesEntryRules(graph: EmailAutomationGraph, context: Row) {
  for (const node of graph.nodes) {
    const config = node.data.config;
    if (node.data.kind === "rule.has_email" && !lowerEmail(atPath(context, "contact.email"))) return false;
    if (node.data.kind === "rule.stage_equals" && atPath(context, "deal.stage") !== config.value) return false;
    if (node.data.kind !== "rule.field_compare") continue;
    const actual = atPath(context, String(config.field ?? ""));
    if (config.operator === "not_equals" && actual === config.value) return false;
    if (config.operator === "contains" && !String(actual ?? "").includes(String(config.value ?? ""))) return false;
    if ((config.operator === "equals" || !config.operator) && actual !== config.value) return false;
  }
  return true;
}

function mapEnrollment(row: Row): ManualEnrollment {
  return {
    id: Number(row.id),
    automationId: String(row.automation_id),
    automationVersion: Number(row.automation_version),
    dealId: Number(row.deal_id),
    contactId: row.contact_id == null ? null : Number(row.contact_id),
    recipientEmail: String(row.recipient_email),
    company: String(row.company ?? ""),
    contactName: String(row.contact_name ?? ""),
    nextStep: Number(row.next_step),
    startedAt: String(row.started_at),
  };
}

async function fetchBrevoSuppressions(apiKey: string) {
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 86_400_000);
  const headers = { "api-key": apiKey, accept: "application/json" };
  const suppressed = new Map<string, string>();
  for (let offset = 0; offset < 5000; offset += 100) {
    const params = new URLSearchParams({
      limit: "100",
      offset: String(offset),
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      sort: "desc",
    });
    const response = await fetch(`${BREVO_BASE_URL}/smtp/statistics/events?${params}`, {
      headers,
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Auditoria Brevo indisponivel (HTTP ${response.status}). O lote foi bloqueado antes do envio.`);
    const events = ((JSON.parse(text) as { events?: BrevoEvent[] }).events ?? []);
    for (const event of events) {
      const kind = normalizeEvent(event.event);
      const email = lowerEmail(event.email);
      if (email && STOP_EVENT_TYPES.has(kind) && !suppressed.has(email)) suppressed.set(email, kind);
    }
    if (events.length < 100) break;
  }
  return suppressed;
}

async function resolveBrevoSender(apiKey: string) {
  const configuredEmail = lowerEmail(process.env.BREVO_FROM_EMAIL);
  const configuredName = String(process.env.BREVO_FROM_NAME || "Erick Sena").trim();
  if (configuredEmail) return { email: configuredEmail, name: configuredName };

  const headers = { "api-key": apiKey, accept: "application/json" };
  const [senderResponse, domainResponse] = await Promise.all([
    fetch(`${BREVO_BASE_URL}/senders`, { headers, cache: "no-store" }),
    fetch(`${BREVO_BASE_URL}/senders/domains`, { headers, cache: "no-store" }),
  ]);
  if (!senderResponse.ok) throw new Error(`Nao foi possivel consultar remetentes Brevo (HTTP ${senderResponse.status}).`);
  const senders = ((await senderResponse.json()) as { senders?: Array<{ email?: string; name?: string; active?: boolean }> }).senders ?? [];
  const domains = domainResponse.ok
    ? ((await domainResponse.json()) as { domains?: Array<{ domain_name?: string; domain?: string; authenticated?: boolean; verified?: boolean }> }).domains ?? []
    : [];
  const authenticated = new Set(domains
    .filter((domain) => domain.authenticated && domain.verified)
    .map((domain) => String(domain.domain_name || domain.domain || "").toLowerCase()));
  const active = senders.filter((sender) => sender.active && lowerEmail(sender.email));
  const candidates = active.length ? active : senders.filter((sender) => lowerEmail(sender.email));
  const selected = candidates.find((sender) => authenticated.has(domainOf(lowerEmail(sender.email))))
    ?? candidates.find((sender) => !FREE_MAIL.has(domainOf(lowerEmail(sender.email))))
    ?? candidates[0];
  if (!selected) throw new Error("Nenhum remetente verificado foi encontrado no Brevo.");
  return { email: lowerEmail(selected.email), name: String(selected.name || configuredName) };
}

function firstRow(value: unknown): Row | null {
  if (Array.isArray(value)) return (value[0] as Row | undefined) ?? null;
  return value && typeof value === "object" ? value as Row : null;
}

export function createManualDispatchDependencies(supabase: SupabaseAdmin): ManualDispatchDependencies {
  const apiKey = process.env.BREVO_API_KEY || "";
  let suppressionPromise: Promise<Map<string, string>> | null = null;
  let senderPromise: ReturnType<typeof resolveBrevoSender> | null = null;

  return {
    async getAutomation(automationId) {
      const result = await supabase.from("email_automations")
        .select("id, version, status, graph")
        .eq("id", automationId)
        .maybeSingle();
      if (result.error) throw new Error(result.error.message);
      return result.data as { id: string; version: number; status: string; graph: EmailAutomationGraph } | null;
    },

    async bootstrapExistingFirstSteps({ automationId, automationVersion, firstFollowupDueAfterMinutes, now }) {
      const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
      const sentResult = await supabase.from("activities")
        .select("deal_id, contact_id, description, metadata, created_at")
        .eq("type", "email_sent")
        .gte("created_at", since)
        .ilike("description", "%: Uma pergunta sobre as indicações da %")
        .order("created_at", { ascending: true })
        .limit(5000);
      if (sentResult.error) throw new Error(sentResult.error.message);
      const legacy = ((sentResult.data ?? []) as Row[]).filter((row) => {
        const metadata = row.metadata as Row | null;
        return !metadata?.automation_id;
      });
      const dealIds = [...new Set(legacy.map((row) => Number(row.deal_id)).filter((id) => Number.isInteger(id) && id > 0))];
      if (!dealIds.length) return 0;
      const dealsResult = await supabase.from("deals")
        .select("id, contact_id, company, decisor_nome")
        .in("id", dealIds);
      if (dealsResult.error) throw new Error(dealsResult.error.message);
      const deals = new Map(((dealsResult.data ?? []) as Row[]).map((deal) => [Number(deal.id), deal]));
      const contactIds = [...new Set([...deals.values()].map((deal) => Number(deal.contact_id)).filter((id) => Number.isInteger(id) && id > 0))];
      const contactsResult = contactIds.length
        ? await supabase.from("contacts").select("id, name").in("id", contactIds)
        : { data: [], error: null };
      if (contactsResult.error) throw new Error(contactsResult.error.message);
      const contacts = new Map(((contactsResult.data ?? []) as Row[]).map((contact) => [Number(contact.id), contact]));
      const rows: Row[] = [];
      const seen = new Set<string>();
      for (const activity of legacy) {
        const recipientEmail = lowerEmail(parseRecipientFromDescription(String(activity.description ?? "")));
        const deal = deals.get(Number(activity.deal_id));
        if (!recipientEmail || seen.has(recipientEmail) || !deal) continue;
        seen.add(recipientEmail);
        const sentAt = new Date(String(activity.created_at));
        if (Number.isNaN(sentAt.getTime())) continue;
        const contact = contacts.get(Number(deal.contact_id));
        rows.push({
          automation_id: automationId,
          automation_version: automationVersion,
          deal_id: Number(deal.id),
          contact_id: Number.isInteger(Number(deal.contact_id)) ? Number(deal.contact_id) : null,
          recipient_email: recipientEmail,
          company: String(deal.company ?? ""),
          contact_name: String(deal.decisor_nome || contact?.name || ""),
          started_at: sentAt.toISOString(),
          next_step: 1,
          next_due_at: new Date(sentAt.getTime() + firstFollowupDueAfterMinutes * 60_000).toISOString(),
        });
      }
      if (!rows.length) return 0;
      const inserted = await supabase.from("email_automation_enrollments")
        .upsert(rows, { onConflict: "automation_id,recipient_email", ignoreDuplicates: true });
      if (inserted.error) throw new Error(inserted.error.message);
      return rows.length;
    },

    async getDailyUsage(now) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(now);
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
      const day = `${part("year")}-${part("month")}-${part("day")}`;
      const start = new Date(`${day}T00:00:00-03:00`).toISOString();
      const result = await supabase.from("activities")
        .select("id", { count: "exact", head: true })
        .eq("type", "email_sent")
        .gte("created_at", start);
      if (result.error) throw new Error(result.error.message);
      return result.count ?? 0;
    },

    async listDueEnrollments({ automationId, automationVersion, now, limit }) {
      const result = await supabase.from("email_automation_enrollments")
        .select("id, automation_id, automation_version, deal_id, contact_id, recipient_email, company, contact_name, next_step, started_at")
        .eq("automation_id", automationId)
        .eq("automation_version", automationVersion)
        .eq("status", "pending")
        .lte("next_due_at", now.toISOString())
        .order("next_due_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(limit);
      if (result.error) throw new Error(result.error.message);
      return (result.data ?? []).map((row) => mapEnrollment(row as Row));
    },

    async listNewCandidates({ automationId, graph, limit }) {
      const dealsResult = await supabase.from("deals")
        .select("id, contact_id, company, stage, setor, porte, points, decisor_nome, email_receita, site_url")
        .eq("setor", "industria")
        .neq("stage", "lost")
        .order("points", { ascending: false })
        .order("id", { ascending: true })
        .limit(1000);
      if (dealsResult.error) throw new Error(dealsResult.error.message);
      const deals = (dealsResult.data ?? []) as Row[];
      const dealIds = deals.map((deal) => Number(deal.id)).filter(Number.isInteger);
      const contactIds = deals.map((deal) => Number(deal.contact_id)).filter((id) => Number.isInteger(id) && id > 0);

      const [contactsResult, interactionsResult, messagesResult, enrollmentsResult, sentResult] = await Promise.all([
        contactIds.length
          ? supabase.from("contacts").select("id, name, email, city").in("id", contactIds)
          : Promise.resolve({ data: [], error: null }),
        dealIds.length
          ? supabase.from("activities").select("deal_id, type").in("deal_id", dealIds)
          : Promise.resolve({ data: [], error: null }),
        dealIds.length
          ? supabase.from("messages").select("deal_id, direction, channel").in("deal_id", dealIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("email_automation_enrollments").select("recipient_email").eq("automation_id", automationId),
        supabase.from("activities").select("description").eq("type", "email_sent").order("created_at", { ascending: false }).limit(5000),
      ]);
      for (const result of [contactsResult, interactionsResult, messagesResult, enrollmentsResult, sentResult]) {
        if (result.error) throw new Error(result.error.message);
      }

      const contacts = new Map(((contactsResult.data ?? []) as Row[]).map((contact) => [Number(contact.id), contact]));
      const approached = new Set<number>();
      const replied = new Set<number>();
      for (const activity of (interactionsResult.data ?? []) as Row[]) {
        const dealId = Number(activity.deal_id);
        if (["whatsapp_sent", "whatsapp_sent_sync"].includes(String(activity.type))) approached.add(dealId);
        if (["whatsapp_received", "email_received"].includes(String(activity.type))) replied.add(dealId);
      }
      for (const message of (messagesResult.data ?? []) as Row[]) {
        const dealId = Number(message.deal_id);
        if (message.direction === "sent" && message.channel !== "email") approached.add(dealId);
        if (message.direction === "received") replied.add(dealId);
      }

      const usedEmails = new Set<string>();
      for (const enrollment of (enrollmentsResult.data ?? []) as Row[]) {
        const email = lowerEmail(enrollment.recipient_email);
        if (email) usedEmails.add(email);
      }
      for (const activity of (sentResult.data ?? []) as Row[]) {
        const email = lowerEmail(parseRecipientFromDescription(String(activity.description ?? "")));
        if (email) usedEmails.add(email);
      }
      const usedDomains = new Set([...usedEmails].map(domainOf).filter((domain) => domain && !FREE_MAIL.has(domain)));
      const candidates: Array<ManualDispatchCandidate & { score: number; named: boolean }> = [];
      for (const deal of deals) {
        const dealId = Number(deal.id);
        if (!approached.has(dealId) || replied.has(dealId)) continue;
        const contact = contacts.get(Number(deal.contact_id)) ?? {};
        const recipientEmail = lowerEmail(deal.email_receita) || lowerEmail(contact.email);
        if (!recipientEmail || usedEmails.has(recipientEmail)) continue;
        const domain = domainOf(recipientEmail);
        if (domain && !FREE_MAIL.has(domain) && usedDomains.has(domain)) continue;
        if (!qualifiesRecipient({
          email: recipientEmail,
          decisionMaker: deal.decisor_nome,
          company: deal.company,
          siteUrl: deal.site_url,
        })) continue;
        const context = { contact: { ...contact, email: recipientEmail }, deal, email: { followup_eligible: true } };
        if (!passesEntryRules(graph, context)) continue;
        candidates.push({
          dealId,
          contactId: Number.isInteger(Number(contact.id)) ? Number(contact.id) : null,
          recipientEmail,
          company: String(deal.company ?? ""),
          contactName: String(deal.decisor_nome || contact.name || ""),
          score: Number(deal.points) || 0,
          named: tokens(deal.decisor_nome).some((token) => normalize(recipientEmail.split("@")[0]).includes(token)),
        });
        usedEmails.add(recipientEmail);
        if (domain && !FREE_MAIL.has(domain)) usedDomains.add(domain);
      }
      candidates.sort((a, b) => Number(b.named) - Number(a.named) || b.score - a.score || a.dealId - b.dealId);
      return candidates.slice(0, limit).map((candidate) => ({
        dealId: candidate.dealId,
        contactId: candidate.contactId,
        recipientEmail: candidate.recipientEmail,
        company: candidate.company,
        contactName: candidate.contactName,
      }));
    },

    async ensureEnrollment(candidate, { automationId, automationVersion, now }) {
      const payload = {
        automation_id: automationId,
        automation_version: automationVersion,
        deal_id: candidate.dealId,
        contact_id: candidate.contactId,
        recipient_email: candidate.recipientEmail,
        company: candidate.company,
        contact_name: candidate.contactName,
        next_step: 0,
        next_due_at: now.toISOString(),
        started_at: now.toISOString(),
      };
      const inserted = await supabase.from("email_automation_enrollments")
        .upsert(payload, { onConflict: "automation_id,recipient_email", ignoreDuplicates: true })
        .select("id, automation_id, automation_version, deal_id, contact_id, recipient_email, company, contact_name, next_step, started_at")
        .maybeSingle();
      if (inserted.error) throw new Error(inserted.error.message);
      let row = inserted.data as Row | null;
      if (!row) {
        const existing = await supabase.from("email_automation_enrollments")
          .select("id, automation_id, automation_version, deal_id, contact_id, recipient_email, company, contact_name, next_step, started_at")
          .eq("automation_id", automationId)
          .eq("recipient_email", candidate.recipientEmail)
          .single();
        if (existing.error) throw new Error(existing.error.message);
        row = existing.data as Row;
      }
      return mapEnrollment(row);
    },

    async suppressionReason(enrollment) {
      const [dealResult, messageResult, activityResult] = await Promise.all([
        supabase.from("deals").select("stage, status").eq("id", enrollment.dealId).maybeSingle(),
        supabase.from("messages").select("id").eq("deal_id", enrollment.dealId).eq("direction", "received").limit(1),
        supabase.from("activities").select("id").eq("deal_id", enrollment.dealId).in("type", ["whatsapp_received", "email_received"]).limit(1),
      ]);
      for (const result of [dealResult, messageResult, activityResult]) {
        if (result.error) throw new Error(result.error.message);
      }
      const deal = dealResult.data as Row | null;
      if (!deal || deal.stage === "lost" || deal.status === "lost") return "deal_lost";
      if ((messageResult.data?.length ?? 0) > 0 || (activityResult.data?.length ?? 0) > 0) return "lead_replied";
      if (!apiKey) throw new Error("BREVO_API_KEY ausente no servidor. O lote foi bloqueado antes do envio.");
      suppressionPromise ??= fetchBrevoSuppressions(apiKey);
      return (await suppressionPromise).get(enrollment.recipientEmail) ?? null;
    },

    async stopEnrollment(enrollmentId, reason) {
      const result = await supabase.from("email_automation_enrollments")
        .update({ status: reason === "sequence_completed" ? "completed" : "stopped", stop_reason: reason })
        .eq("id", enrollmentId)
        .eq("status", "pending");
      if (result.error) throw new Error(result.error.message);
    },

    async claimDispatch(input) {
      const idempotencyKey = `${input.automationId}:${input.automationVersion}:${input.enrollment.id}:${input.step.stepIndex}`;
      const result = await supabase.rpc("claim_email_automation_dispatch", {
        p_automation_id: input.automationId,
        p_automation_version: input.automationVersion,
        p_enrollment_id: input.enrollment.id,
        p_node_id: input.step.nodeId,
        p_step_index: input.step.stepIndex,
        p_recipient_email: input.recipientEmail,
        p_subject: input.subject,
        p_html: input.html,
        p_idempotency_key: idempotencyKey,
        p_actor: input.actor,
        p_daily_cap: input.dailyCap,
      });
      if (result.error) throw new Error(result.error.message);
      const row = firstRow(result.data);
      if (!row) return null;
      return { id: Number(row.dispatch_id), idempotencyKey: String(row.idempotency_key) };
    },

    async sendEmail(message) {
      if (!apiKey) throw new Error("BREVO_API_KEY ausente no servidor.");
      senderPromise ??= resolveBrevoSender(apiKey);
      const sender = await senderPromise;
      const replyTo = lowerEmail(process.env.EMAIL_AUTOMATION_REPLY_TO) || sender.email;
      const response = await fetch(`${BREVO_BASE_URL}/smtp/email`, {
        method: "POST",
        headers: { "api-key": apiKey, accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          sender,
          to: [{ email: message.recipientEmail, name: message.enrollment.company }],
          replyTo: { email: replyTo, name: sender.name },
          subject: message.subject,
          htmlContent: message.html,
          tags: ["mydrion-crm", "automation-manual"],
          headers: {
            "Idempotency-Key": message.idempotencyKey,
            "List-Unsubscribe": `<mailto:${replyTo}?subject=sair>`,
          },
        }),
        cache: "no-store",
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Brevo recusou o envio (HTTP ${response.status}): ${text.slice(0, 160)}`);
      const messageId = String((JSON.parse(text) as { messageId?: string }).messageId ?? "").trim();
      if (!messageId) throw new Error("Brevo nao devolveu o identificador do envio.");
      return { messageId };
    },

    async completeDispatch(input) {
      const result = await supabase.rpc("complete_email_automation_dispatch", {
        p_dispatch_id: input.dispatchId,
        p_provider_message_id: input.messageId,
        p_next_step: input.nextStep,
        p_next_due_at: input.nextDueAt,
        p_completed: input.completed,
      });
      if (result.error) throw new Error(`E-mail enviado, mas a confirmacao no CRM falhou: ${result.error.message}`);
    },

    async markDispatchUncertain(dispatchId, error) {
      const result = await supabase.from("email_automation_dispatches")
        .update({ status: "uncertain", error: error.slice(0, 1000) })
        .eq("id", dispatchId)
        .eq("status", "claimed");
      if (result.error) throw new Error(result.error.message);
    },
  };
}
