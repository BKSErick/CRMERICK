// Tipos do modulo ESM commercialAutomation.mjs.
export type CommercialEventType =
  | "message.received"
  | "message.sent"
  | "deal.stage_changed"
  | "deal.score_updated"
  | "deal.next_action_due"
  | "meeting.status_changed";

export type CommercialActionType =
  | "task.upsert"
  | "priority.set"
  | "draft.create"
  | "alert.create"
  | "confirmation.request";

export type CommercialCondition = {
  field: string;
  operator: "equals" | "not_equals" | "in" | "exists" | "gt" | "gte" | "lt" | "lte";
  value?: unknown;
};

export type CommercialAction = { type: CommercialActionType | string; payload: Record<string, unknown> };
export type CommercialEvent = {
  contractVersion: 1;
  id: string;
  type: CommercialEventType;
  dealId: number | null;
  occurredAt: string;
  source: string;
  payload: Record<string, unknown>;
};
export type CommercialRule = {
  id: string;
  version: number;
  eventType: CommercialEventType;
  enabled: boolean;
  conditions: CommercialCondition[];
  action: CommercialAction;
  name?: string;
  description?: string;
};
export type CommercialDecision = {
  eventId: string;
  eventType: CommercialEventType;
  dealId: number | null;
  ruleId: string;
  ruleVersion: number;
  executionKey: string;
  action: CommercialAction;
  status: "planned" | "skipped" | "applied" | "failed" | "awaiting_confirmation";
  reason: string;
};

export const COMMERCIAL_AUTOMATION_CONTRACT_VERSION: 1;
export const EVENT_TYPES: readonly CommercialEventType[];
export const ACTION_TYPES: readonly CommercialActionType[];
export function createCommercialEvent(input: Omit<Partial<CommercialEvent>, "type"> & { id: string; type: string }): CommercialEvent;
export function executionKey(event: CommercialEvent, rule: CommercialRule): string;
export function evaluateCommercialEvent(input: {
  event: CommercialEvent;
  rules?: CommercialRule[];
  deal?: Record<string, unknown> | null;
}): CommercialDecision[];
export function executeActionPlan(
  decisions: CommercialDecision[],
  executor: (decision: CommercialDecision) => Promise<Partial<CommercialDecision>>,
): Promise<CommercialDecision[]>;

declare const commercialAutomation: {
  COMMERCIAL_AUTOMATION_CONTRACT_VERSION: typeof COMMERCIAL_AUTOMATION_CONTRACT_VERSION;
  EVENT_TYPES: typeof EVENT_TYPES;
  ACTION_TYPES: typeof ACTION_TYPES;
  createCommercialEvent: typeof createCommercialEvent;
  executionKey: typeof executionKey;
  evaluateCommercialEvent: typeof evaluateCommercialEvent;
  executeActionPlan: typeof executeActionPlan;
};
export default commercialAutomation;
