// Tipos do servico ESM salesCopilotService.mjs (Story 032).
import type { CopilotAnswer, CopilotAiTrail, CopilotContext, CopilotSuggestion } from "./salesCopilot.mjs";

export type CopilotCompletion = (
  systemPrompt: string,
  userPrompt: string,
  options: { signal?: AbortSignal; timeoutMs: number },
) => Promise<{ content: string; provider?: string; model?: string } | null>;

export type CopilotRequestOptions = {
  question?: string;
  dealId?: number | null;
  from?: string;
  to?: string;
  now?: string | Date;
  complete?: CopilotCompletion;
  withNarrative?: boolean;
  timeoutMs?: number;
  attempts?: number;
};

export type CopilotBriefing = {
  contractVersion: number;
  generatedAt: string;
  period: { from: string; to: string };
  answers: CopilotAnswer[];
  limitations: string[];
};

export type CopilotApplyResult = {
  contractVersion: number;
  event: Record<string, unknown> | null;
  duplicate: boolean;
  decisions: Array<Record<string, unknown>>;
  appliedBy: string;
};

export const COPILOT_DEAL_SELECT: string;
export const COPILOT_DEFAULT_TIMEOUT_MS: number;
export const COPILOT_DEFAULT_ATTEMPTS: number;

export function currentMonthPeriod(now?: Date | string): { from: string; to: string };
export function loadCopilotContext(supabase: unknown, options?: CopilotRequestOptions): Promise<CopilotContext>;
export function runCopilotNarrative(
  complete: CopilotCompletion | undefined,
  context: CopilotContext,
  options?: { timeoutMs?: number; attempts?: number },
): Promise<CopilotAiTrail & { content: string | null }>;
export function answerCopilotQuestion(supabase: unknown, options?: CopilotRequestOptions): Promise<CopilotAnswer>;
export function buildCopilotBriefing(
  supabase: unknown,
  options?: CopilotRequestOptions & { questions?: string[] },
): Promise<CopilotBriefing>;
export function draftCopilotSuggestions(supabase: unknown, options?: CopilotRequestOptions): Promise<CopilotAnswer>;
export function applyCopilotSuggestion(
  supabase: unknown,
  options: { suggestion: CopilotSuggestion; actor: string; confirmed: boolean; at?: string; question?: string | null; source?: string },
): Promise<CopilotApplyResult>;
export function saveCopilotLearning(
  supabase: unknown,
  options: { content: string; actor: string; confirmed: boolean; dealId?: number | null; company?: string | null },
): Promise<Record<string, unknown>>;

declare const salesCopilotService: {
  COPILOT_DEAL_SELECT: typeof COPILOT_DEAL_SELECT;
  COPILOT_DEFAULT_ATTEMPTS: typeof COPILOT_DEFAULT_ATTEMPTS;
  COPILOT_DEFAULT_TIMEOUT_MS: typeof COPILOT_DEFAULT_TIMEOUT_MS;
  answerCopilotQuestion: typeof answerCopilotQuestion;
  applyCopilotSuggestion: typeof applyCopilotSuggestion;
  buildCopilotBriefing: typeof buildCopilotBriefing;
  currentMonthPeriod: typeof currentMonthPeriod;
  draftCopilotSuggestions: typeof draftCopilotSuggestions;
  loadCopilotContext: typeof loadCopilotContext;
  runCopilotNarrative: typeof runCopilotNarrative;
  saveCopilotLearning: typeof saveCopilotLearning;
};
export default salesCopilotService;
