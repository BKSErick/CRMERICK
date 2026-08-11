import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { EVENT_TYPES, evaluateCommercialEvent } from "../src/lib/commercialAutomation.mjs";
import type { CommercialEvent, CommercialRule } from "../src/lib/commercialAutomation.mjs";
import type { CopilotSuggestion, CopilotTaskSuggestion } from "../src/lib/salesCopilot.mjs";
import {
  COPILOT_QUESTIONS,
  COPILOT_SUGGESTION_KINDS,
  SALES_COPILOT_CONTRACT_VERSION,
  assertCopilotSuggestion,
  buildCopilotAnswer,
  buildCopilotContext,
  copilotSuggestionEvent,
  copilotUserPrompt,
  minimizeCopilotContext,
  parseCopilotSuggestions,
} from "../src/lib/salesCopilot.mjs";
import {
  answerCopilotQuestion,
  applyCopilotSuggestion,
  buildCopilotBriefing,
  loadCopilotContext,
  runCopilotNarrative,
  saveCopilotLearning,
} from "../src/lib/salesCopilotService.mjs";
import { parseSalesCopilotArgs, runSalesCopilotCli } from "../scripts/sales-copilot.mjs";

const NOW = "2026-08-11T12:00:00.000Z";
const PERIOD = { from: "2026-08-01", to: "2026-08-31" };

const DEALS = [
  {
    id: 1,
    company: "Metaltech",
    stage: "proposal",
    value: 12000,
    close_date: "2026-08-20",
    next_action_at: null,
    last_inbound_at: "2026-08-10T09:00:00.000Z",
    last_outbound_at: "2026-08-09T09:00:00.000Z",
    deal_health_score: 78,
    deal_health_classification: "saudavel",
    deal_health_recommended_action: "Confirmar o escopo com o decisor.",
    deal_health_calculated_at: "2026-08-11T08:00:00.000Z",
    qualification: {
      version: 1,
      fields: {
        problem: { status: "confirmed", value: "perda de orcamento" },
        impact: { status: "not_informed", value: null },
      },
    },
  },
  {
    id: 2,
    company: "Jotta Manutencoes",
    stage: "negotiation",
    value: 8000,
    close_date: "2026-08-05",
    next_action_at: "2026-08-08T12:00:00.000Z",
    last_inbound_at: "2026-07-01T09:00:00.000Z",
    deal_health_score: 22,
    deal_health_classification: "critico",
    deal_health_calculated_at: "2026-08-11T08:00:00.000Z",
  },
  {
    id: 3,
    company: "Fechado",
    stage: "won",
    value: 5000,
    next_action_at: null,
    deal_health_score: 95,
    deal_health_classification: "ganho",
  },
];

const LOSS_RECORDS = [
  { dealId: 9, reasonCode: "no_budget", previousStage: "proposal", recordedAt: "2026-08-03T10:00:00.000Z" },
  { dealId: 10, reasonCode: "no_response", previousStage: "abordado", recordedAt: "2026-08-04T10:00:00.000Z" },
  { dealId: 11, reasonCode: "no_budget", previousStage: "proposal", recordedAt: "2026-08-06T10:00:00.000Z" },
];

