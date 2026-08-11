import {
  createCommercialEvent,
  evaluateCommercialEvent,
  executeActionPlan,
} from "./commercialAutomation.mjs";
import { recalculateDealHealthBestEffort } from "./dealHealthService.mjs";

const RULE_SELECT = "id, name, description, version, event_type, conditions, action_type, action_payload, enabled";
const DEAL_SELECT = "id, company, priority, priority_source, next_action_at, next_action_type, next_action_note, next_action_source";

function ruleFromRow(row) {
  return {
    id: String(row.id),
    name: String(row.name ?? row.id),
    description: String(row.description ?? ""),
    version: Number(row.version) || 1,
    eventType: String(row.event_type),
    enabled: Boolean(row.enabled),
    conditions: Array.isArray(row.conditions) ? row.conditions : [],
    action: {
      type: String(row.action_type),
      payload: row.action_payload && typeof row.action_payload === "object" ? row.action_payload : {},
    },
  };
}

export async function listCommercialAutomationRules(supabase) {
  const result = await supabase
    .from("commercial_automation_rules")
    .select(RULE_SELECT)
    .order("name", { ascending: true });
  if (result.error) throw result.error;
  return (result.data ?? []).map(ruleFromRow);
}

async function loadDeal(supabase, dealId) {
  if (!dealId) return null;
  const result = await supabase.from("deals").select(DEAL_SELECT).eq("id", dealId).maybeSingle();
  if (result.error) throw result.error;
  return result.data ?? null;
}

async function insertActivity(supabase, decision, type, description, extraMetadata = {}) {
  const result = await supabase.from("activities").insert({
    deal_id: decision.dealId,
    type,
    description,
    metadata: {
      automation: true,
      event_id: decision.eventId,
      rule_id: decision.ruleId,
      rule_version: decision.ruleVersion,
      action_type: decision.action.type,
      ...extraMetadata,
    },
  });
  if (result.error) throw result.error;
}

async function applyCommercialAction(supabase, decision) {
  const payload = decision.action.payload ?? {};
  if (!decision.dealId) throw new Error("Acao comercial exige dealId.");

  if (decision.action.type === "task.upsert") {
    const nextActionAt = typeof payload.nextActionAt === "string" ? payload.nextActionAt : null;
    const nextActionType = typeof payload.nextActionType === "string" ? payload.nextActionType : null;
    const note = typeof payload.note === "string" ? payload.note : "Tarefa criada pela automacao comercial.";
    const updated = await supabase
      .from("deals")
      .update({
        next_action_at: nextActionAt,
        next_action_type: nextActionType,
        next_action_note: note,
        next_action_source: "automatic",
      })
      .eq("id", decision.dealId);
    if (updated.error) throw updated.error;
    await insertActivity(supabase, decision, "automation_task_upserted", note, {
      next_action_at: nextActionAt,
      next_action_type: nextActionType,
    });
    return { status: "applied", reason: "task_upserted" };
  }

  if (decision.action.type === "priority.set") {
    const priority = typeof payload.priority === "string" ? payload.priority.trim() : "";
    if (!priority) throw new Error("priority.set exige priority.");
    const updated = await supabase
      .from("deals")
      .update({ priority, priority_source: "automatic" })
      .eq("id", decision.dealId);
    if (updated.error) throw updated.error;
    await insertActivity(supabase, decision, "automation_priority_set", `Prioridade automatica: ${priority}`, {
      priority,
    });
    return { status: "applied", reason: "priority_set" };
  }

  if (decision.action.type === "draft.create") {
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) throw new Error("draft.create exige text.");
    await insertActivity(supabase, decision, "automation_draft_created", text);
    return { status: "applied", reason: "draft_created" };
  }

  if (decision.action.type === "alert.create") {
    const message = typeof payload.message === "string" ? payload.message.trim() : "Alerta comercial.";
    await insertActivity(supabase, decision, "automation_alert", message);
    return { status: "applied", reason: "alert_created" };
  }

  if (decision.action.type === "confirmation.request") {
    const message = typeof payload.message === "string" ? payload.message.trim() : "Confirmacao comercial pendente.";
    await insertActivity(supabase, decision, "automation_confirmation_requested", message);
    return { status: "awaiting_confirmation", reason: "confirmation_requested" };
  }

  throw new Error(`Acao nao autorizada: ${decision.action.type}.`);
}

