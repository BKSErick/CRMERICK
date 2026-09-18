// Catalogo vivo de modelos de IA.
//
// Problema que isto resolve: provedores aposentam modelo gratuito o tempo todo, e ate agora o
// CRM guardava o nome do modelo fixo no codigo (em 6 lugares diferentes, ja divergentes entre
// si). Cada aposentadoria virava caca ao nome novo + edicao manual + deploy.
//
// Aqui o CRM pergunta ao provedor quais modelos gratuitos existem AGORA e escolhe entre eles.
//
// A escolha e feita por SINAL ESTRUTURAL, nao por nome: janela de contexto minima, saida de
// texto puro e exclusao de modelos de categoria errada (guard/classificador/audio). Isso e o
// que envelhece bem. A lista de preferencias por familia (MODEL_PREFERENCES) e so um bonus de
// qualidade em cima disso: quando ela envelhece, o modelo vivo que nao casa com nada continua
// utilizavel, so vai pro fim da fila. Ou seja, preferencia desatualizada nunca deixa o CRM sem
// IA. Medida em 25/08/2026: nenhuma das familias fixadas no codigo em 2026-07 (llama-3.3,
// deepseek, gemini) ainda existia no catalogo gratuito. Por isso o sinal estrutural manda.

const CATALOG_TTL_MS = 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;
const DISCOVERY_TIMEOUT_MS = 8000;

// Teto de tentativas por provedor: sem isso, um dia ruim faria a cascata varrer as dezenas de
// modelos free do OpenRouter antes de desistir, e a requisicao estouraria o tempo.
export const MAX_MODELS_PER_PROVIDER = 4;

// Um modelo de conversa de verdade tem janela larga. Este corte sozinho elimina whisper (448),
// prompt-guard (512), TTS (4000) e modelos brinquedo, sem depender de conhecer o nome deles.
const MIN_CONTEXT_WINDOW = 32000;

// Palavras de CATEGORIA (nao nomes de produto): sobrevivem a troca de geracao dos modelos.
const CATEGORIA_ERRADA = /safeguard|content-safety|prompt-guard|\bguard\b|moderat|classif|embed|rerank|whisper|\btts\b|diffusion|dall-e/i;
// Servem, mas so depois dos estaveis: modelo furtivo/preview some sem aviso.
const DEPRIORITIZE = /stealth|preview|experimental|deprecat|alpha|beta/i;

// Ordem de preferencia por familia. Editar isto e OPCIONAL: mexe na qualidade da escolha,
// nunca na disponibilidade. Ultima conferencia contra o catalogo real: 25/08/2026.
export const MODEL_PREFERENCES = {
  OpenRouter: [
    "nemotron-3-ultra",
    "nemotron-3-super",
    "glm-5",
    "minimax-m3",
    "gemma-4-31b",
    "gemma-4",
    "nemotron",
    "minimax",
    "laguna",
    // Roteador do proprio OpenRouter: ele escolhe um modelo free vivo. Bom ultimo recurso
    // antes dos desconhecidos, pela mesma razao que este arquivo existe.
    "openrouter/free",
  ],
  Groq: ["gpt-oss-120b", "qwen3", "compound", "gpt-oss-20b", "gpt-oss"],
};

// Rede de seguranca de ultimo recurso: so entra em cena se a descoberta falhar E nao houver
// cache nenhum (ex.: provedor fora do ar no cold start). Nao e a fonte da verdade e vai
// envelhecer: e aceitavel, porque a descoberta e que manda.
const SEED_MODELS = {
  OpenRouter: ["nvidia/nemotron-3-super-120b-a12b:free", "z-ai/glm-5.2:free", "openrouter/free"],
  Groq: ["openai/gpt-oss-120b", "qwen/qwen3.6-27b"],
};

const CATALOG_SOURCES = {
  OpenRouter: {
    url: "https://openrouter.ai/api/v1/models",
    requiresKey: false,
    normalize: (model) => {
      const id = String(model?.id ?? "");
      if (!id) return null;
      // OpenRouter cobra por token: gratuito e sufixo :free ou preco zerado nas duas pontas.
      const prompt = Number(model?.pricing?.prompt);
      const completion = Number(model?.pricing?.completion);
      const gratuito = id.endsWith(":free") || (prompt === 0 && completion === 0);
      if (!gratuito) return null;
      const saidas = model?.architecture?.output_modalities ?? ["text"];
      // Saida com audio/imagem nao serve pra chat de texto (ex.: modelos de musica).
      if (!saidas.includes("text") || saidas.some((tipo) => tipo !== "text")) return null;
      return {
        id,
        name: String(model?.name ?? id),
        contextLength: Number(model?.top_provider?.context_length ?? model?.context_length) || 0,
        // Preco zerado sem sufixo :free costuma ser modelo furtivo/temporario.
        tierEstavel: id.endsWith(":free"),
        pricing: { prompt: prompt || 0, completion: completion || 0 },
        modalities: {
          input: Array.isArray(model?.architecture?.input_modalities) ? model.architecture.input_modalities : ["text"],
          output: saidas,
        },
      };
    },
  },
  Groq: {
    url: "https://api.groq.com/openai/v1/models",
    requiresKey: true,
    // No plano free da Groq o limite e de taxa, nao de preco: todo modelo ativo serve.
    normalize: (model) => {
      const id = String(model?.id ?? "");
      if (!id || model?.active === false) return null;
      return { id, contextLength: Number(model?.context_window) || 0, tierEstavel: true };
    },
  },
};