function contextFor(question: string, overrides: Record<string, unknown> = {}) {
  return buildCopilotContext({
    question,
    now: NOW,
    period: PERIOD,
    deals: DEALS,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// AC 1: o copiloto cobre o repertorio minimo de perguntas operacionais.
// ---------------------------------------------------------------------------

test("catalogo cobre as seis perguntas operacionais exigidas", () => {
  assert.equal(SALES_COPILOT_CONTRACT_VERSION, 1);
  assert.deepEqual(
    COPILOT_QUESTIONS.map((question) => question.key),
    [
      "attention_today",
      "proposals_at_risk",
      "deals_without_next_action",
      "deal_temperature",
      "funnel_leakage",
      "recommended_action",
    ],
  );
  assert.deepEqual(
    COPILOT_QUESTIONS.filter((question) => question.requiresDeal).map((question) => question.key),
    ["deal_temperature", "recommended_action"],
  );
});

test("atencao de hoje prioriza pelo valor e explica o fator de cada deal", () => {
  const context = contextFor("attention_today");
  assert.deepEqual(context.items.map((item) => item.dealId), [1, 2]);
  assert.ok(context.items[0].rules.includes("attention.no_next_action"));
  assert.ok(context.items[1].rules.includes("attention.next_action_overdue"));
  assert.ok(context.items[1].rules.includes("attention.health_at_risk"));
  // Deal ganho nao entra na fila de atencao.
  assert.ok(!context.items.some((item) => item.dealId === 3));
});

test("propostas em risco e deals sem proxima acao saem de fontes deterministicas", () => {
  const atRisk = contextFor("proposals_at_risk");
  assert.deepEqual(atRisk.items.map((item) => item.dealId), [1, 2]);
  assert.ok(atRisk.items.some((item) => item.rules.includes("risk.close_date_overdue")));

  const orphans = contextFor("deals_without_next_action");
  assert.deepEqual(orphans.items.map((item) => item.dealId), [1]);
  assert.equal(orphans.facts.find((fact) => fact.key === "deals_without_next_action")?.value, 1);
});

test("temperatura do deal combina saude e recencia da conversa", () => {
  const hot = contextFor("deal_temperature", { dealId: 1 });
  assert.equal(hot.items[0].temperature, "quente");
  assert.equal(hot.items[0].rules[0], "temperature.hot");

  const cold = contextFor("deal_temperature", { dealId: 2 });
  assert.equal(cold.items[0].temperature, "frio");
  assert.equal(cold.items[0].rules[0], "temperature.cold");
});

test("vazamento do funil aponta a etapa com mais perdas registradas", () => {
  const context = contextFor("funnel_leakage", { lossRecords: LOSS_RECORDS });
  assert.equal(context.items[0].stage, "proposal");
  assert.equal(context.items[0].losses, 2);
  assert.equal(context.items[0].sharePct, 66.7);
  assert.ok(context.items[0].rules.includes("leakage.stage_loss_share"));
});

// ---------------------------------------------------------------------------
// AC 2 e 3: evidencia sempre presente, limitacao declarada, frases classificadas.
// ---------------------------------------------------------------------------

test("resposta referencia periodo, fontes e evidencia concreta", () => {
  const answer = buildCopilotAnswer({ context: contextFor("attention_today") });
  assert.deepEqual(answer.period, PERIOD);
  assert.deepEqual(answer.sources, ["deals", "deal_health", "deal_forecast"]);
  assert.ok(answer.evidence.length > 0);
  assert.ok(answer.evidence.every((item) => item.key && item.label && item.origin));
  assert.ok(answer.statements.some((statement) => statement.evidenceKeys.length > 0));
});

test("sem evidencia a resposta declara a limitacao em vez de inventar", () => {
  const context = buildCopilotContext({ question: "funnel_leakage", now: NOW, period: PERIOD, deals: [], lossRecords: [] });
  const answer = buildCopilotAnswer({ context });
  assert.equal(answer.dataAvailable, false);
  assert.ok(answer.limitations.some((limitation) => /Nenhuma perda registrada/i.test(limitation)));
  assert.ok(!answer.statements.some((statement) => statement.classification === "ai_suggestion"));
});

test("deal inexistente vira limitacao declarada, nao resposta fabricada", () => {
  const context = contextFor("deal_temperature", { dealId: 999 });
  assert.equal(context.dataAvailable, false);
  assert.ok(context.limitations.some((limitation) => /999 nao encontrado/i.test(limitation)));
  assert.equal(context.items.length, 0);
});

test("cada frase sai rotulada como fato, regra ou sugestao de IA", () => {
  const answer = buildCopilotAnswer({
    context: contextFor("attention_today"),
    narrative: "Priorize a Metaltech hoje.",
    ai: { status: "ok", provider: "Mock", model: "mock-1", attempts: [] },
  });
  const classifications = new Set(answer.statements.map((statement) => statement.classification));
  assert.ok(classifications.has("fact"));
  assert.ok(classifications.has("rule"));
  assert.ok(classifications.has("ai_suggestion"));
  assert.ok(answer.statements.every((statement) => ["fact", "rule", "ai_suggestion"].includes(statement.classification)));
  const rules = answer.statements.filter((statement) => statement.classification === "rule");
  assert.ok(rules.every((statement) => typeof statement.ruleId === "string" && statement.ruleId.length > 0));
});

test("narrativa da IA nao entra na resposta quando o provedor falhou", () => {
  const answer = buildCopilotAnswer({
    context: contextFor("attention_today"),
    narrative: "texto que nao deveria aparecer",
    ai: { status: "unavailable", provider: null, model: null, attempts: [], error: "timeout" },
  });
  assert.ok(!answer.statements.some((statement) => statement.classification === "ai_suggestion"));
  assert.equal(answer.ai.status, "unavailable");
  assert.ok(answer.statements.length > 0);
});

// ---------------------------------------------------------------------------
// AC 4 e 5: sugestao nunca vira acao sozinha.
// ---------------------------------------------------------------------------

test("sugestoes se limitam a tarefa e rascunho, sempre exigindo confirmacao", () => {
  assert.deepEqual([...COPILOT_SUGGESTION_KINDS], ["task", "draft"]);
  const answer = buildCopilotAnswer({ context: contextFor("recommended_action", { dealId: 1 }) });
  assert.ok(answer.suggestions.length > 0);
  assert.ok(answer.suggestions.every((suggestion) => suggestion.requiresConfirmation === true));
  assert.ok(answer.suggestions.every((suggestion) => COPILOT_SUGGESTION_KINDS.includes(suggestion.kind)));
});

test("parser descarta qualquer sugestao que tente agir sozinha", () => {
  const content = JSON.stringify({
    suggestions: [
      { kind: "task", note: "Confirmar escopo com o decisor.", nextActionAt: "2026-08-12T12:00:00.000Z" },
      { kind: "draft", text: "Oi, tudo bem? Podemos revisar a proposta?" },
      { kind: "stage_change", stage: "won" },
      { kind: "task", note: "Fechar por 5000", value: 5000 },
      { kind: "draft", text: "Enviar agora", send: true },
      { kind: "task", note: "Subir prioridade", priority: "Alta" },
      { kind: "draft", text: "confirma?", qualification: { problem: "ok" } },
    ],
  });
  const suggestions = parseCopilotSuggestions(content, { dealId: 1, now: NOW });
  assert.equal(suggestions.length, 2);
  assert.deepEqual(suggestions.map((suggestion) => suggestion.kind), ["task", "draft"]);
});

test("parser ignora saida invalida do modelo sem quebrar", () => {
  assert.deepEqual(parseCopilotSuggestions("desculpe, nao consegui", { dealId: 1 }), []);
  assert.deepEqual(parseCopilotSuggestions('{"suggestions":[', { dealId: 1 }), []);
  assert.deepEqual(parseCopilotSuggestions('{"suggestions":[{"kind":"task"}]}', { dealId: 1 }), []);
  assert.deepEqual(parseCopilotSuggestions('{"suggestions":[{"kind":"task","note":"x"}]}', {}), []);
});

test("aplicar exige operador identificado e confirmacao explicita", async () => {
  const suggestion: CopilotSuggestion = {
    kind: "task",
    dealId: 1,
    company: "Metaltech",
    title: "t",
    note: "Ligar",
    nextActionAt: "2026-08-12T12:00:00.000Z",
    nextActionType: "followup_silencio",
    origin: "rule",
    requiresConfirmation: true,
  };
  await assert.rejects(
    () => applyCopilotSuggestion({}, { suggestion, actor: "erick@crm", confirmed: false }),
    /confirmacao explicita/i,
  );
  await assert.rejects(
    () => applyCopilotSuggestion({}, { suggestion, actor: "", confirmed: true }),
    /operador que confirmou/i,
  );
  assert.throws(() => assertCopilotSuggestion({ kind: "stage.change", dealId: 1 }), /nao autorizada/i);
  assert.throws(() => assertCopilotSuggestion({ kind: "task", dealId: 1, note: "x" }), /nextActionAt/i);
});

test("sugestao aprovada entra pelo motor da Story 027 e e idempotente", () => {
  const suggestion: CopilotTaskSuggestion = {
    kind: "task",
    dealId: 1,
    company: "Metaltech",
    title: "Agendar",
    note: "Confirmar escopo com o decisor.",
    nextActionAt: "2026-08-12T12:00:00.000Z",
    nextActionType: "followup_silencio",
    origin: "rule",
    requiresConfirmation: true,
  };
  const event = copilotSuggestionEvent(suggestion, { actor: "erick@crm", at: NOW }) as unknown as CommercialEvent;
  assert.equal(event.type, "copilot.suggestion_accepted");
  assert.ok(EVENT_TYPES.includes(event.type));
  assert.equal(event.payload.confirmedBy, "erick@crm");
  assert.equal(copilotSuggestionEvent(suggestion, { actor: "erick@crm", at: "2026-08-12T00:00:00.000Z" }).id, event.id);

  const rules: CommercialRule[] = [
    {
      id: "copilot-task-suggestion-v1",
      version: 1,
      eventType: "copilot.suggestion_accepted",
      enabled: true,
      conditions: [
        { field: "event.payload.suggestion.kind", operator: "equals", value: "task" },
        { field: "event.payload.confirmedBy", operator: "exists" },
      ],
      action: {
        type: "task.upsert",
        payload: {
          nextActionAt: "$event.payload.suggestion.nextActionAt",
          nextActionType: "$event.payload.suggestion.nextActionType",
          note: "$event.payload.suggestion.note",
        },
      },
    },
    {
      id: "copilot-draft-suggestion-v1",
      version: 1,
      eventType: "copilot.suggestion_accepted",
      enabled: true,
      conditions: [
        { field: "event.payload.suggestion.kind", operator: "equals", value: "draft" },
        { field: "event.payload.confirmedBy", operator: "exists" },
      ],
      action: { type: "draft.create", payload: { text: "$event.payload.suggestion.text" } },
    },
  ];
  const decisions = evaluateCommercialEvent({ event, rules, deal: { id: 1 } });
  const planned = decisions.filter((decision) => decision.status === "planned");
  assert.equal(planned.length, 1);
  assert.equal(planned[0].action.type, "task.upsert");
  assert.equal(planned[0].action.payload.nextActionAt, "2026-08-12T12:00:00.000Z");
  assert.equal(decisions.find((decision) => decision.ruleId === "copilot-draft-suggestion-v1")?.status, "skipped");
});

test("proxima acao manual do operador nao e sobrescrita pela sugestao aprovada", () => {
  const suggestion: CopilotTaskSuggestion = {
    kind: "task",
    dealId: 1,
    company: null,
    title: "t",
    note: "Ligar",
    nextActionAt: "2026-08-12T12:00:00.000Z",
    nextActionType: "followup_silencio",
    origin: "rule",
    requiresConfirmation: true,
  };
  const event = copilotSuggestionEvent(suggestion, { actor: "erick@crm", at: NOW }) as unknown as CommercialEvent;
  const decisions = evaluateCommercialEvent({
    event,
    rules: [{
      id: "copilot-task-suggestion-v1",
      version: 1,
      eventType: "copilot.suggestion_accepted",
      enabled: true,
      conditions: [],
      action: { type: "task.upsert", payload: {} },
    }],
    deal: { id: 1, next_action_source: "manual" },
  });
  assert.equal(decisions[0].status, "skipped");
  assert.equal(decisions[0].reason, "manual_next_action_preserved");
});

test("nenhuma superficie do copiloto envia mensagem, muda etapa ou preco", () => {
  const copilot = readFileSync(new URL("../src/lib/salesCopilot.mjs", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/lib/salesCopilotService.mjs", import.meta.url), "utf8");
  const cli = readFileSync(new URL("../scripts/sales-copilot.mjs", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../scripts/migrations/20260811_sales_copilot.sql", import.meta.url), "utf8");

  assert.doesNotMatch(`${copilot}${service}${cli}`, /\.update\(\s*\{[^}]*stage/i);
  assert.doesNotMatch(`${copilot}${service}${cli}`, /uazapi|whatsappSend|sendText\(/i);
  // O nucleo e o servico nao falam com a rede: quem chama provedor e o injetado.
  assert.doesNotMatch(`${copilot}${service}`, /fetch\(/);
  assert.doesNotMatch(cli, /\.update\(|\.insert\(|--go/);
  // O motor so recebe as duas acoes permitidas.
  assert.match(migration, /'task\.upsert'/);
  assert.match(migration, /'draft\.create'/);
  assert.doesNotMatch(migration, /'priority\.set'|'confirmation\.request'/);
});

// ---------------------------------------------------------------------------
// AC 11: minimizacao dos dados enviados ao modelo.
// ---------------------------------------------------------------------------

test("contexto enviado ao modelo e minimizado e sem dado sensivel", () => {
  const context = buildCopilotContext({
    question: "deal_temperature",
    dealId: 1,
    now: NOW,
    period: PERIOD,
    deals: [{
      ...DEALS[0],
      company: "Metaltech (contato 31 99999-8888, compras@metaltech.com.br)",
      phone: "5531999998888",
      next_action_note: "Ligar para +55 31 98888-7777 e mandar https://metaltech.com.br/proposta",
    }],
  });
  const minimized = minimizeCopilotContext(context) as {
    items: Array<Record<string, unknown>>;
  } & Record<string, unknown>;
  const serialized = JSON.stringify(minimized);

  assert.doesNotMatch(serialized, /99999-8888|98888-7777|5531999998888/);
  assert.doesNotMatch(serialized, /@metaltech\.com\.br/);
  assert.doesNotMatch(serialized, /https?:\/\//);
  assert.deepEqual(Object.keys(minimized).sort(), [
    "contractVersion", "facts", "generatedAt", "items", "limitations", "period", "question", "questionLabel",
  ]);
  assert.deepEqual(Object.keys(minimized.items[0]).sort(), ["company", "dealId", "reasons", "stage"]);

  const prompt = copilotUserPrompt(context);
  assert.doesNotMatch(prompt, /5531999998888/);
  assert.match(prompt, /Contexto \(JSON/);
});

test("prompt nao carrega credencial e o servico nao le chave de provedor", () => {
  const service = readFileSync(new URL("../src/lib/salesCopilotService.mjs", import.meta.url), "utf8");
  const copilot = readFileSync(new URL("../src/lib/salesCopilot.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(`${service}${copilot}`, /API_KEY|SERVICE_ROLE|Authorization/);
});

// ---------------------------------------------------------------------------
// AC 10: falha, timeout e degradacao segura.
// ---------------------------------------------------------------------------

test("sem provedor injetado a resposta sai deterministica com status skipped", async () => {
  const trail = await runCopilotNarrative(undefined, contextFor("attention_today"));
  assert.equal(trail.status, "skipped");
  assert.equal(trail.content, null);
  assert.deepEqual(trail.attempts, []);
});

test("timeout do provedor e observavel e nao derruba a resposta", async () => {
  const context = contextFor("attention_today");
  const slow = () => new Promise<null>(() => {});
  const trail = await runCopilotNarrative(slow, context, { timeoutMs: 25, attempts: 2 });
  assert.equal(trail.status, "unavailable");
  assert.equal(trail.attempts.length, 2);
  assert.ok(trail.attempts.every((attempt) => attempt.outcome === "timeout"));
  assert.match(trail.error ?? "", /Tempo limite/i);

  const answer = buildCopilotAnswer({ context, narrative: trail.content, ai: trail });
  assert.ok(answer.statements.length > 0);
  assert.equal(answer.ai.status, "unavailable");
  assert.equal(answer.ai.attempts.length, 2);
});

test("retry recupera a narrativa depois de uma falha do provedor", async () => {
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls === 1) throw new Error("HTTP 502");
    return { content: "Priorize a Metaltech.", provider: "Mock", model: "mock-1" };
  };
  const trail = await runCopilotNarrative(flaky, contextFor("attention_today"), { attempts: 2 });
  assert.equal(trail.status, "ok");
  assert.equal(trail.attempts[0].outcome, "error");
  assert.equal(trail.attempts[1].outcome, "ok");
  assert.equal(trail.content, "Priorize a Metaltech.");
});

test("resposta vazia do provedor conta como indisponivel, nao como conteudo", async () => {
  const trail = await runCopilotNarrative(async () => null, contextFor("attention_today"), { attempts: 1 });
  assert.equal(trail.status, "unavailable");
  assert.equal(trail.attempts[0].outcome, "empty");
});

// ---------------------------------------------------------------------------
// Servico: leitura das fontes reais com provider mockado.
// ---------------------------------------------------------------------------

function supabaseStub(options: { deals?: unknown[]; lossRecords?: unknown[]; calls?: string[]; failForecast?: boolean } = {}) {
  const calls = options.calls ?? [];
  return {
    from(table: string) {
      calls.push(`from:${table}`);
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => builder,
        eq: (field: string, value: unknown) => {
          calls.push(`eq:${table}:${field}:${String(value)}`);
          return builder;
        },
        in: () => builder,
        gte: () => builder,
        lte: () => builder,
        not: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: { id: 77 }, error: null }),
        insert: () => {
          calls.push(`insert:${table}`);
          return builder;
        },
        update: () => {
          calls.push(`update:${table}`);
          return builder;
        },
        range: async () => {
          if (table === "deals" && options.failForecast) return { data: null, error: new Error("deals fora do ar") };
          return { data: table === "deals" ? (options.deals ?? DEALS) : [], error: null };
        },
        limit: async () => ({ data: table === "deal_loss_records" ? (options.lossRecords ?? []) : [], error: null }),
      };
      return builder;
    },
  };
}

test("servico le as fontes reais, aplica filtro por deal e nao persiste nada", async () => {
  const calls: string[] = [];
  const context = await loadCopilotContext(supabaseStub({ calls }), {
    question: "deal_temperature",
    dealId: 1,
    now: NOW,
    ...PERIOD,
  });
  assert.equal(context.items[0].dealId, 1);
  assert.ok(calls.includes("eq:deals:id:1"));
  assert.ok(!calls.some((call) => call.startsWith("update:") || call.startsWith("insert:")));
});

test("resposta completa usa provider mockado e mantem a evidencia", async () => {
  const complete = async () => ({ content: "Metaltech precisa de proxima acao hoje.", provider: "Mock", model: "mock-1" });
  const answer = await answerCopilotQuestion(supabaseStub(), {
    question: "attention_today",
    now: NOW,
    ...PERIOD,
    complete,
  });
  assert.equal(answer.ai.status, "ok");
  assert.equal(answer.ai.provider, "Mock");
  assert.ok(answer.statements.some((statement) => statement.classification === "ai_suggestion"));
  assert.ok(answer.evidence.length > 0);
});

test("briefing diario responde as perguntas gerais em uma passada", async () => {
  const briefing = await buildCopilotBriefing(supabaseStub(), { now: NOW, ...PERIOD, withNarrative: false });
  assert.deepEqual(
    briefing.answers.map((answer) => answer.question),
    ["attention_today", "proposals_at_risk", "deals_without_next_action", "funnel_leakage"],
  );
  assert.deepEqual(briefing.period, PERIOD);
  assert.ok(briefing.answers.every((answer) => answer.ai.status === "skipped"));
});

test("fonte secundaria fora do ar vira limitacao declarada, nao erro de tela", async () => {
  const supabase = {
    from(table: string) {
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => builder,
        eq: () => builder,
        in: () => builder,
        gte: () => builder,
        lte: () => builder,
        range: async () => ({ data: table === "deals" ? DEALS : [], error: null }),
        limit: async () => {
          if (table === "deal_loss_records") throw new Error("perdas fora do ar");
          return { data: [], error: null };
        },
      };
      return builder;
    },
  };
  const context = await loadCopilotContext(supabase, { question: "funnel_leakage", now: NOW, ...PERIOD });
  assert.ok(context.limitations.some((limitation) => /fora do ar/i.test(limitation)));
});

test("Achados so recebe aprendizado com confirmacao explicita do operador", async () => {
  await assert.rejects(
    () => saveCopilotLearning(supabaseStub(), { content: "aprendizado", actor: "erick@crm", confirmed: false }),
    /confirmacao explicita/i,
  );
  await assert.rejects(
    () => saveCopilotLearning(supabaseStub(), { content: "", actor: "erick@crm", confirmed: true }),
    /vazio/i,
  );
  const calls: string[] = [];
  const saved = await saveCopilotLearning(supabaseStub({ calls }), {
    content: "Proposta trava quando falta o decisor.",
    actor: "erick@crm",
    confirmed: true,
    dealId: 1,
  });
  assert.equal(saved.id, 77);
  assert.ok(calls.includes("insert:insights"));
});

// ---------------------------------------------------------------------------
// AC 9 e 12: CLI equivalente e navegacao inalterada.
// ---------------------------------------------------------------------------

test("CLI cobre briefing, consulta por deal e rascunho, sempre somente leitura", async () => {
  assert.equal(parseSalesCopilotArgs([], new Date(NOW)).mode, "briefing");
  assert.deepEqual(parseSalesCopilotArgs(["--from=2026-08-01", "--to=2026-08-31"], new Date(NOW)), {
    mode: "briefing",
    from: "2026-08-01",
    to: "2026-08-31",
    dealId: null,
    question: null,
    withNarrative: true,
    timeoutMs: undefined,
  });
  assert.equal(parseSalesCopilotArgs(["--deal-id=1", "--question=deal_temperature"], new Date(NOW)).mode, "question");
  assert.equal(parseSalesCopilotArgs(["--deal-id=1", "--draft"], new Date(NOW)).mode, "draft");
  assert.equal(parseSalesCopilotArgs(["--no-ai"], new Date(NOW)).withNarrative, false);

  assert.throws(() => parseSalesCopilotArgs(["--from=2026-08-31", "--to=2026-08-01"]), /periodo invalido/i);
  assert.throws(() => parseSalesCopilotArgs(["--deal-id=0"]), /deal invalido/i);
  assert.throws(() => parseSalesCopilotArgs(["--question=inventada"]), /pergunta invalida/i);
  assert.throws(() => parseSalesCopilotArgs(["--question=deal_temperature"]), /exige --deal-id/i);
  assert.throws(() => parseSalesCopilotArgs(["--draft"]), /exige --deal-id/i);

  const calls: string[] = [];
  const briefing = await runSalesCopilotCli(supabaseStub({ calls }), {
    mode: "briefing",
    ...PERIOD,
    dealId: null,
    question: null,
    withNarrative: false,
  }) as { persistence: string; answers: unknown[] };
  assert.equal(briefing.persistence, "disabled");
  assert.equal(briefing.answers.length, 4);

  const draft = await runSalesCopilotCli(supabaseStub({ calls }), {
    mode: "draft",
    ...PERIOD,
    dealId: 1,
    question: null,
    withNarrative: false,
  }) as { appliesAutomatically: boolean };
  assert.equal(draft.appliesAutomatically, false);
  assert.ok(!calls.some((call) => call.startsWith("update:") || call.startsWith("insert:")));
});

test("copiloto entra nas superficies atuais sem criar rota, aba ou dashboard novo", () => {
  const command = readFileSync(new URL("../src/app/comando/page.tsx", import.meta.url), "utf8");
  const pipeline = readFileSync(new URL("../src/app/pipeline/page.tsx", import.meta.url), "utf8");
  const insights = readFileSync(new URL("../src/app/insights/page.tsx", import.meta.url), "utf8");
  const navigation = readFileSync(new URL("../src/lib/navigation.ts", import.meta.url), "utf8");
  const aiRoute = readFileSync(new URL("../src/app/api/ai/route.ts", import.meta.url), "utf8");

  assert.match(command, /CopilotPanel|CopilotAnswerBody/);
  assert.match(command, /copilot-ask/);
  assert.match(pipeline, /CopilotPanel/);
  assert.match(insights, /copiloto/);
  assert.match(aiRoute, /copilot-brief/);
  // Nenhuma rota nova: o copiloto vive dentro de /api/ai e das telas que ja existiam.
  assert.doesNotMatch(`${command}${pipeline}${insights}`, /href=["']\/copilot/);
  assert.doesNotMatch(navigation, /copilot/i);
});

test("acoes de escrita do copiloto exigem sessao administrativa", () => {
  const aiRoute = readFileSync(new URL("../src/app/api/ai/route.ts", import.meta.url), "utf8");
  assert.match(aiRoute, /COPILOT_WRITE_ACTIONS/);
  assert.match(aiRoute, /verifyAdminSession/);
  assert.match(aiRoute, /status: 401/);
  // O operador nunca vem do corpo do request.
  assert.doesNotMatch(aiRoute, /actor:\s*(?:String\()?body\.actor/);
});
