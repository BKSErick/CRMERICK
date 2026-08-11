import { processCommercialEvent } from "./commercialAutomationService.mjs";
import { calculateForecastFromSupabase } from "./dealForecastService.mjs";
import { loadLossAnalysis } from "./dealLossService.mjs";
import {
  COPILOT_BRIEFING_QUESTIONS,
  SALES_COPILOT_CONTRACT_VERSION,
  buildCopilotAnswer,
  buildCopilotContext,
  copilotQuestion,
  copilotSuggestionEvent,
  copilotSystemPrompt,
  copilotUserPrompt,
  parseCopilotSuggestions,
} from "./salesCopilot.mjs";

// Story 032: leitura das fontes reais e orquestracao do copiloto.
//
// O provedor de IA entra injetado (options.complete). Sem ele — ou quando ele falha,
// estoura o tempo ou devolve vazio — a resposta deterministica continua saindo inteira,
// com a trilha do que foi tentado. Nenhuma tela depende do modelo para funcionar.

export const COPILOT_DEAL_SELECT = [
  "id",
  "company",
  "name",
  "stage",
  "value",
  "recurring",
  "close_date",
  "next_action_at",
  "next_action_note",
  "last_inbound_at",
  "last_outbound_at",
  "stage_entered_at",
  "deal_health_score",
  "deal_health_classification",
  "deal_health_confidence",
  "deal_health_recommended_action",
  "deal_health_calculated_at",
  "qualification",
].join(", ");

const DEAL_PAGE_SIZE = 1000;
const LOSS_RECORD_LIMIT = 2000;
export const COPILOT_DEFAULT_TIMEOUT_MS = 12000;
export const COPILOT_DEFAULT_ATTEMPTS = 2;

const QUESTIONS_NEEDING_FORECAST = new Set([
  "attention_today",
  "proposals_at_risk",
  "deals_without_next_action",
  "deal_temperature",
  "recommended_action",
]);
const QUESTIONS_NEEDING_LOSSES = new Set(["funnel_leakage"]);

