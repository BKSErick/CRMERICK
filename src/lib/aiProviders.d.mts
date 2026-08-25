// Tipos do modulo ESM aiProviders.mjs.
export type AiResult = { content: string; provider: string; model: string } | null;
export type AiCompleteOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Parametros extras do payload (ex.: response_format, temperature) mesclados por chamada. */
  requestOptions?: Record<string, unknown>;
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
  | "network_error";

export type AiFailure = {
  provider: string;
  model: string | null;
  status: number | null;
  reason: AiFailureReason;
  detail?: string;
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
): Promise<{ result: AiResult; failures: AiFailure[] }>;

declare const aiProviders: {
  AI_PROVIDERS: typeof AI_PROVIDERS;
  aiComplete: typeof aiComplete;
  aiCompleteDetailed: typeof aiCompleteDetailed;
  classifyProviderFailure: typeof classifyProviderFailure;
  describeFailures: typeof describeFailures;
};
export default aiProviders;
