import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAiQueryPlan, planAiQuery } from "../src/lib/aiQueryRouter.ts";

test("roteia prioridades do dia sem pedir o CRM inteiro", () => {
  assert.deepEqual(planAiQuery("Qual é minha prioridade hoje?"), {
    intent: "daily_priorities",
    filters: { period: "today", limit: 20 },
    requiresSalesPlaybook: false,
  });
});

test("roteia emails e WhatsApp que aguardam resposta", () => {
  assert.equal(planAiQuery("Quem respondeu meu e-mail e precisa de retorno?").intent, "email_replies");
  assert.equal(planAiQuery("Quais prospects responderam no WhatsApp?").intent, "whatsapp_replies");
});

test("busca de prospect preserva somente o termo tipado e limitado", () => {
  const plan = planAiQuery("Procure o prospect Acme Industrial");
  assert.equal(plan.intent, "deal_search");
  assert.equal(plan.filters.textContains, "Acme Industrial");
  assert.equal(plan.filters.limit, 20);
});

test("busca natural converte etapa e score em filtros fechados", () => {
  const plan = planAiQuery("prospects com score acima de 7");
  assert.equal(plan.intent, "deal_search");
  assert.deepEqual(plan.filters.stageIn, ["prospect"]);
  assert.equal(plan.filters.minPoints, 7);
  assert.equal(plan.filters.textContains, undefined);
});

test("intencao desconhecida e minima e nunca vira escopo all", () => {
  assert.deepEqual(planAiQuery("Explique o que é um CRM"), {
    intent: "unknown",
    filters: { limit: 10 },
    requiresSalesPlaybook: false,
  });
});

test("normalizacao rejeita campos operacionais e propriedades fora da allowlist", () => {
  for (const payload of [
    { intent: "deal_search", filters: { limit: 10 }, sql: "select * from deals" },
    { intent: "deal_search", filters: { endpoint: "/api/deals" } },
    { intent: "deal_search", filters: { limit: 10, mutation: "delete" } },
    { intent: "anything", filters: {} },
  ]) {
    assert.throws(() => normalizeAiQueryPlan(payload), /plano|campo|intencao/i);
  }
});

test("normalizacao aplica teto de 50 e valida os filtros conhecidos", () => {
  assert.deepEqual(
    normalizeAiQueryPlan({ intent: "deal_search", filters: { limit: 999, textContains: "  Acme  " } }),
    { intent: "deal_search", filters: { limit: 50, textContains: "Acme" }, requiresSalesPlaybook: false },
  );
});
