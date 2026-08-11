import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { aiComplete } from "../src/lib/aiProviders.mjs";
import { COPILOT_QUESTIONS } from "../src/lib/salesCopilot.mjs";
import {
  answerCopilotQuestion,
  buildCopilotBriefing,
  currentMonthPeriod,
  draftCopilotSuggestions,
} from "../src/lib/salesCopilotService.mjs";

// Story 032: o copiloto pela CLI. Briefing do dia, consulta de um deal e rascunho sem
// abrir a UI. Somente leitura: nada aqui aplica sugestao, muda etapa ou envia mensagem —
// aplicar exige o gesto do operador na tela, que passa pelo motor da Story 027.

const QUESTION_KEYS = COPILOT_QUESTIONS.map((question) => question.key);

function flagValue(argv, name) {
  const item = argv.find((value) => value.startsWith(`--${name}=`));
  return item ? item.split("=").slice(1).join("=").trim() : "";
}

function validDateArg(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime())) {
    throw new Error(`${label} invalida: use YYYY-MM-DD.`);
  }
  return value;
}

export function parseSalesCopilotArgs(argv = process.argv.slice(2), now = new Date()) {
  const defaults = currentMonthPeriod(now);
  const from = validDateArg(flagValue(argv, "from") || defaults.from, "Data inicial");
  const to = validDateArg(flagValue(argv, "to") || defaults.to, "Data final");
  if (from > to) throw new Error("Periodo invalido: --from deve anteceder --to.");

  const rawDealId = flagValue(argv, "deal-id");
  const dealId = rawDealId ? Number(rawDealId) : null;
  if (rawDealId && (!Number.isInteger(dealId) || dealId <= 0)) {
    throw new Error("Deal invalido: use --deal-id=<inteiro positivo>.");
  }

  const draft = argv.includes("--draft");
  const question = flagValue(argv, "question") || null;
  if (question && !QUESTION_KEYS.includes(question)) {
    throw new Error(`Pergunta invalida. Use uma de: ${QUESTION_KEYS.join(", ")}.`);
  }
  if (draft && !dealId) throw new Error("--draft exige --deal-id.");
  if (question && QUESTION_KEYS.includes(question)) {
    const definition = COPILOT_QUESTIONS.find((item) => item.key === question);
    if (definition.requiresDeal && !dealId) throw new Error(`A pergunta ${question} exige --deal-id.`);
  }

  const mode = draft ? "draft" : question || dealId ? "question" : "briefing";
  const rawTimeout = flagValue(argv, "timeout-ms");
  const timeoutMs = rawTimeout ? Number(rawTimeout) : undefined;
  if (rawTimeout && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new Error("Timeout invalido: use --timeout-ms=<inteiro positivo>.");
  }

  return {
    mode,
    from,
    to,
    dealId,
    question: question ?? (mode === "question" ? "recommended_action" : null),
    withNarrative: !argv.includes("--no-ai"),
    timeoutMs,
  };
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function runSalesCopilotCli(supabase, options) {
  const shared = {
    from: options.from,
    to: options.to,
    complete: options.withNarrative ? aiComplete : undefined,
    withNarrative: options.withNarrative,
    timeoutMs: options.timeoutMs,
  };

  if (options.mode === "briefing") {
    return { mode: "briefing", persistence: "disabled", ...(await buildCopilotBriefing(supabase, shared)) };
  }
  if (options.mode === "draft") {
    const answer = await draftCopilotSuggestions(supabase, { ...shared, dealId: options.dealId });
    return { mode: "draft", persistence: "disabled", appliesAutomatically: false, answer };
  }
  const answer = await answerCopilotQuestion(supabase, {
    ...shared,
    question: options.question,
    dealId: options.dealId,
  });
  return { mode: "question", persistence: "disabled", answer };
}

async function main() {
  const options = parseSalesCopilotArgs();
  const result = await runSalesCopilotCli(getSupabase(), options);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
