// Tipos do modulo ESM aiProviders.mjs.
export type AiUsage = { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null };
export type AiResult = { content: string; provider: string; model: string; usage: AiUsage | null } | null;
export type AiModelPreference =
  | { mode: "auto" }
  | { mode: "fixed"; provider: "OpenRouter"; modelId: string };
export type AiProviderPolicy = "free-strict" | "free-then-groq";
export type AiCompleteOptions = {
  signal?: AbortSignal;
  /** Prazo TOTAL da cascata. Ao esgotar, devolve as falhas registradas sem lancar erro. */
  timeoutMs?: number;
  /** Teto de cada chamada de modelo. Estourou: registra `timeout` e tenta o proximo modelo. */
  perModelTimeoutMs?: number;
  /** Teto por provedor, para sobrar tempo para a reserva quando o primeiro trava. */
  perProviderTimeoutMs?: number;
  /** Parametros extras do payload (ex.: response_format, temperature) mesclados por chamada. */
  requestOptions?: Record<string, unknown>;
  modelPreference?: AiModelPreference;
  /** `free-strict`: so OpenRouter gratuito. `free-then-groq` (padrao): OpenRouter gratuito, depois Groq. */
  providerPolicy?: AiProviderPolicy;
  /** Alias de `providerPolicy: "free-strict"`. */
  freeOnly?: boolean;
};

export type AiFailureReason =
  | "missing_key"
  | "no_models"
  | "invalid_key"
  | "no_credit"
  | "model_gone"
  | "rate_limited"
  | "bad_request"
  | "provider_error"
  | "empty_completion"
  | "network_error"
  | "model_not_free"
  | "timeout"
  | "cancelled";

export type AiFailure = {
  provider: string;
  model: string | null;
  status: number | null;
  reason: AiFailureReason;
  detail?: string;
};

export type AiProviderAttempt = {
  provider: string;
  model: string;
  status: "success" | "failed";
  reason: AiFailureReason | null;
  latencyMs: number;
};

export const AI_PROVIDERS: ReadonlyArray<{ name: string; url: string }>;

export function classifyProviderFailure(status: number, bodyText: string): AiFailureReason;
export function describeFailures(failures: readonly AiFailure[]): string;
export function extractRejectedParams(bodyText: string, sentKeys: readonly string[]): string[];

export function aiComplete(
  systemPrompt: string,
  userPrompt: string,
  options?: AiCompleteOptions,
): Promise<AiResult>;

export function aiCompleteDetailed(
  systemPrompt: string,
  userPrompt: string,
  options?: AiCompleteOptions,
): Promise<{ result: AiResult; failures: AiFailure[]; attempts: AiProviderAttempt[] }>;

declare const aiProviders: {
  AI_PROVIDERS: typeof AI_PROVIDERS;
  aiComplete: typeof aiComplete;
  aiCompleteDetailed: typeof aiCompleteDetailed;
  classifyProviderFailure: typeof classifyProviderFailure;
  describeFailures: typeof describeFailures;
};
export default aiProviders;
