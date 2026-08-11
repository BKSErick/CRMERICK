// Tipos do modulo ESM salesCopilot.mjs (Story 032).

export type CopilotQuestionKey =
  | "attention_today"
  | "proposals_at_risk"
  | "deals_without_next_action"
  | "deal_temperature"
  | "funnel_leakage"
  | "recommended_action";

export type CopilotStatementClassification = "fact" | "rule" | "ai_suggestion";
export type CopilotSuggestionKind = "task" | "draft";
export type CopilotAiStatus = "ok" | "unavailable" | "skipped";

export type CopilotEvidence = {
  key: string;
  label: string;
  origin: string;
  value: string;
  observedAt: string | null;
};

export type CopilotFact = { key: string; label: string; value: string | number; unit?: string };

export type CopilotItem = {
  dealId?: number;
  company?: string;
  stage?: string | null;
  rules: string[];
  reasons: string[];
  [extra: string]: unknown;
};

export type CopilotTaskSuggestion = {
  kind: "task";
  dealId: number;
  company: string | null;
  title: string;
  note: string;
  nextActionAt: string;
  nextActionType: string;
  origin: string;
  requiresConfirmation: true;
};

export type CopilotDraftSuggestion = {
  kind: "draft";
  dealId: number;
  company: string | null;
  title: string;
  text: string;
  origin: string;
  requiresConfirmation: true;
};

export type CopilotSuggestion = CopilotTaskSuggestion | CopilotDraftSuggestion;

export type CopilotContext = {
  contractVersion: number;
  question: CopilotQuestionKey;
  questionLabel: string;
  dealId: number | null;
  generatedAt: string;
  period: { from: string | null; to: string | null };
  sources: string[];
  facts: CopilotFact[];
  items: CopilotItem[];
  evidence: CopilotEvidence[];
  limitations: string[];
  suggestions: CopilotSuggestion[];
  dataAvailable: boolean;
};

export type CopilotStatement = {
  classification: CopilotStatementClassification;
  ruleId?: string | null;
  text: string;
  evidenceKeys: string[];
};

export type CopilotAiTrail = {
  status: CopilotAiStatus;
  provider: string | null;
  model: string | null;
  attempts: Array<{ provider: string; model: string; outcome: string; durationMs: number; error?: string }>;
  error: string | null;
};

export type CopilotAnswer = {
  contractVersion: number;
  question: CopilotQuestionKey;
  questionLabel: string;
  dealId: number | null;
  period: { from: string | null; to: string | null };
  generatedAt: string;
  sources: string[];
  statements: CopilotStatement[];
  evidence: CopilotEvidence[];
  limitations: string[];
  suggestions: CopilotSuggestion[];
  dataAvailable: boolean;
  ai: CopilotAiTrail;
};

export type CopilotNormalizedDeal = {
  dealId: number;
  company: string;
  stage: string;
  active: boolean;
  value: number;
  recurring: boolean;
  closeDate: string | null;
  nextActionAt: string | null;
  nextActionNote: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  stageEnteredAt: string | null;
  healthScore: number | null;
  healthClassification: string | null;
  healthConfidence: number | null;
  healthRecommendedAction: string | null;
  healthCalculatedAt: string | null;
  qualification: unknown;
};

export const SALES_COPILOT_CONTRACT_VERSION: number;
export const COPILOT_STAGES: readonly string[];
export const COPILOT_QUESTIONS: readonly { key: CopilotQuestionKey; label: string; requiresDeal: boolean }[];
export const COPILOT_BRIEFING_QUESTIONS: readonly CopilotQuestionKey[];
export const COPILOT_RULES: readonly { id: string; description: string }[];
export const COPILOT_SUGGESTION_KINDS: readonly CopilotSuggestionKind[];
export const COPILOT_FORBIDDEN_EFFECTS: readonly string[];
export const STATEMENT_CLASSIFICATIONS: readonly CopilotStatementClassification[];

export function redactSensitiveText(value: string): string;
export function copilotQuestion(key: string): { key: CopilotQuestionKey; label: string; requiresDeal: boolean };
export function normalizeCopilotDeal(row: unknown): CopilotNormalizedDeal | null;
export function buildCopilotContext(input?: {
  question: string;
  dealId?: number | null;
  now?: string | Date;
  period?: { from?: string | null; to?: string | null };
  deals?: Array<Record<string, unknown>>;
  forecast?: Record<string, unknown> | null;
  losses?: Record<string, unknown> | null;
  lossRecords?: Array<Record<string, unknown>>;
}): CopilotContext;
export function minimizeCopilotContext(context: CopilotContext): Record<string, unknown>;
export function copilotSystemPrompt(): string;
export function copilotUserPrompt(context: CopilotContext): string;
export function buildCopilotAnswer(input: {
  context: CopilotContext;
  narrative?: string | null;
  ai?: Partial<CopilotAiTrail> | null;
}): CopilotAnswer;
export function parseCopilotSuggestions(
  content: string,
  options?: { dealId?: number; company?: string | null; now?: string },
): CopilotSuggestion[];
export function assertCopilotSuggestion(suggestion: unknown): CopilotSuggestion;
export function copilotSuggestionEvent(
  suggestion: CopilotSuggestion,
  context: { actor: string; at?: string; source?: string; question?: string | null },
): {
  id: string;
  type: "copilot.suggestion_accepted";
  dealId: number;
  occurredAt: string;
  source: string;
  payload: Record<string, unknown>;
};

declare const salesCopilot: {
  SALES_COPILOT_CONTRACT_VERSION: typeof SALES_COPILOT_CONTRACT_VERSION;
  COPILOT_QUESTIONS: typeof COPILOT_QUESTIONS;
  COPILOT_BRIEFING_QUESTIONS: typeof COPILOT_BRIEFING_QUESTIONS;
  COPILOT_RULES: typeof COPILOT_RULES;
  COPILOT_SUGGESTION_KINDS: typeof COPILOT_SUGGESTION_KINDS;
  COPILOT_FORBIDDEN_EFFECTS: typeof COPILOT_FORBIDDEN_EFFECTS;
  STATEMENT_CLASSIFICATIONS: typeof STATEMENT_CLASSIFICATIONS;
  assertCopilotSuggestion: typeof assertCopilotSuggestion;
  buildCopilotAnswer: typeof buildCopilotAnswer;
  buildCopilotContext: typeof buildCopilotContext;
  copilotQuestion: typeof copilotQuestion;
  copilotSuggestionEvent: typeof copilotSuggestionEvent;
  copilotSystemPrompt: typeof copilotSystemPrompt;
  copilotUserPrompt: typeof copilotUserPrompt;
  minimizeCopilotContext: typeof minimizeCopilotContext;
  normalizeCopilotDeal: typeof normalizeCopilotDeal;
  parseCopilotSuggestions: typeof parseCopilotSuggestions;
  redactSensitiveText: typeof redactSensitiveText;
};
export default salesCopilot;
