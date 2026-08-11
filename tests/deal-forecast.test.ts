import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEAL_FORECAST_RUBRIC,
  calculateDealForecast,
  calculateForecast,
} from "../src/lib/dealForecast.mjs";
import { calculateForecastFromSupabase } from "../src/lib/dealForecastService.mjs";
import { parseDealForecastArgs } from "../scripts/deal-forecast.mjs";

const NOW = "2026-08-11T12:00:00.000Z";
const PERIOD = { from: "2026-08-01", to: "2026-08-31" };

function qualification(confirmedCount: number) {
  const keys = ["problem", "impact", "stakeholders", "urgency", "investmentCapacity", "desiredSolution", "recommendedOffer"];
  return {
    version: 1,
    fields: Object.fromEntries(keys.map((key, index) => [key, index < confirmedCount
      ? { status: "confirmed", value: key, source: "operator" }
      : { status: "not_informed", value: null }])),
  };
}

test("rubrica publica formula, pesos, limites e fonte agregada", () => {
  assert.equal(DEAL_FORECAST_RUBRIC.version, 1);
  assert.equal(DEAL_FORECAST_RUBRIC.metric, "commercial_forecast");
  assert.equal(DEAL_FORECAST_RUBRIC.aggregateProbabilitySource, "calculated_v1");
  assert.equal(DEAL_FORECAST_RUBRIC.stageBase.qualified, 35);
  assert.deepEqual(DEAL_FORECAST_RUBRIC.activeProbabilityBounds, [1, 95]);
  assert.deepEqual(DEAL_FORECAST_RUBRIC.adjustments, {
    healthStrong: 8,
    healthHealthy: 5,
    healthAtRisk: -12,
    healthCritical: -18,
    qualificationComplete: 8,
    qualificationPartial: 4,
    qualificationStarted: 2,
    humanResponse: 6,
    decisionMaker: 6,
    meetingHeld: 10,
    meetingConfirmed: 6,
    meetingScheduled: 3,
    meetingNoShow: -10,
    proposal: 4,
    activityThreeDays: 5,
    activitySevenDays: 2,
    activityStale: -8,
    closeInPeriod: 4,
    closeOverdue: -10,
  });
  assert.equal(Object.values(DEAL_FORECAST_RUBRIC.confidenceWeights).reduce((sum, weight) => sum + weight, 0), 100);
});

test("probabilidade considera todos os sinais e limita deal ativo em 95", () => {
  const result = calculateDealForecast({
    now: NOW,
    period: PERIOD,
    deal: {
      id: 1,
      stage: "negotiation",
      value: 1000,
      prob: 40,
      recurring: false,
      closeDate: "2026-08-20",
      dealHealthScore: 82,
      qualification: qualification(7),
      responseType: "encaminhamento",
      referredPhone: "5531999999999",
      lastInboundAt: "2026-08-10T12:00:00.000Z",
      nextActionAt: "2026-08-13T12:00:00.000Z",
    },
    meetings: [{ status: "held", startsAt: "2026-08-09T12:00:00.000Z" }],
  });

  assert.equal(result.calculatedProbability, 95);
  assert.equal(result.manualProbability, 40);
  assert.equal(result.probabilitySource, "calculated_v1");
  assert.equal(result.weightedValue, 950);
  for (const key of ["stage_base", "health_strong", "qualification_complete", "human_response", "decision_maker", "meeting_held", "proposal", "recent_activity", "close_in_period"]) {
    assert.ok(result.factors.some((factor) => factor.key === key), key);
  }
});

test("agregado separa MRR, one-off, previsto e realizado com valores exatos", () => {
  const result = calculateForecast({
    now: NOW,
    period: PERIOD,
    deals: [
      { id: 1, stage: "qualified", value: 1000, recurring: true, prob: 90, closeDate: "2026-08-20", responseType: "humana", lastInboundAt: "2026-08-10T12:00:00.000Z" },
      { id: 2, stage: "proposal", value: 2000, recurring: false, prob: 10, closeDate: "2026-08-25" },
      { id: 3, stage: "won", value: 300, recurring: true, closedAt: "2026-08-05T12:00:00.000Z" },
      { id: 4, stage: "lost", value: 9000, recurring: false, closeDate: "2026-08-15" },
    ],
    meetings: [],
  });

  assert.equal(result.pipeline.gross, 3000);
  assert.equal(result.pipeline.weighted, 1760);
  assert.equal(result.predicted.total, 1760);
  assert.equal(result.predicted.mrr, 500);
  assert.equal(result.predicted.oneOff, 1260);
  assert.equal(result.realized.total, 300);
  assert.equal(result.realized.mrr, 300);
  assert.equal(result.realized.oneOff, 0);
  assert.equal(result.deals.find((deal) => deal.dealId === 4)?.forecastStatus, "excluded");
});

test("sem data continua no pipeline, mas nao entra no periodo; sem valor nunca inventa receita", () => {
  const result = calculateForecast({
    now: NOW,
    period: PERIOD,
    deals: [
      { id: 10, stage: "prospect", value: 500, recurring: false },
      { id: 11, stage: "qualified", value: null, recurring: true, closeDate: "2026-08-20" },
    ],
    meetings: [],
  });

  assert.equal(result.pipeline.gross, 500);
  assert.equal(result.pipeline.weighted, 25);
  assert.equal(result.predicted.total, 0);
  assert.ok(result.deals[0].warnings.some((warning) => /data esperada/i.test(warning)));
  assert.ok(result.deals[1].warnings.some((warning) => /valor comercial/i.test(warning)));
});