/** @type {Map<string, { models: string[]; refreshedAt: number; inFlight: Promise<string[]> | null }>} */
const catalogCache = new Map();
/** @type {Map<string, Set<string>>} */
const deadModels = new Map();
/** @type {Map<string, Set<string>>} */
const unsupportedParams = new Map();
/** @type {Map<string, { models: Array<Record<string, unknown>>; discoveredAt: string }>} */
const publicCatalogCache = new Map();

function conjunto(mapa, chave) {
  let set = mapa.get(chave);
  if (!set) {
    set = new Set();
    mapa.set(chave, set);
  }
  return set;
}

// Escotilha manual: AI_OPENROUTER_MODELS / AI_GROQ_MODELS (CSV) vencem a descoberta.
// Serve pra fixar um modelo especifico sem tocar em codigo nem esperar deploy.
function overrideFor(providerName) {
  const raw = process.env[`AI_${providerName.toUpperCase()}_MODELS`];
  if (!raw) return null;
  const list = String(raw)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const safeList = providerName === "OpenRouter" ? list.filter((id) => isStructurallyFreeOpenRouterId(id)) : list;
  return safeList.length > 0 ? safeList : null;
}

export function isStructurallyFreeOpenRouterId(modelId) {
  const id = String(modelId ?? "").trim().toLowerCase();
  return id === "openrouter/free" || id.endsWith(":free");
}

function normalizarEntrada(entrada) {
  return typeof entrada === "string" ? { id: entrada, contextLength: 0, tierEstavel: true } : entrada;
}

export function rankModels(providerName, modelos) {
  const preferences = MODEL_PREFERENCES[providerName] ?? [];
  return modelos
    .map(normalizarEntrada)
    .filter((model) => model && model.id && !CATEGORIA_ERRADA.test(model.id))
    // Contexto 0 = metadado ausente (ex.: lista-semente); nao da pra reprovar por isso.
    .filter((model) => model.contextLength === 0 || model.contextLength >= MIN_CONTEXT_WINDOW)
    .map((model, ordemOriginal) => {
      const lower = model.id.toLowerCase();
      const casou = preferences.findIndex((pattern) => lower.includes(pattern));
      return {
        id: model.id,
        // Sem preferencia casada, vai pro fim da fila. Nunca e descartado.
        posicao: casou < 0 ? preferences.length : casou,
        penalidade: (DEPRIORITIZE.test(lower) ? 2 : 0) + (model.tierEstavel ? 0 : 1),
        ordemOriginal,
      };
    })
    .sort((a, b) => a.posicao - b.posicao || a.penalidade - b.penalidade || a.ordemOriginal - b.ordemOriginal)
    .map((item) => item.id);
}

