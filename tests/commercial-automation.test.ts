import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import automation from "../src/lib/commercialAutomation.mjs";
import type { CommercialRule } from "../src/lib/commercialAutomation.mjs";
import { parseAutomationArgs } from "../scripts/commercial-automation.mjs";

const {
  ACTION_TYPES,
  EVENT_TYPES,
  createCommercialEvent,
  evaluateCommercialEvent,
  executeActionPlan,
  executionKey,
} = automation;

function rule(overrides: Partial<CommercialRule> = {}): CommercialRule {
  return {
    id: "reply-task",
    version: 1,
    eventType: "message.received",
    enabled: true,
    conditions: [{ field: "event.payload.responseType", operator: "equals", value: "humana" }],
    action: {
      type: "task.upsert",
      payload: {
        nextActionAt: "$event.payload.suggestedTask.at",
        nextActionType: "$event.payload.suggestedTask.type",
        note: "$event.payload.suggestedTask.note",
      },
    },
    ...overrides,
  };
}

test("contrato versionado aceita todos os eventos comerciais da Story 027", () => {
  assert.deepEqual(EVENT_TYPES, [
    "message.received",
    "message.sent",
    "deal.stage_changed",
    "deal.score_updated",
    "deal.next_action_due",
    "meeting.status_changed",
    "deal.qualification_updated",
    // Story 032: sugestao do copiloto aprovada pelo operador. O vocabulario de acoes
    // segue o mesmo — o copiloto nao ganhou poder novo, so um tipo de evento.
    "copilot.suggestion_accepted",
  ]);
  assert.deepEqual(ACTION_TYPES, [
    "task.upsert",
    "priority.set",
    "draft.create",
    "alert.create",
    "confirmation.request",
  ]);

  const event = createCommercialEvent({
    id: "uazapi:msg-1",
    type: "message.received",
    dealId: 42,
    occurredAt: "2026-08-11T12:00:00.000Z",
    source: "uazapi",
    payload: { responseType: "humana" },
  });
  assert.equal(event.contractVersion, 1);
  assert.equal(event.dealId, 42);
  assert.throws(() => createCommercialEvent({ id: "x", type: "message.delete" }), /nao suportado/i);
});

test("engine e deterministica, resolve payload e gera chave idempotente", () => {
  const event = createCommercialEvent({
    id: "uazapi:msg-2",
    type: "message.received",
    dealId: 7,
    occurredAt: "2026-08-11T13:00:00.000Z",
    source: "uazapi",
    payload: {
      responseType: "humana",
      suggestedTask: {
        at: "2026-08-11T13:00:00.000Z",
        type: "responder",
        note: "Responder a conversa recebida.",
      },
    },
  });

  const first = evaluateCommercialEvent({ event, rules: [rule()], deal: { next_action_source: "automatic" } });
  const repeated = evaluateCommercialEvent({ event, rules: [rule()], deal: { next_action_source: "automatic" } });
  assert.deepEqual(first, repeated);
  assert.equal(first[0].status, "planned");
  assert.deepEqual(first[0].action.payload, {
    nextActionAt: "2026-08-11T13:00:00.000Z",
    nextActionType: "responder",
    note: "Responder a conversa recebida.",
  });
  assert.equal(first[0].executionKey, executionKey(event, rule()));
});

test("regra desativada e condicao nao atendida registram motivo de skip", () => {
  const event = createCommercialEvent({ id: "evt-skip", type: "message.received", payload: { responseType: "bot" } });
  const decisions = evaluateCommercialEvent({
    event,
    rules: [rule({ enabled: false }), rule({ id: "human-only" })],
    deal: {},
  });
  const reasons = Object.fromEntries(decisions.map((item: { ruleId: string; reason: string }) => [item.ruleId, item.reason]));
  assert.deepEqual(reasons, {
    "human-only": "conditions_not_met",
    "reply-task": "rule_disabled",
  });
});

