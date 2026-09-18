// Cascata de provedores do CRM. Vive em .mjs para ser reusada tanto pelas rotas (via
// src/lib/aiComplete.ts) quanto pelos CLIs, sem duplicar a logica de fallback.
// Story 032 acrescentou o teto de tempo opcional: sem opcoes, o comportamento e o de antes.
//
// A lista de modelos NAO mora mais aqui: vem do catalogo vivo (aiModelCatalog.mjs), que
// pergunta ao provedor o que existe agora. Quando um modelo e descontinuado, a resposta de
// erro e classificada como `model_gone`, o modelo sai de circulacao na hora e o catalogo e
// remontado: a proxima chamada ja nasce curada, sem ninguem editar codigo.

import {
  getProviderModels,
  getUnsupportedParams,
  markModelDead,
  markParamUnsupported,
  validateFreeOpenRouterModel,
} from "./aiModelCatalog.mjs";

// Parametros de raciocinio so existem em modelo de raciocinio. Mandar pros outros e 400.
// `reasoning_effort` foi removido de proposito: nao existe valor portavel (medido em
// 25/08/2026, gpt-oss so aceita low|medium|high e qwen3 so aceita none|default).
const REASONING_MODELS = /qwen3|deepseek-r1|gpt-oss|magistral|thinking|reasoning/i;

const PROVIDERS = [
  {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    getKey: () => process.env.OPENROUTER_API_KEY,
    requestOptionsFor: () => ({ max_tokens: 1800 }),
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
    requestOptionsFor: (model) => ({
      max_completion_tokens: 1800,
      temperature: 0.6,
      ...(REASONING_MODELS.test(model) ? { reasoning_format: "hidden" } : {}),
    }),
    getHeaders: (key) => ({ Authorization: `Bearer ${key}`, "Content-Type": "application/json" }),
  },
];

export const AI_PROVIDERS = PROVIDERS;

const MODEL_GONE = /model_not_found|model[_ -]?decommission|decommissioned|does not exist|is not a valid model|no endpoints found|unknown model|no longer (supported|available)|has been (deprecated|retired)/i;
const NO_CREDIT = /insufficient|not enough credit|payment required|exceeded your current quota/i;

/**
 * Traduz a resposta de erro do provedor em causa acionavel. Antes disto o codigo so olhava o
 * status HTTP, entao "modelo descontinuado", "sem credito" e "rate limit" viravam o mesmo
 * `continue` silencioso e o Erick recebia sempre "verifique a GROQ_API_KEY".
 */
export function classifyProviderFailure(status, bodyText) {
  const body = String(bodyText ?? "");
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 402 || NO_CREDIT.test(body)) return "no_credit";
  if (MODEL_GONE.test(body)) return "model_gone";
  if (status === 404) return "model_gone";
  if (status === 429) return "rate_limited";
  if (status === 400) return "bad_request";
  if (status >= 500) return "provider_error";
  return "provider_error";
}

const FAILURE_LABELS = {
  missing_key: "chave nao configurada",
  no_models: "nenhum modelo gratuito disponivel no catalogo",
  invalid_key: "chave rejeitada pelo provedor",
  no_credit: "sem credito",
  model_gone: "modelo descontinuado",
  rate_limited: "limite de uso atingido",
  bad_request: "requisicao recusada",
  provider_error: "provedor indisponivel",
  empty_completion: "resposta vazia",
  network_error: "falha de rede",
  model_not_free: "modelo nao comprovado como gratuito",
};