export async function discoverFreeModels(providerName, key) {
  const source = CATALOG_SOURCES[providerName];
  if (!source) return [];
  if (source.requiresKey && !key) return [];

  const response = await fetch(source.url, {
    headers: key ? { Authorization: `Bearer ${key}` } : undefined,
    signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`catalogo respondeu HTTP ${response.status}`);

  const payload = await response.json();
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const vistos = new Set();
  const modelos = [];
  for (const row of rows) {
    const model = source.normalize(row);
    if (!model || vistos.has(model.id)) continue;
    vistos.add(model.id);
    modelos.push(model);
  }
  return modelos;
}

/** Catalogo seguro para o picker: contextLength e janela do modelo, nao uso historico. */
export async function getFreeModelCatalog(providerName = "OpenRouter", key) {
  const models = await discoverFreeModels(providerName, key);
  const order = rankModels(providerName, models);
  const byId = new Map(models.map((model) => [model.id, model]));
  const catalog = {
    provider: providerName,
    models: order.map((id) => byId.get(id)).filter(Boolean),
    discoveredAt: new Date().toISOString(),
  };
  publicCatalogCache.set(providerName, catalog);
  return catalog;
}

/** IDs sem :free precisam de comprovacao zero-cost no catalogo atual. */
export async function validateFreeOpenRouterModel(modelId, key) {
  const id = String(modelId ?? "").trim();
  if (!id) throw new Error("Modelo gratuito elegivel nao informado.");
  if (isStructurallyFreeOpenRouterId(id)) {
    return {
      id,
      name: id,
      contextLength: 0,
      tierEstavel: true,
      pricing: { prompt: 0, completion: 0 },
      modalities: { input: ["text"], output: ["text"] },
    };
  }
  let catalog;
  try {
    catalog = await getFreeModelCatalog("OpenRouter", key);
  } catch {
    throw new Error("Nao foi possivel comprovar que o modelo e gratuito e elegivel.");
  }
  const model = catalog.models.find((item) => item.id === id);
  if (!model) throw new Error("O modelo informado nao esta gratuito ou elegivel no catalogo atual.");
  return model;
}

/**
 * Modelos que a cascata deve tentar neste provedor, em ordem, ja sem os mortos conhecidos.
 * Degrada em escada: descoberta -> cache velho -> semente. Nunca lanca erro.
 */
export async function getProviderModels(providerName, key) {
  const mortos = conjunto(deadModels, providerName);
  const override = overrideFor(providerName);
  if (override) return override.filter((id) => !mortos.has(id)).slice(0, MAX_MODELS_PER_PROVIDER);

  const cached = catalogCache.get(providerName);
  const aindaFresco = cached && cached.models.length > 0 && Date.now() - cached.refreshedAt < CATALOG_TTL_MS;
  if (aindaFresco) return cached.models.slice(0, MAX_MODELS_PER_PROVIDER);
  if (cached?.inFlight) return (await cached.inFlight).slice(0, MAX_MODELS_PER_PROVIDER);

  const inFlight = (async () => {
    try {
      const descobertos = await discoverFreeModels(providerName, key);
      const vivos = rankModels(
        providerName,
        descobertos.filter((model) => !mortos.has(model.id)),
      );
      if (vivos.length > 0) {
        catalogCache.set(providerName, { models: vivos, refreshedAt: Date.now(), inFlight: null });
        return vivos;
      }
      console.warn("[ai-catalog] catalogo veio vazio", { provider: providerName });
    } catch (error) {
      console.warn("[ai-catalog] descoberta falhou", {
        provider: providerName,
        reason: error instanceof Error ? error.message : "desconhecido",
      });
    }

    const anterior = (cached?.models ?? []).filter((id) => !mortos.has(id));
    const fallback =
      anterior.length > 0
        ? anterior
        : rankModels(
            providerName,
            (SEED_MODELS[providerName] ?? []).filter((id) => !mortos.has(id)),
          );
    // Falhou: tenta de novo em minutos, nao daqui a uma hora.
    catalogCache.set(providerName, {
      models: fallback,
      refreshedAt: Date.now() - CATALOG_TTL_MS + RETRY_AFTER_FAILURE_MS,
      inFlight: null,
    });
    return fallback;
  })();

  catalogCache.set(providerName, {
    models: cached?.models ?? [],
    refreshedAt: cached?.refreshedAt ?? 0,
    inFlight,
  });
  return (await inFlight).slice(0, MAX_MODELS_PER_PROVIDER);
}

/**
 * Chamado quando o provedor responde que o modelo nao existe mais. Tira o modelo de circulacao
 * e marca o catalogo pra ser refeito: a proxima chamada ja nasce curada.
 */
export function markModelDead(providerName, modelId) {
  conjunto(deadModels, providerName).add(modelId);
  const cached = catalogCache.get(providerName);
  if (!cached) return;
  catalogCache.set(providerName, {
    models: cached.models.filter((id) => id !== modelId),
    refreshedAt: 0,
    inFlight: null,
  });
}

/**
 * Memoria de parametro recusado. Cada modelo aceita um vocabulario diferente (medido em
 * 25/08/2026: `reasoning_effort` quer low|medium|high no gpt-oss, none|default no qwen3, e nao
 * existe no compound). Em vez de adivinhar, o motor aprende com o 400 e para de mandar.
 */
export function markParamUnsupported(providerName, modelId, param) {
  conjunto(unsupportedParams, `${providerName}:${modelId}`).add(param);
}

export function getUnsupportedParams(providerName, modelId) {
  return conjunto(unsupportedParams, `${providerName}:${modelId}`);
}

export function getDeadModels(providerName) {
  return [...conjunto(deadModels, providerName)];
}

export function resetCatalogCache() {
  catalogCache.clear();
  publicCatalogCache.clear();
  deadModels.clear();
  unsupportedParams.clear();
}

const aiModelCatalog = {
  MAX_MODELS_PER_PROVIDER,
  MODEL_PREFERENCES,
  discoverFreeModels,
  getFreeModelCatalog,
  getDeadModels,
  getProviderModels,
  getUnsupportedParams,
  isStructurallyFreeOpenRouterId,
  markModelDead,
  markParamUnsupported,
  rankModels,
  resetCatalogCache,
  validateFreeOpenRouterModel,
};

export default aiModelCatalog;
