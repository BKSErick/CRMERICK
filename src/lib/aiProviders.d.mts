// Tipos do modulo ESM aiProviders.mjs.
export type AiResult = { content: string; provider: string; model: string } | null;
export type AiCompleteOptions = { signal?: AbortSignal; timeoutMs?: number };

export const AI_PROVIDERS: ReadonlyArray<{ name: string; url: string; models: readonly string[] }>;
export function aiComplete(
  systemPrompt: string,
  userPrompt: string,
  options?: AiCompleteOptions,
): Promise<AiResult>;

declare const aiProviders: { AI_PROVIDERS: typeof AI_PROVIDERS; aiComplete: typeof aiComplete };
export default aiProviders;