/** Mensagem curta e acionavel a partir das falhas acumuladas na cascata. */
export function describeFailures(failures) {
  if (!failures || failures.length === 0) return "Nenhum provedor de IA configurado.";
  const razoes = new Set(failures.map((item) => item.reason));

  if (failures.every((item) => item.reason === "missing_key")) {
    return "Nenhuma chave de IA configurada. Defina OPENROUTER_API_KEY ou GROQ_API_KEY no ambiente.";
  }
  if (razoes.has("invalid_key")) {
    const alvo = failures.find((item) => item.reason === "invalid_key");
    return `A chave do ${alvo.provider} foi rejeitada (HTTP ${alvo.status}). Gere uma nova e atualize o ambiente.`;
  }
  if (razoes.has("no_credit")) {
    const alvo = failures.find((item) => item.reason === "no_credit");
    return `O ${alvo.provider} respondeu que a conta esta sem credito para os modelos gratuitos.`;
  }
  if (razoes.has("model_gone") && !razoes.has("rate_limited")) {
    const mortos = failures.filter((item) => item.reason === "model_gone").map((item) => item.model);
    return `Os modelos gratuitos tentados foram descontinuados (${mortos.join(", ")}). O catalogo sera redescoberto na proxima tentativa; rode "npm run ai:doctor" se persistir.`;
  }
  if (razoes.has("rate_limited")) {
    return "Limite de uso dos modelos gratuitos atingido. Tente de novo em alguns minutos.";
  }
  const resumo = failures
    .slice(0, 3)
    .map((item) => `${item.provider}${item.model ? `/${item.model}` : ""}: ${FAILURE_LABELS[item.reason] ?? item.reason}`)
    .join("; ");
  return `Nenhum modelo respondeu. ${resumo}.`;
}

function abortSignalFor(options) {
  const signals = [];
  if (options?.signal) signals.push(options.signal);
  if (options?.timeoutMs > 0) signals.push(AbortSignal.timeout(options.timeoutMs));
  if (signals.length === 0) return undefined;
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}

/**
 * Descobre QUAL parametro o provedor recusou, pra o motor parar de mandar aquele parametro
 * pra aquele modelo em vez de simplesmente desistir dele.
 */
export function extractRejectedParams(bodyText, sentKeys) {
  const encontrados = new Set();
  try {
    const parsed = JSON.parse(String(bodyText));
    const param = parsed?.error?.param;
    if (typeof param === "string" && sentKeys.includes(param)) encontrados.add(param);
  } catch {
    // Corpo nao-JSON: sobra o texto da mensagem, tratado abaixo.
  }
  for (const chave of sentKeys) {
    // Provedores citam o parametro entre crases ou aspas na mensagem de erro.
    if (new RegExp("[`'\"]" + chave + "[`'\"]").test(String(bodyText))) encontrados.add(chave);
  }
  return [...encontrados];
}

async function callModel(provider, key, model, systemPrompt, userPrompt, options, extras) {
  return fetch(provider.url, {
    method: "POST",
    headers: provider.getHeaders(key),
    signal: abortSignalFor(options),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...extras,
    }),
  });
}

/**
 * Versao detalhada: alem do resultado, devolve as falhas classificadas de cada tentativa.
 * As rotas usam isso pra dizer o que aconteceu de verdade em vez de um erro generico.
 */