async function persistExecution(supabase, eventDbId, decision) {
  const result = await supabase.from("commercial_automation_runs").insert({
    event_id: eventDbId,
    execution_key: decision.executionKey,
    deal_id: decision.dealId,
    rule_id: decision.ruleId,
    rule_version: decision.ruleVersion,
    event_type: decision.eventType,
    action_type: decision.action.type,
    action_payload: decision.action.payload,
    status: decision.status,
    reason: decision.reason,
  });
  if (result.error) throw result.error;
}

export async function processCommercialEvent(supabase, input, options = {}) {
  const event = createCommercialEvent(input);
  const apply = options.apply === true;

  const [rules, deal] = await Promise.all([
    listCommercialAutomationRules(supabase),
    loadDeal(supabase, event.dealId),
  ]);
  const decisions = evaluateCommercialEvent({ event, rules, deal });

  if (!apply) {
    return { event, mode: "dry-run", duplicate: false, decisions };
  }

  const inserted = await supabase
    .from("commercial_events")
    .insert({
      external_key: event.id,
      contract_version: event.contractVersion,
      event_type: event.type,
      deal_id: event.dealId,
      source: event.source,
      occurred_at: event.occurredAt,
      payload: event.payload,
    })
    .select("id")
    .single();

  if (inserted.error?.code === "23505") {
    return { event, mode: "apply", duplicate: true, decisions: [] };
  }
  if (inserted.error) throw inserted.error;

  const results = await executeActionPlan(decisions, (decision) => applyCommercialAction(supabase, decision));
  for (const result of results) {
    await persistExecution(supabase, inserted.data.id, result);
  }

  if (event.dealId) {
    await recalculateDealHealthBestEffort(supabase, event.dealId, { apply: true });
  }

  return { event, mode: "apply", duplicate: false, decisions: results };
}

export async function processCommercialEventBestEffort(supabase, input, options = {}) {
  try {
    return await processCommercialEvent(supabase, input, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Falha na automacao comercial ${input.id}:`, error);
    if (input.dealId) {
      const audit = await supabase.from("activities").insert({
        deal_id: input.dealId,
        type: "automation_event_failed",
        description: `Evento comercial nao processado: ${message}`,
        metadata: {
          automation: true,
          event_id: input.id,
          event_type: input.type,
          error: message,
        },
      });
      if (audit.error) console.error("Falha ao auditar erro da automacao comercial:", audit.error);
    }
    return { event: null, mode: options.apply === true ? "apply" : "dry-run", duplicate: false, decisions: [], failed: true, error: message };
  }
}

export async function scanDueCommercialEvents(supabase, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("Data de varredura invalida.");
  const query = await supabase
    .from("deals")
    .select("id, next_action_at, next_action_type, next_action_note")
    .lte("next_action_at", now.toISOString())
    .not("next_action_at", "is", null)
    .not("stage", "in", "(won,lost)")
    .order("next_action_at", { ascending: true })
    .limit(1000);
  if (query.error) throw query.error;

  const results = [];
  for (const deal of query.data ?? []) {
    results.push(await processCommercialEvent(supabase, {
      id: `due:${deal.id}:${deal.next_action_at}`,
      type: "deal.next_action_due",
      dealId: Number(deal.id),
      occurredAt: now.toISOString(),
      source: "commercial-automation-cli",
      payload: {
        nextActionAt: deal.next_action_at,
        nextActionType: deal.next_action_type,
        note: deal.next_action_note,
      },
    }, { apply: options.apply === true }));
  }
  return results;
}
