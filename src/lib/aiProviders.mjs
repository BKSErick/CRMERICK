// Cascata de provedores/free models do CRM. Vive em .mjs para ser reusada tanto pelas
// rotas (via src/lib/aiComplete.ts) quanto pelos CLIs, sem duplicar a lista de modelos.
// Story 032 acrescentou o teto de tempo opcional: sem opcoes, o comportamento e o de antes.

const PROVIDERS = [
  {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    getKey: () => process.env.OPENROUTER_API_KEY,
    models: ["google/gemini-2.5-flash:free", "meta-llama/llama-3-8b-instruct:free", "qwen/qwen-2-7b-instruct:free"],
    requestOptions: { max_tokens: 1800 },
    getHeaders: (key) => ({
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://crmerick.vercel.app",
      "X-Title": "CRM Erick",
    }),
  },
  {
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    getKey: () => process.env.GROQ_API_KEY,
    models: ["qwen/qwen3.6-27b"],
    requestOptions: { reasoning_format: "hidden", reasoning_effort: "none", max_completion_tokens: 1800, temperature: 0.6 },
    getHeaders: (key) => ({ Authorization: `Bearer ${key}`, "Content-Type": "application/json" }),
  },
];

export const AI_PROVIDERS = PROVIDERS;

function abortSignalFor(options) {
  const signals = [];
  if (options?.signal) signals.push(options.signal);
  if (options?.timeoutMs > 0) signals.push(AbortSignal.timeout(options.timeoutMs));
  if (signals.length === 0) return undefined;
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}

export async function aiComplete(systemPrompt, userPrompt, options) {
  for (const provider of PROVIDERS) {
    const key = provider.getKey();
    if (!key) continue;

    for (const model of provider.models) {
      if (options?.signal?.aborted) return null;
      try {
        const response = await fetch(provider.url, {
          method: "POST",
          headers: provider.getHeaders(key),
          signal: abortSignalFor(options),
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            ...provider.requestOptions,
          }),
        });
        if (!response.ok) {
          console.warn("[ai-provider] request rejected", {
            provider: provider.name,
            model,
            status: response.status,
          });
          if (response.status === 401 || response.status === 403) break;
          continue;
        }
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content) return { content: String(content).trim(), provider: provider.name, model };
        console.warn("[ai-provider] empty completion", {
          provider: provider.name,
          model,
          finishReason: data?.choices?.[0]?.finish_reason ?? null,
          completionTokens: data?.usage?.completion_tokens ?? null,
        });
      } catch (error) {
        // Abortou por timeout/cancelamento: nao adianta tentar o proximo modelo.
        if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) throw error;
        console.warn("[ai-provider] request failed", {
          provider: provider.name,
          model,
          reason: error instanceof Error ? error.name : "unknown",
        });
        // Falha do provedor: tenta o proximo modelo/provedor.
      }
    }
  }
  return null;
}

const aiProviders = { AI_PROVIDERS, aiComplete };

export default aiProviders;