export async function aiCompleteDetailed(systemPrompt, userPrompt, options) {
  const failures = [];
  const attempts = [];
  const fixed = options?.modelPreference?.mode === "fixed" ? options.modelPreference : null;

  if (fixed && (fixed.provider !== "OpenRouter" || !fixed.modelId)) {
    failures.push({ provider: "OpenRouter", model: fixed?.modelId ?? null, status: null, reason: "model_not_free" });
    return { result: null, failures, attempts };
  }

  for (const provider of PROVIDERS) {
    if (fixed && provider.name !== fixed.provider) continue;
    if (options?.freeOnly === true && provider.name !== "OpenRouter") continue;
    const key = provider.getKey();
    if (!key) {
      failures.push({ provider: provider.name, model: null, status: null, reason: "missing_key" });
      continue;
    }

    let models;
    if (fixed) {
      try {
        await validateFreeOpenRouterModel(fixed.modelId, key);
        models = [fixed.modelId];
      } catch {
        failures.push({ provider: provider.name, model: fixed.modelId, status: null, reason: "model_not_free" });
        return { result: null, failures, attempts };
      }
    } else {
      models = await getProviderModels(provider.name, key);
    }
    if (models.length === 0) {
      failures.push({ provider: provider.name, model: null, status: null, reason: "no_models" });
      continue;
    }

    let pularProvedor = false;
    for (const model of models) {
      if (pularProvedor) break;
      if (options?.signal?.aborted) return { result: null, failures, attempts };

      // Comeca ja sem os parametros que este modelo recusou em chamadas anteriores.
      const extras = { ...provider.requestOptionsFor(model), ...(options?.requestOptions ?? {}) };
      for (const param of getUnsupportedParams(provider.name, model)) delete extras[param];

      // Ate 3 passadas no MESMO modelo: cada 400 de parametro ensina algo e a proxima ja vai
      // sem ele. Ultimo recurso e o payload minimo (so model + messages).
      for (let passada = 0; passada < 3; passada += 1) {
        if (options?.signal?.aborted) return { result: null, failures, attempts };
        const attemptStartedAt = Date.now();
        try {
          const response = await callModel(provider, key, model, systemPrompt, userPrompt, options, extras);

          if (!response.ok) {
            const bodyText = await response.text().catch(() => "");
            const reason = classifyProviderFailure(response.status, bodyText);
            failures.push({
              provider: provider.name,
              model,
              status: response.status,
              reason,
              detail: bodyText.slice(0, 200),
            });
            attempts.push({ provider: provider.name, model, status: "failed", reason, latencyMs: Date.now() - attemptStartedAt });
            console.warn("[ai-provider] request rejected", { provider: provider.name, model, status: response.status, reason });

            if (reason === "model_gone") markModelDead(provider.name, model);
            if (reason === "invalid_key" || reason === "no_credit") {
              pularProvedor = true;
              break;
            }

            if (reason === "bad_request") {
              const rejeitados = extractRejectedParams(bodyText, Object.keys(extras));
              if (rejeitados.length > 0) {
                for (const param of rejeitados) {
                  markParamUnsupported(provider.name, model, param);
                  delete extras[param];
                }
                continue;
              }
              // 400 sem parametro identificavel: tenta uma vez com o payload cru.
              if (Object.keys(extras).length > 0) {
                for (const param of Object.keys(extras)) delete extras[param];
                continue;
              }
            }
            break;
          }

          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) {
            const usage = data?.usage
              ? {
                  inputTokens: Number.isFinite(Number(data.usage.prompt_tokens)) ? Number(data.usage.prompt_tokens) : null,
                  outputTokens: Number.isFinite(Number(data.usage.completion_tokens)) ? Number(data.usage.completion_tokens) : null,
                  totalTokens: Number.isFinite(Number(data.usage.total_tokens)) ? Number(data.usage.total_tokens) : null,
                }
              : null;
            attempts.push({ provider: provider.name, model, status: "success", reason: null, latencyMs: Date.now() - attemptStartedAt });
            return { result: { content: String(content).trim(), provider: provider.name, model, usage }, failures, attempts };
          }

          failures.push({ provider: provider.name, model, status: response.status, reason: "empty_completion" });
          attempts.push({ provider: provider.name, model, status: "failed", reason: "empty_completion", latencyMs: Date.now() - attemptStartedAt });
          console.warn("[ai-provider] empty completion", {
            provider: provider.name,
            model,
            finishReason: data?.choices?.[0]?.finish_reason ?? null,
            completionTokens: data?.usage?.completion_tokens ?? null,
          });
          break;
        } catch (error) {
          // Abortou por timeout/cancelamento: nao adianta tentar o proximo modelo.
          if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) throw error;
          failures.push({
            provider: provider.name,
            model,
            status: null,
            reason: "network_error",
            detail: error instanceof Error ? error.name : "unknown",
          });
          attempts.push({ provider: provider.name, model, status: "failed", reason: "network_error", latencyMs: Date.now() - attemptStartedAt });
          console.warn("[ai-provider] request failed", {
            provider: provider.name,
            model,
            reason: error instanceof Error ? error.name : "unknown",
          });
          break;
        }
      }
    }
  }

  return { result: null, failures, attempts };
}

export async function aiComplete(systemPrompt, userPrompt, options) {
  const { result } = await aiCompleteDetailed(systemPrompt, userPrompt, options);
  return result;
}

const aiProviders = { AI_PROVIDERS, aiComplete, aiCompleteDetailed, classifyProviderFailure, describeFailures };

export default aiProviders;