export function currentMonthPeriod(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const lastDay = String(new Date(Date.UTC(year, date.getUTCMonth() + 1, 0)).getUTCDate()).padStart(2, "0");
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${lastDay}` };
}

function resolvePeriod(options, now) {
  const defaults = currentMonthPeriod(now);
  return { from: options.from ?? defaults.from, to: options.to ?? defaults.to };
}

async function listDeals(supabase, dealId) {
  const rows = [];
  for (let from = 0; ; from += DEAL_PAGE_SIZE) {
    let query = supabase.from("deals").select(COPILOT_DEAL_SELECT).order("id", { ascending: true });
    if (dealId) query = query.eq("id", dealId);
    const result = await query.range(from, from + DEAL_PAGE_SIZE - 1);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < DEAL_PAGE_SIZE) break;
  }
  return rows;
}

async function listLossRecords(supabase, period) {
  const result = await supabase
    .from("deal_loss_records")
    .select("deal_id, reason_code, previous_stage, recorded_at, superseded_at")
    .gte("recorded_at", `${period.from}T00:00:00.000Z`)
    .lte("recorded_at", `${period.to}T23:59:59.999Z`)
    .limit(LOSS_RECORD_LIMIT);
  if (result.error) throw result.error;
  return (result.data ?? [])
    .filter((row) => !row.superseded_at)
    .map((row) => ({
      dealId: row.deal_id === null || row.deal_id === undefined ? null : Number(row.deal_id),
      reasonCode: row.reason_code ?? null,
      previousStage: row.previous_stage ?? "desconhecida",
      recordedAt: row.recorded_at ?? null,
    }));
}

/**
 * Le as fontes reais e devolve o contexto deterministico da pergunta. Fonte secundaria
 * que falha vira limitacao declarada, nao excecao: o operador ainda recebe resposta.
 */
export async function loadCopilotContext(supabase, options = {}) {
  const question = copilotQuestion(options.question);
  const now = options.now ? new Date(options.now).toISOString() : new Date().toISOString();
  const period = resolvePeriod(options, now);
  const dealId = options.dealId ? Number(options.dealId) : null;
  if (question.requiresDeal && (!Number.isInteger(dealId) || dealId <= 0)) {
    throw new Error(`A pergunta ${question.key} exige um dealId valido.`);
  }

  const degraded = [];
  const deals = await listDeals(supabase, dealId);

  let forecast = null;
  if (QUESTIONS_NEEDING_FORECAST.has(question.key)) {
    try {
      forecast = await calculateForecastFromSupabase(supabase, {
        dealId,
        from: period.from,
        to: period.to,
        now,
      });
    } catch (error) {
      degraded.push(`Forecast indisponivel: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let losses = null;
  let lossRecords = [];
  if (QUESTIONS_NEEDING_LOSSES.has(question.key)) {
    try {
      losses = await loadLossAnalysis(supabase, { from: period.from, to: period.to, now });
    } catch (error) {
      degraded.push(`Analise de perdas indisponivel: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      lossRecords = await listLossRecords(supabase, period);
    } catch (error) {
      degraded.push(`Registros de perda indisponiveis: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const context = buildCopilotContext({
    question: question.key,
    dealId,
    now,
    period,
    deals,
    forecast,
    losses,
    lossRecords,
  });
  context.limitations.push(...degraded);
  return context;
}

function timeoutError(timeoutMs) {
  const error = new Error(`Tempo limite de ${timeoutMs}ms excedido no provedor de IA.`);
  error.code = "COPILOT_AI_TIMEOUT";
  return error;
}

async function withTimeout(promise, timeoutMs, controller) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          if (controller) controller.abort();
          reject(timeoutError(timeoutMs));
        }, timeoutMs);
        if (typeof timer?.unref === "function") timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Narrativa opcional do modelo, com timeout, retry e trilha observavel. Nunca lanca:
 * o pior caso e status "unavailable" com o motivo registrado.
 */
export async function runCopilotNarrative(complete, context, options = {}) {
  const attempts = [];
  if (typeof complete !== "function") {
    return { status: "skipped", provider: null, model: null, attempts, error: null, content: null };
  }
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : COPILOT_DEFAULT_TIMEOUT_MS;
  const maxAttempts = Number(options.attempts) > 0 ? Number(options.attempts) : COPILOT_DEFAULT_ATTEMPTS;
  const systemPrompt = copilotSystemPrompt();
  const userPrompt = copilotUserPrompt(context);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    try {
      const result = await withTimeout(
        Promise.resolve(complete(systemPrompt, userPrompt, { signal: controller?.signal, timeoutMs })),
        timeoutMs,
        controller,
      );
      const durationMs = Date.now() - startedAt;
      if (result?.content) {
        attempts.push({
          attempt,
          provider: result.provider ?? "desconhecido",
          model: result.model ?? "desconhecido",
          outcome: "ok",
          durationMs,
        });
        return {
          status: "ok",
          provider: result.provider ?? null,
          model: result.model ?? null,
          attempts,
          error: null,
          content: String(result.content),
        };
      }
      lastError = "Provedor respondeu sem conteudo.";
      attempts.push({ attempt, provider: "desconhecido", model: "desconhecido", outcome: "empty", durationMs, error: lastError });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      attempts.push({
        attempt,
        provider: "desconhecido",
        model: "desconhecido",
        outcome: error?.code === "COPILOT_AI_TIMEOUT" ? "timeout" : "error",
        durationMs: Date.now() - startedAt,
        error: lastError,
      });
    }
  }

  return { status: "unavailable", provider: null, model: null, attempts, error: lastError, content: null };
}

/** Resposta completa de uma pergunta: deterministico primeiro, narrativa depois. */
export async function answerCopilotQuestion(supabase, options = {}) {
  const context = await loadCopilotContext(supabase, options);
  const narrative = options.withNarrative === false
    ? { status: "skipped", provider: null, model: null, attempts: [], error: null, content: null }
    : await runCopilotNarrative(options.complete, context, options);
  if (narrative.status === "unavailable") {
    context.limitations.push("Narrativa da IA indisponivel: a resposta abaixo e 100% deterministica.");
  }
  return buildCopilotAnswer({ context, narrative: narrative.content, ai: narrative });
}