test("acao automatica preserva proxima acao manual e prioridade existente", () => {
  const event = createCommercialEvent({
    id: "evt-manual",
    type: "message.received",
    payload: { responseType: "humana", suggestedTask: { at: "2026-08-11T15:00:00Z", type: "responder", note: "x" } },
  });
  const priorityRule = rule({
    id: "priority",
    conditions: [],
    action: { type: "priority.set", payload: { priority: "Alta" } },
  });
  const decisions = evaluateCommercialEvent({
    event,
    rules: [rule(), priorityRule],
    deal: { next_action_source: "manual", priority: "Media", priority_source: "manual" },
  });
  const reasons = Object.fromEntries(decisions.map((item: { ruleId: string; reason: string }) => [item.ruleId, item.reason]));
  assert.deepEqual(reasons, {
    priority: "manual_priority_preserved",
    "reply-task": "manual_next_action_preserved",
  });

  const [automaticPriority] = evaluateCommercialEvent({
    event,
    rules: [priorityRule],
    deal: { priority: "Baixa", priority_source: "automatic" },
  });
  assert.equal(automaticPriority.status, "planned");
});

test("engine recusa envio, movimento de etapa e tipo de acao desconhecido", () => {
  const event = createCommercialEvent({ id: "evt-danger", type: "message.received", payload: {} });
  for (const type of ["message.send", "deal.stage.move", "deal.update_sensitive"]) {
    const [decision] = evaluateCommercialEvent({
      event,
      rules: [rule({ id: type, conditions: [], action: { type, payload: {} } })],
      deal: {},
    });
    assert.equal(decision.status, "skipped");
    assert.equal(decision.reason, "action_not_allowed");
  }
});

test("falha parcial nao interrompe as demais acoes", async () => {
  const event = createCommercialEvent({ id: "evt-partial", type: "message.received", payload: {} });
  const decisions = evaluateCommercialEvent({
    event,
    rules: [
      rule({ id: "fails", conditions: [], action: { type: "alert.create", payload: { message: "a" } } }),
      rule({ id: "works", conditions: [], action: { type: "draft.create", payload: { text: "b" } } }),
    ],
    deal: {},
  });
  const results = await executeActionPlan(decisions, async (decision: { ruleId: string }) => {
    if (decision.ruleId === "fails") throw new Error("falha isolada");
    return { status: "applied", reason: "activity_created" };
  });
  assert.deepEqual(results.map((item: { status: string }) => item.status), ["failed", "applied"]);
  assert.match(results[0].reason, /falha isolada/);
});

test("CLI e dry-run por padrao e --go e sempre explicito", () => {
  assert.deepEqual(parseAutomationArgs(["--event-type=deal.next_action_due", "--deal-id=9"]), {
    go: false,
    scanDue: false,
    eventType: "deal.next_action_due",
    eventId: "",
    dealId: 9,
    payload: {},
  });
  assert.equal(parseAutomationArgs(["--scan-due"]).scanDue, true);
  assert.equal(parseAutomationArgs(["--scan-due", "--go"]).go, true);
});

test("produtores e superficies existentes usam o contrato central sem criar pagina", () => {
  const files = [
    "../src/app/api/deals/route.ts",
    "../src/app/api/calendar/route.ts",
    "../src/app/api/webhooks/uazapi/route.ts",
    "../scripts/prospeccao-runner.mjs",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /commercialAutomation|commercial-automation|processCommercialEvent/);
  }
  const configuracoes = readFileSync(new URL("../src/app/configuracoes/page.tsx", import.meta.url), "utf8");
  const comando = readFileSync(new URL("../src/app/comando/page.tsx", import.meta.url), "utf8");
  const pipeline = readFileSync(new URL("../src/app/pipeline/page.tsx", import.meta.url), "utf8");
  assert.match(configuracoes, /automation_rules/);
  assert.match(comando, /automationAlerts/);
  assert.match(pipeline, /automation_task_upserted/);
});

test("migration e aditiva, idempotente e usa RLS deny-by-default", () => {
  const migration = readFileSync(
    new URL("../scripts/migrations/20260811_commercial_automation_engine.sql", import.meta.url),
    "utf8",
  );
  for (const table of ["commercial_events", "commercial_automation_rules", "commercial_automation_runs"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`drop policy if exists "Allow all" on public\\.${table}`));
  }
  assert.match(migration, /external_key text not null unique/);
  assert.match(migration, /execution_key text not null unique/);
  assert.doesNotMatch(migration, /create policy/i);
});
