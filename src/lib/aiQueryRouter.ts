export const AI_QUERY_INTENTS = [
  "daily_priorities",
  "email_replies",
  "whatsapp_replies",
  "deal_search",
  "pipeline_overview",
  "unknown",
] as const;

export type AiQueryIntent = (typeof AI_QUERY_INTENTS)[number];
export type AiQueryPeriod = "today" | "last_7_days" | "last_30_days";
export type AiQueryFilters = {
  period?: AiQueryPeriod;
  limit: number;
  textContains?: string;
  dealId?: number;
  stageIn?: string[];
  statusIn?: string[];
  minPoints?: number;
};
export type AiQueryPlan = { intent: AiQueryIntent; filters: AiQueryFilters; requiresSalesPlaybook: boolean };

const TOP_LEVEL_FIELDS = new Set(["intent", "filters", "requiresSalesPlaybook"]);
const FILTER_FIELDS = new Set(["period", "limit", "textContains", "dealId", "stageIn", "statusIn", "minPoints"]);
const PERIODS = new Set<AiQueryPeriod>(["today", "last_7_days", "last_30_days"]);
const STAGES = new Set(["prospect", "abordado", "followup", "qualified", "proposal", "negotiation", "won", "lost"]);
const STATUSES = new Set(["open", "won", "lost"]);

function normalizedText(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} do plano invalido.`);
  return value as Record<string, unknown>;
}

export function normalizeAiQueryPlan(value: unknown): AiQueryPlan {
  const row = assertObject(value, "Plano");
  for (const key of Object.keys(row)) if (!TOP_LEVEL_FIELDS.has(key)) throw new Error(`Campo desconhecido no plano: ${key}.`);
  const intent = String(row.intent ?? "") as AiQueryIntent;
  if (!AI_QUERY_INTENTS.includes(intent)) throw new Error("Intencao desconhecida no plano.");

  const rawFilters = assertObject(row.filters ?? {}, "Filtros");
  for (const key of Object.keys(rawFilters)) if (!FILTER_FIELDS.has(key)) throw new Error(`Campo desconhecido nos filtros do plano: ${key}.`);
  const filters: AiQueryFilters = {
    limit: Math.max(1, Math.min(Math.trunc(Number(rawFilters.limit) || (intent === "unknown" ? 10 : 20)), 50)),
  };
  if (rawFilters.period !== undefined) {
    if (!PERIODS.has(rawFilters.period as AiQueryPeriod)) throw new Error("Periodo invalido no plano.");
    filters.period = rawFilters.period as AiQueryPeriod;
  }
  if (rawFilters.textContains !== undefined) {
    const text = String(rawFilters.textContains).trim().slice(0, 100);
    if (text) filters.textContains = text;
  }
  if (rawFilters.dealId !== undefined) {
    const dealId = Number(rawFilters.dealId);
    if (!Number.isInteger(dealId) || dealId <= 0) throw new Error("Deal invalido no plano.");
    filters.dealId = dealId;
  }
  if (rawFilters.stageIn !== undefined) {
    if (!Array.isArray(rawFilters.stageIn) || rawFilters.stageIn.some((stage) => !STAGES.has(String(stage)))) {
      throw new Error("Etapa invalida no plano.");
    }
    const stages = [...new Set(rawFilters.stageIn.map(String))];
    if (stages.length) filters.stageIn = stages;
  }
  if (rawFilters.statusIn !== undefined) {
    if (!Array.isArray(rawFilters.statusIn) || rawFilters.statusIn.some((status) => !STATUSES.has(String(status)))) {
      throw new Error("Status invalido no plano.");
    }
    const statuses = [...new Set(rawFilters.statusIn.map(String))];
    if (statuses.length) filters.statusIn = statuses;
  }
  if (rawFilters.minPoints !== undefined) {
    const minPoints = Number(rawFilters.minPoints);
    // A nota real passa de 100 (base ate ~125, mais o ICP). Story 058.
    if (!Number.isFinite(minPoints) || minPoints < 0 || minPoints > 200) throw new Error("Score invalido no plano.");
    filters.minPoints = minPoints;
  }
  return { intent, filters, requiresSalesPlaybook: row.requiresSalesPlaybook === true };
}

const OVERVIEW = new RegExp([
  "relatorio",
  "panorama",
  "visao geral",
  "status geral",
  "resumo (?:geral|do (?:funil|pipeline|mes|comercial))",
  "situacao (?:geral|do funil|do pipeline|comercial)",
  "como (?:estao|esta|anda|andam|vai|vao) (?:as coisas|o funil|o pipeline|as vendas|a prospeccao|o comercial|os numeros)",
  "numeros do (?:funil|mes|comercial|pipeline)",
].join("|"));

function searchTerm(question: string) {
  const match = question.match(/(?:procure|buscar?|encontre|localize)\s+(?:o\s+|a\s+)?(?:prospect|lead|deal|empresa|oportunidade)?\s*(.+)$/i);
  return match?.[1]?.trim().replace(/[?.!]+$/, "").slice(0, 100) || undefined;
}

function dealSearchFilters(original: string, text: string) {
  const filters: Record<string, unknown> = { limit: 20 };
  const requested = searchTerm(original);
  const segment = original.match(/(?:leads?|prospects?|empresas?)\s+de\s+(.+?)(?:\s+que\b|\s+com\b|$)/i)?.[1]?.trim();
  if (requested) filters.textContains = requested;
  else if (segment) filters.textContains = segment;
  const minPoints = text.match(/(?:score|pontos?).{0,20}(?:acima de|maior que|minimo de|minimo)?\s*(\d{1,3})/)?.[1];
  if (minPoints !== undefined) filters.minPoints = Number(minPoints);
  const stageIn = [...STAGES].filter((stage) => new RegExp(`\\b${stage}s?\\b`).test(text));
  if (stageIn.length) filters.stageIn = stageIn;
  return filters;
}

export function planAiQuery(question: string): AiQueryPlan {
  const original = String(question ?? "").trim();
  const text = normalizedText(original);
  if (/prioridade|priorizar|o que (?:faco|fazer) hoje|meu dia/.test(text)) {
    return normalizeAiQueryPlan({ intent: "daily_priorities", filters: { period: "today", limit: 20 } });
  }
  if (/e-?mail|caixa de entrada|inbox/.test(text) && /respond|resposta|retorno|aguarda|pendente/.test(text)) {
    return normalizeAiQueryPlan({ intent: "email_replies", filters: { period: "last_30_days", limit: 20 } });
  }
  if (/whats(?:app)?/.test(text) && /respond|resposta|retorno|aguarda|pendente/.test(text)) {
    return normalizeAiQueryPlan({ intent: "whatsapp_replies", filters: { period: "last_30_days", limit: 20 } });
  }
  if (/prospect|lead|deal|empresa|oportunidade/.test(text) && (/(?:procure|buscar?|encontre|localize)\s/.test(text) || /score|pontos?|etapa|estagio|acima de|minimo/.test(text))) {
    return normalizeAiQueryPlan({ intent: "deal_search", filters: dealSearchFilters(original, text) });
  }
  // Story 056: "me da o relatorio de como estao as coisas" caia em `unknown` e o chat
  // respondia sem dado nenhum. Visao geral carrega so agregados (escopo reports).
  if (OVERVIEW.test(text)) {
    return normalizeAiQueryPlan({ intent: "pipeline_overview", filters: { limit: 20 } });
  }
  return normalizeAiQueryPlan({
    intent: "unknown",
    filters: { limit: 10 },
    requiresSalesPlaybook: /mensagem|copy|follow-?up|objecao|venda|proposta comercial/.test(text),
  });
}
