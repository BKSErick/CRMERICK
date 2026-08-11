import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEAL_HEALTH_RISK_MAX_SCORE,
  DEAL_HEALTH_RUBRIC,
  calculateDealHealth,
} from "../src/lib/dealHealth.mjs";
import {
  buildDealHealthInput,
  dealHealthFingerprint,
  recalculateDealHealth,
} from "../src/lib/dealHealthService.mjs";
import { parseDealHealthArgs } from "../scripts/deal-health.mjs";

const NOW = "2026-08-11T12:00:00.000Z";

function daysAgo(days: number) {
  return new Date(new Date(NOW).getTime() - days * 86400000).toISOString();
}

function daysAhead(days: number) {
  return new Date(new Date(NOW).getTime() + days * 86400000).toISOString();
}

test("rubrica e publica, versionada e separa deal health de lead score", () => {
  assert.equal(DEAL_HEALTH_RUBRIC.version, 1);
  assert.equal(DEAL_HEALTH_RUBRIC.metric, "deal_health");
  assert.equal(DEAL_HEALTH_RUBRIC.baseScore, 50);
  assert.equal(DEAL_HEALTH_RUBRIC.riskMaxScore, DEAL_HEALTH_RISK_MAX_SCORE);
  assert.equal(DEAL_HEALTH_RUBRIC.stageImpact.negotiation, 8);
  assert.ok(DEAL_HEALTH_RUBRIC.factors.every((factor) => Number.isInteger(factor.impact)));
});

test("negocio saudavel explica todos os sinais e limita a nota em 100", () => {
  const health = calculateDealHealth({
    now: NOW,
    deal: {
      id: 1,
      stage: "negotiation",
      stageEnteredAt: daysAgo(2),
      lastInboundAt: daysAgo(1),
      lastOutboundAt: daysAgo(2),
      responseType: "encaminhamento",
      referredPhone: "5531999999999",
      nextActionAt: daysAhead(2),
      nextActionNote: "Apresentar fechamento ao decisor.",
      closeDate: "2026-08-20",
    },
    meetings: [{ status: "held", startsAt: daysAgo(2) }],
  });

  assert.equal(health.dealHealthScore, 100);
  assert.equal(health.classification, "excelente");
  assert.equal(health.computedAt, NOW);
  assert.ok(health.factors.some((factor) => factor.key === "human_response"));
  assert.ok(health.factors.some((factor) => factor.key === "decision_maker"));
  assert.ok(health.factors.some((factor) => factor.key === "meeting_held"));
  assert.deepEqual(health.risks, []);
});

test("negocio parado com proposta sem retorno recebe riscos explicitos", () => {
  const health = calculateDealHealth({
    now: NOW,
    deal: {
      id: 2,
      stage: "proposal",
      stageEnteredAt: daysAgo(20),
      lastOutboundAt: daysAgo(20),
      nextActionAt: null,
    },
    meetings: [],
  });

  assert.equal(health.dealHealthScore, 25);
  assert.equal(health.classification, "em_risco");
  assert.deepEqual(health.risks.map((risk) => risk.key).sort(), [
    "missing_next_action",
    "proposal_without_return",
    "stage_stalled",
  ]);
  assert.match(health.recommendedNextAction, /proposta/i);
});

test("dados ausentes reduzem confianca e geram avisos sem criar risco inventado", () => {
  const health = calculateDealHealth({ now: NOW, deal: { id: 3, stage: "prospect" }, meetings: [] });

  assert.equal(health.dealHealthScore, 50);
  assert.equal(health.risks.length, 0);
  assert.ok(health.confidence <= 20);
  assert.ok(health.warnings.length >= 4);
});

test("proxima acao manual prevalece na recomendacao", () => {
  const health = calculateDealHealth({
    now: NOW,
    deal: {
      id: 4,
      stage: "qualified",
      stageEnteredAt: daysAgo(5),
      responseType: "humana",
      responseTypeSource: "manual",
      nextActionAt: daysAhead(2),
      nextActionNote: "Ligar para o decisor na quinta.",
      nextActionSource: "manual",
    },
    meetings: [],
  });

  assert.equal(health.classification, "saudavel");
  assert.equal(health.recommendedNextAction, "Manter acao manual: Ligar para o decisor na quinta.");
  assert.ok(health.factors.some((factor) => factor.key === "manual_next_action"));
});

test("reuniao realizada e proposta sem retorno sao sinais distintos", () => {
  const held = calculateDealHealth({
    now: NOW,
    deal: { id: 5, stage: "abordado", stageEnteredAt: daysAgo(2) },
    meetings: [{ status: "held", startsAt: daysAgo(1) }],
  });
  assert.ok(held.factors.some((factor) => factor.key === "meeting_held"));

  const proposal = calculateDealHealth({
    now: NOW,
    deal: { id: 6, stage: "proposal", stageEnteredAt: daysAgo(8), lastOutboundAt: daysAgo(8) },
    meetings: [{ status: "held", startsAt: daysAgo(10) }],
  });
  assert.ok(proposal.factors.some((factor) => factor.key === "meeting_held"));
  assert.ok(proposal.risks.some((risk) => risk.key === "proposal_without_return"));
});

test("no-show mais recente prevalece sobre reuniao antiga realizada", () => {
  const health = calculateDealHealth({
    now: NOW,
    deal: { id: 60, stage: "qualified", stageEnteredAt: daysAgo(4) },
    meetings: [
      { status: "held", startsAt: daysAgo(10) },
      { status: "no_show", startsAt: daysAgo(1) },
    ],
  });

  assert.ok(health.risks.some((risk) => risk.key === "meeting_no_show"));
  assert.ok(!health.factors.some((factor) => factor.key === "meeting_held"));
});