/** Briefing diario: as perguntas gerais em uma passada so. */
export async function buildCopilotBriefing(supabase, options = {}) {
  const now = options.now ? new Date(options.now).toISOString() : new Date().toISOString();
  const period = resolvePeriod(options, now);
  const questions = Array.isArray(options.questions) && options.questions.length > 0
    ? options.questions
    : COPILOT_BRIEFING_QUESTIONS;

  const answers = [];
  for (const question of questions) {
    answers.push(await answerCopilotQuestion(supabase, { ...options, question, now, ...period }));
  }
  return {
    contractVersion: SALES_COPILOT_CONTRACT_VERSION,
    generatedAt: now,
    period,
    answers,
    limitations: [...new Set(answers.flatMap((answer) => answer.limitations))],
  };
}

/**
 * Rascunho por deal. Devolve somente sugestoes: nada e persistido aqui, nem quando o
 * modelo tenta pedir. Aplicar exige applyCopilotSuggestion com o operador identificado.
 */
export async function draftCopilotSuggestions(supabase, options = {}) {
  const dealId = Number(options.dealId);
  if (!Number.isInteger(dealId) || dealId <= 0) throw new Error("Rascunho do copiloto exige dealId valido.");
  const context = await loadCopilotContext(supabase, { ...options, question: "recommended_action", dealId });
  const narrative = await runCopilotNarrative(options.complete, context, {
    ...options,
    draft: true,
  });
  const answer = buildCopilotAnswer({ context, narrative: narrative.content, ai: narrative });
  const company = context.items[0]?.company ?? null;
  const aiSuggestions = narrative.content
    ? parseCopilotSuggestions(narrative.content, { dealId, company, now: context.generatedAt })
    : [];
  answer.suggestions = [...answer.suggestions, ...aiSuggestions];
  return answer;
}

/**
 * Aplica uma sugestao aprovada pelo operador. Nao escreve direto em deals: emite o evento
 * copilot.suggestion_accepted e deixa o motor da Story 027 decidir, guardar e auditar.
 */
export async function applyCopilotSuggestion(supabase, options = {}) {
  const actor = String(options.actor ?? "").trim();
  if (!actor) throw new Error("Aplicar sugestao exige o operador que confirmou.");
  if (options.confirmed !== true) throw new Error("Sugestao do copiloto so e aplicada com confirmacao explicita.");
  const event = copilotSuggestionEvent(options.suggestion, {
    actor,
    at: options.at,
    question: options.question ?? null,
    source: options.source ?? "copilot",
  });
  const result = await processCommercialEvent(supabase, event, { apply: true });
  return {
    contractVersion: SALES_COPILOT_CONTRACT_VERSION,
    event: result.event,
    duplicate: result.duplicate,
    decisions: result.decisions,
    appliedBy: actor,
  };
}

/** Achados so recebe o que o operador mandou salvar. Sem gravacao automatica. */
export async function saveCopilotLearning(supabase, options = {}) {
  const actor = String(options.actor ?? "").trim();
  if (!actor) throw new Error("Salvar aprendizado exige o operador.");
  if (options.confirmed !== true) throw new Error("Aprendizado do copiloto so e salvo com confirmacao explicita.");
  const content = String(options.content ?? "").trim();
  if (!content) throw new Error("Aprendizado vazio nao vai para Achados.");

  const dealId = options.dealId ? Number(options.dealId) : null;
  const row = {
    deal_id: Number.isInteger(dealId) && dealId > 0 ? dealId : null,
    company: options.company ? String(options.company) : null,
    type: "copiloto",
    content: `${content}\n\n_Salvo por ${actor} a partir do copiloto._`,
  };
  const result = await supabase.from("insights").insert(row).select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

const salesCopilotService = {
  COPILOT_DEAL_SELECT,
  COPILOT_DEFAULT_ATTEMPTS,
  COPILOT_DEFAULT_TIMEOUT_MS,
  answerCopilotQuestion,
  applyCopilotSuggestion,
  buildCopilotBriefing,
  currentMonthPeriod,
  draftCopilotSuggestions,
  loadCopilotContext,
  runCopilotNarrative,
  saveCopilotLearning,
};

export default salesCopilotService;
