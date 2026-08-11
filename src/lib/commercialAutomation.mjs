export const COMMERCIAL_AUTOMATION_CONTRACT_VERSION = 1;

export const EVENT_TYPES = Object.freeze([
  "message.received",
  "message.sent",
  "deal.stage_changed",
  "deal.score_updated",
  "deal.next_action_due",
  "meeting.status_changed",
  "deal.qualification_updated",
]);

export const ACTION_TYPES = Object.freeze([
  "task.upsert",
  "priority.set",
  "draft.create",
  "alert.create",
  "confirmation.request",
]);

const CONDITION_OPERATORS = new Set([
  "equals",
  "not_equals",
  "in",
  "exists",
  "gt",
  "gte",
  "lt",
  "lte",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function valueAtPath(context, path) {
  return String(path)
    .split(".")
    .reduce((value, key) => (isRecord(value) ? value[key] : undefined), context);
}

function conditionMatches(condition, context) {
  if (!condition || !CONDITION_OPERATORS.has(condition.operator)) return false;
  const actual = valueAtPath(context, condition.field);
  const expected = condition.value;

  switch (condition.operator) {
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "exists":
      return expected === false ? actual == null : actual != null;
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    default:
      return false;
  }
}

function resolveValue(value, context) {
  if (typeof value === "string" && value.startsWith("$")) {
    return valueAtPath(context, value.slice(1));
  }
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, context));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveValue(item, context)]),
    );
  }
  return value;
}

function actionGuard(action, deal) {
  if (!action || !ACTION_TYPES.includes(action.type)) return "action_not_allowed";
  if (action.type === "task.upsert" && deal?.next_action_source === "manual") {
    return "manual_next_action_preserved";
  }
  if (action.type === "priority.set" && deal?.priority_source === "manual") {
    return "manual_priority_preserved";
  }
  return null;
}

export function createCommercialEvent(input) {
  const id = typeof input?.id === "string" ? input.id.trim() : "";
  const type = typeof input?.type === "string" ? input.type.trim() : "";
  if (!id) throw new Error("id do evento comercial e obrigatorio.");
  if (!EVENT_TYPES.includes(type)) throw new Error(`Tipo de evento nao suportado: ${type || "vazio"}.`);

  const dealId = Number(input?.dealId);
  const occurredAt = input?.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) throw new Error("occurredAt invalido.");

  return {
    contractVersion: COMMERCIAL_AUTOMATION_CONTRACT_VERSION,
    id,
    type,
    dealId: Number.isInteger(dealId) && dealId > 0 ? dealId : null,
    occurredAt: occurredAt.toISOString(),
    source: typeof input?.source === "string" && input.source.trim() ? input.source.trim() : "crm",
    payload: isRecord(input?.payload) ? input.payload : {},
  };
}

export function executionKey(event, rule) {
  return `${event.id}:${rule.id}:v${Number(rule.version) || 1}`;
}

export function evaluateCommercialEvent({ event: rawEvent, rules = [], deal = null }) {
  const event = createCommercialEvent(rawEvent);
  const context = { event, deal: deal ?? {} };

  return [...rules]
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
    .map((rule) => {
      const base = {
        eventId: event.id,
        eventType: event.type,
        dealId: event.dealId,
        ruleId: String(rule.id),
        ruleVersion: Number(rule.version) || 1,
        executionKey: executionKey(event, rule),
        action: {
          type: String(rule.action?.type ?? ""),
          payload: resolveValue(rule.action?.payload ?? {}, context),
        },
      };

      if (!rule.enabled) return { ...base, status: "skipped", reason: "rule_disabled" };
      if (rule.eventType !== event.type) {
        return { ...base, status: "skipped", reason: "event_type_mismatch" };
      }
      const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
      if (!conditions.every((condition) => conditionMatches(condition, context))) {
        return { ...base, status: "skipped", reason: "conditions_not_met" };
      }
      const guardReason = actionGuard(base.action, deal);
      if (guardReason) return { ...base, status: "skipped", reason: guardReason };
      return { ...base, status: "planned", reason: "conditions_met" };
    });
}

export async function executeActionPlan(decisions, executor) {
  const results = [];
  for (const decision of decisions) {
    if (decision.status !== "planned") {
      results.push(decision);
      continue;
    }
    try {
      const result = await executor(decision);
      results.push({ ...decision, ...result });
    } catch (error) {
      results.push({
        ...decision,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

const commercialAutomation = {
  COMMERCIAL_AUTOMATION_CONTRACT_VERSION,
  EVENT_TYPES,
  ACTION_TYPES,
  createCommercialEvent,
  evaluateCommercialEvent,
  executeActionPlan,
  executionKey,
};

export default commercialAutomation;
