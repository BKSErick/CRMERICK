import assert from "node:assert/strict";
import test from "node:test";

import { planAiQueryWithFallback } from "../src/lib/aiQueryPlanner.ts";
import type { DecideInput, DecideResult } from "../src/lib/typedDecision.mjs";

function decisao(answers: Record<string, unknown>): (input: DecideInput) => Promise<DecideResult> {
  return async () => ({ ok: true, answers: answers as never, invalid: [], evidencia: "", provider: "Groq", model: "teste", decidedBy: "llm", attempts: [] });
}

test("regex reconhece: nao chama modelo e marca decidedBy regra", async () => {
  let chamou = false;
  const resultado = await planAiQueryWithFallback("Qual é minha prioridade hoje?", {
    decideFn: async () => {
      chamou = true;
      throw new Error("nao deveria chamar");
    },
  });
  assert.equal(chamou, false);
  assert.equal(resultado.decidedBy, "regra");
  assert.equal(resultado.plan.intent, "daily_priorities");
});

test("regex nao reconhece: decisao tipada escolhe intencao fechada", async () => {
  const resultado = await planAiQueryWithFallback("quem me mandou mensagem no zap essa semana?", {
    decideFn: decisao({
      intent: { type: "choice", choice: "whatsapp_replies" },
      requiresSalesPlaybook: { type: "boolean", value: false },
      period: { type: "choice", choice: "last_7_days" },
    }),
  });
  assert.equal(resultado.decidedBy, "llm");
  assert.deepEqual(resultado.plan, { intent: "whatsapp_replies", filters: { limit: 20, period: "last_7_days" }, requiresSalesPlaybook: false });
});

test("modelo fora do ar mantem unknown com contexto minimo (AC 8 da Story 055)", async () => {
  const resultado = await planAiQueryWithFallback("Explique o que é um CRM", {
    decideFn: async () => ({ ok: false, reason: "unavailable", detail: "Nenhum modelo respondeu.", failures: [], attempts: [] }),
  });
  assert.equal(resultado.decidedBy, "regra");
  assert.equal(resultado.plan.intent, "unknown");
  assert.equal(resultado.note, "Nenhum modelo respondeu.");
});

test("resposta invalida do modelo nao vira filtro: cai no plano da regra", async () => {
  const resultado = await planAiQueryWithFallback("Explique o que é um CRM", {
    decideFn: decisao({ intent: null, requiresSalesPlaybook: null, period: null }),
  });
  assert.equal(resultado.plan.intent, "unknown");
  assert.deepEqual(resultado.plan.filters, { limit: 10 });
});

test("pedido de copy fora da regex liga o playbook pela decisao tipada", async () => {
  const resultado = await planAiQueryWithFallback("escreve algo pra reativar a usinagem que sumiu", {
    decideFn: decisao({
      intent: { type: "choice", choice: "unknown" },
      requiresSalesPlaybook: { type: "boolean", value: true },
      period: { type: "choice", choice: "last_30_days" },
    }),
  });
  assert.equal(resultado.plan.intent, "unknown");
  assert.equal(resultado.plan.requiresSalesPlaybook, true);
});

test("excecao no modelo nao derruba o chat", async () => {
  const resultado = await planAiQueryWithFallback("Explique o que é um CRM", {
    decideFn: async () => {
      throw new Error("explodiu");
    },
  });
  assert.equal(resultado.plan.intent, "unknown");
  assert.equal(resultado.note, "explodiu");
});
