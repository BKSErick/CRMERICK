import { normalizeAiQueryPlan, planAiQuery, type AiQueryIntent, type AiQueryPlan } from "./aiQueryRouter.ts";
import { decide, type DecideInput, type DecideResult } from "./typedDecision.mjs";

// Story 056: a regex continua sendo a primeira e mais barata. So quando ela nao reconhece a
// pergunta, uma decisao tipada escolhe entre as MESMAS intencoes fechadas. O resultado passa
// pelo validador estrito do roteador; nada que o modelo diga vira filtro livre, SQL ou URL.

export type PlannedQuery = { plan: AiQueryPlan; decidedBy: "regra" | "llm"; note?: string };

const INTENT_CRITERIA: Record<AiQueryIntent, string> = {
  daily_priorities: "o que fazer hoje, prioridades do dia, quem responder primeiro",
  email_replies: "e-mails recebidos que ainda aguardam resposta",
  whatsapp_replies: "conversas de WhatsApp que ainda aguardam resposta",
  deal_search: "procurar ou listar empresas, leads ou oportunidades (por nome, etapa ou nota)",
  pipeline_overview: "relatorio, panorama, como estao as coisas, numeros do funil, forecast, perdas",
  unknown: "pergunta que nao precisa de dado do CRM (conceito, opiniao, texto generico)",
};

const PERIOD_CRITERIA = {
  today: "hoje",
  last_7_days: "ultima semana",
  last_30_days: "ultimo mes, ou periodo nao informado",
};

type DecideFn = (input: DecideInput) => Promise<DecideResult>;

export async function planAiQueryWithFallback(
  question: string,
  options: { decideFn?: DecideFn; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<PlannedQuery> {
  const byRule = planAiQuery(question);
  if (byRule.intent !== "unknown") return { plan: byRule, decidedBy: "regra" };

  const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs) || 8000, 15000));
  const result = await (options.decideFn ?? decide)({
    state: { pergunta_do_operador: String(question ?? "").slice(0, 2000) },
    questions: {
      intent: { type: "choice", instructions: "Qual consulta do CRM responde a pergunta do operador?", criteria: INTENT_CRITERIA },
      requiresSalesPlaybook: { type: "boolean", instructions: "A pergunta pede mensagem, copy, follow-up, objecao ou abordagem comercial?" },
      period: { type: "choice", instructions: "Que periodo a pergunta pede?", criteria: PERIOD_CRITERIA },
    },
    timeoutMs,
    perModelTimeoutMs: timeoutMs,
    providerPolicy: "free-then-groq",
    signal: options.signal,
  }).catch((error: unknown) => ({ ok: false as const, reason: "unavailable" as const, detail: error instanceof Error ? error.message : "falha", failures: [], attempts: [] }));

  if (!result.ok) return { plan: byRule, decidedBy: "regra", note: result.detail };

  const intent = result.answers.intent?.type === "choice" ? result.answers.intent.choice as AiQueryIntent : "unknown";
  const playbook = result.answers.requiresSalesPlaybook?.type === "boolean" && result.answers.requiresSalesPlaybook.value;
  const period = result.answers.period?.type === "choice" ? result.answers.period.choice : "last_30_days";
  const filters: Record<string, unknown> = { limit: intent === "unknown" ? 10 : 20 };
  if (intent === "daily_priorities") filters.period = "today";
  if (intent === "email_replies" || intent === "whatsapp_replies") filters.period = period;

  // A regex liga o playbook por qualquer "mensagem" na pergunta; isso so faz sentido quando a
  // pergunta continua `unknown` (pedido de texto). Para consulta de dados vale a decisao tipada.
  const requiresSalesPlaybook = intent === "unknown" ? byRule.requiresSalesPlaybook || playbook : playbook;
  try {
    const plan = normalizeAiQueryPlan({ intent, filters, requiresSalesPlaybook });
    return { plan, decidedBy: "llm" };
  } catch (error) {
    return { plan: byRule, decidedBy: "regra", note: error instanceof Error ? error.message : "plano invalido" };
  }
}