test("mesma entrada produz exatamente a mesma explicacao", () => {
  const input = {
    now: NOW,
    deal: { id: 7, stage: "followup", stageEnteredAt: daysAgo(4), lastInboundAt: daysAgo(2) },
    meetings: [],
  };
  assert.deepEqual(calculateDealHealth(input), calculateDealHealth(input));
});

test("previsao de fechamento no proprio dia nao e tratada como vencida", () => {
  const health = calculateDealHealth({
    now: NOW,
    deal: { id: 70, stage: "qualified", closeDate: "2026-08-11" },
    meetings: [],
  });
  assert.ok(health.factors.some((factor) => factor.key === "expected_close"));
  assert.ok(!health.risks.some((risk) => risk.key === "expected_close_overdue"));
});

test("fontes reais reconstroem entrada e fingerprint idempotente", () => {
  const input = buildDealHealthInput({
    now: NOW,
    deal: { id: 8, stage: "qualified", created_at: daysAgo(10), response_type: "humana" },
    messages: [
      { direction: "sent", occurred_at: daysAgo(3) },
      { direction: "received", occurred_at: daysAgo(2) },
    ],
    meetings: [{ meeting_status: "confirmed", starts_at: daysAhead(1), done: false }],
  });
  const health = calculateDealHealth(input);
  assert.equal(input.deal.lastInboundAt, daysAgo(2));
  assert.equal(input.deal.lastOutboundAt, daysAgo(3));
  assert.equal(dealHealthFingerprint(input, health), dealHealthFingerprint(input, health));
  assert.notEqual(
    dealHealthFingerprint(input, health),
    dealHealthFingerprint({ ...input, deal: { ...input.deal, nextActionAt: daysAhead(1) } }, health),
  );
});

test("CLI simula por padrao, valida faixa e exige --go para persistir", () => {
  assert.deepEqual(parseDealHealthArgs(["--deal-id=9", "--min-score=0", "--max-score=44"]), {
    go: false,
    dealId: 9,
    minScore: 0,
    maxScore: 44,
  });
  assert.equal(parseDealHealthArgs(["--go"]).go, true);
  assert.throws(() => parseDealHealthArgs(["--min-score=80", "--max-score=20"]), /faixa invalida/i);
});

test("migration, eventos e superficies existentes compartilham deal health", () => {
  const migration = readFileSync(new URL("../scripts/migrations/20260811_deal_health.sql", import.meta.url), "utf8");
  const commercialEvents = readFileSync(new URL("../src/lib/commercialAutomationService.mjs", import.meta.url), "utf8");
  const dealsRoute = readFileSync(new URL("../src/app/api/deals/route.ts", import.meta.url), "utf8");
  const pipeline = readFileSync(new URL("../src/app/pipeline/page.tsx", import.meta.url), "utf8");
  const comando = readFileSync(new URL("../src/app/comando/page.tsx", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../scripts/prospeccao-runner.mjs", import.meta.url), "utf8");

  assert.match(migration, /add column if not exists deal_health_score integer/);
  assert.match(migration, /deal_health_fingerprint text/);
  assert.match(migration, /between 0 and 100/);
  assert.match(commercialEvents, /recalculateDealHealthBestEffort/);
  assert.match(dealsRoute, /stage_entered_at/);
  assert.match(pipeline, /Saude explicavel do negocio/);
  assert.match(pipeline, /Lead score:/);
  assert.match(comando, /healthReview/);
  assert.match(runner, /scripts\/deal-health\.mjs/);
  assert.doesNotMatch(pipeline, /href=["']\/saude/);
});

test("persistencia grava uma vez e ignora recalculo com o mesmo fingerprint", async () => {
  const state = {
    deal: {
      id: 10,
      stage: "qualified",
      created_at: daysAgo(4),
      updated_at: daysAgo(1),
      stage_entered_at: daysAgo(4),
      last_inbound_at: daysAgo(1),
      last_outbound_at: daysAgo(2),
      response_type: "humana",
      response_type_source: "manual",
      referred_phone: null,
      next_action_at: daysAhead(2),
      next_action_note: "Ligar quinta.",
      next_action_source: "manual",
      close_date: null,
      deal_health_fingerprint: null as string | null,
    },
    updates: 0,
    activities: 0,
  };
  const supabase = {
    from(table: string) {
      return {
        select() {
          const filters: Record<string, unknown> = {};
          const builder = {
            eq(field: string, value: unknown) { filters[field] = value; return builder; },
            order() { return builder; },
            limit: async () => ({
              data: table === "messages" ? [] : table === "calendar_events" ? [] : null,
              error: null,
            }),
            single: async () => ({ data: { ...state.deal }, error: null }),
          };
          return builder;
        },
        update(payload: Record<string, unknown>) {
          const builder = {
            eq() { return builder; },
            or() { return builder; },
            select: async () => {
              Object.assign(state.deal, payload);
              state.updates++;
              return { data: [{ id: state.deal.id }], error: null };
            },
          };
          return builder;
        },
        insert() {
          state.activities++;
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  const first = await recalculateDealHealth(supabase, 10, { apply: true, now: NOW });
  const repeated = await recalculateDealHealth(supabase, 10, { apply: true, now: NOW });
  assert.equal(first.persisted, true);
  assert.equal(repeated.persisted, false);
  assert.equal(repeated.changed, false);
  assert.equal(state.updates, 1);
  assert.equal(state.activities, 1);
});