test("dados ausentes derrubam confianca sem gerar forecast negativo", () => {
  const sparse = calculateDealForecast({ now: NOW, period: PERIOD, deal: { id: 20, stage: "prospect", value: 100 }, meetings: [] });
  const complete = calculateDealForecast({
    now: NOW,
    period: PERIOD,
    deal: {
      id: 21,
      stage: "prospect",
      value: 100,
      closeDate: "2026-08-20",
      dealHealthScore: 70,
      qualification: qualification(2),
      responseType: "sem_resposta",
      lastOutboundAt: "2026-08-10T12:00:00.000Z",
      nextActionAt: "2026-08-13T12:00:00.000Z",
    },
    meetings: [{ status: "scheduled", startsAt: "2026-08-15T12:00:00.000Z" }],
  });
  assert.ok(sparse.confidence < complete.confidence);
  assert.ok(sparse.calculatedProbability >= 0);
  assert.ok(sparse.weightedValue >= 0);
});

test("saude nula e tratada como dado ausente, nao como nota zero", () => {
  const result = calculateDealForecast({
    now: NOW,
    period: PERIOD,
    deal: { id: 22, stage: "prospect", value: 100, deal_health_score: null },
    meetings: [],
  });
  assert.equal(result.calculatedProbability, 5);
  assert.ok(result.warnings.some((warning) => /sem saude/i.test(warning)));
  assert.ok(!result.risks.some((risk) => risk.key === "health_critical"));
});

test("risco e ausencia de proxima acao sao agregados apenas no periodo", () => {
  const result = calculateForecast({
    now: NOW,
    period: PERIOD,
    deals: [
      { id: 30, company: "Risco", stage: "qualified", value: 1000, closeDate: "2026-08-20", dealHealthScore: 30 },
      { id: 31, company: "Saudavel", stage: "qualified", value: 1000, closeDate: "2026-08-20", dealHealthScore: 80, nextActionAt: "2026-08-15T12:00:00.000Z" },
      { id: 32, company: "Fora", stage: "qualified", value: 1000, closeDate: "2026-09-20", dealHealthScore: 30 },
    ],
    meetings: [],
  });
  assert.equal(result.attention.revenueAtRisk, 270);
  assert.equal(result.attention.revenueWithoutNextAction, 270);
  assert.deepEqual(result.relevantDeals.map((deal) => deal.dealId), [31, 30]);
});

test("CLI valida periodo e filtros e permanece somente leitura", () => {
  assert.deepEqual(parseDealForecastArgs(["--from=2026-08-01", "--to=2026-08-31", "--deal-id=9", "--stage=proposal"]), {
    from: "2026-08-01",
    to: "2026-08-31",
    dealId: 9,
    stage: "proposal",
  });
  assert.throws(() => parseDealForecastArgs(["--from=2026-08-31", "--to=2026-08-01"]), /periodo invalido/i);
  const cli = readFileSync(new URL("../scripts/deal-forecast.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(cli, /\.update\(|\.insert\(|--go/);
});

test("servico server-side aplica filtros e calcula o periodo sem persistir", async () => {
  const calls: Array<{ table: string; operation: string; field?: string; value?: unknown }> = [];
  const supabase = {
    from(table: string) {
      calls.push({ table, operation: "from" });
      const builder = {
        select() { calls.push({ table, operation: "select" }); return builder; },
        order() { return builder; },
        eq(field: string, value: unknown) { calls.push({ table, operation: "eq", field, value }); return builder; },
        in(field: string, value: unknown) { calls.push({ table, operation: "in", field, value }); return builder; },
        range: async () => ({
          data: table === "deals"
            ? [{ id: 41, company: "Filtro", stage: "proposal", value: 1000, recurring: false, close_date: "2026-08-20" }]
            : [],
          error: null,
        }),
        limit: async () => ({ data: [], error: null }),
      };
      return builder;
    },
  };

  const result = await calculateForecastFromSupabase(supabase, {
    dealId: 41,
    stage: "proposal",
    from: PERIOD.from,
    to: PERIOD.to,
    now: NOW,
  });
  assert.equal(result.predicted.total, 630);
  assert.ok(calls.some((call) => call.table === "deals" && call.operation === "eq" && call.field === "id" && call.value === 41));
  assert.ok(calls.some((call) => call.table === "deals" && call.operation === "eq" && call.field === "stage" && call.value === "proposal"));
  assert.ok(!calls.some((call) => call.operation === "update" || call.operation === "insert"));
});

test("forecast reutiliza Funis, Comando e Pipeline sem criar navegacao", () => {
  const funnelApi = readFileSync(new URL("../src/app/api/funnel/route.ts", import.meta.url), "utf8");
  const commandApi = readFileSync(new URL("../src/app/api/comando/route.ts", import.meta.url), "utf8");
  const funnel = readFileSync(new URL("../src/app/funil/page.tsx", import.meta.url), "utf8");
  const command = readFileSync(new URL("../src/app/comando/page.tsx", import.meta.url), "utf8");
  const pipeline = readFileSync(new URL("../src/app/pipeline/page.tsx", import.meta.url), "utf8");
  assert.match(funnelApi, /calculateForecast/);
  assert.match(commandApi, /calculateForecastFromSupabase/);
  assert.match(funnel, /Forecast explicavel/);
  assert.match(command, /Receita em risco/);
  assert.match(pipeline, /Probabilidade calculada/);
  assert.doesNotMatch(`${funnel}${command}${pipeline}`, /href=["']\/forecast/);
});
