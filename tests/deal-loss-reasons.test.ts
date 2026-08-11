import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LOSS_REASON_CATALOG,
  buildLossAnalysis,
  requiresLossReason,
  validateLossReason,
} from "../src/lib/dealLossReasons.mjs";
import {
  correctDealLossReason,
  transitionDealStage,
} from "../src/lib/dealLossService.mjs";
import { parseDealLossArgs } from "../scripts/deal-losses.mjs";
import { calculateDealForecast } from "../src/lib/dealForecast.mjs";
import { mapDealFromRow, mapDealToRow } from "../src/lib/crmRecords.ts";

const PERIOD = { from: "2026-08-01", to: "2026-08-31" };

test("catalogo v1 contem exatamente as dez razoes definidas", () => {
  assert.equal(LOSS_REASON_CATALOG.version, 1);
  assert.deepEqual(LOSS_REASON_CATALOG.reasons.map((reason) => reason.code), [
    "no_budget",
    "no_priority",
    "no_response",
    "no_decision_maker_access",
    "bad_timing",
    "competitor",
    "bad_offer",
    "no_fit",
    "invalid_channel_data",
    "other",
  ]);
});

test("outro exige nota e razoes conhecidas sao normalizadas", () => {
  assert.throws(() => validateLossReason({ code: "other", note: "  " }), /nota.*obrigatoria/i);
  assert.throws(() => validateLossReason({ code: "invented" }), /razao.*invalida/i);
  assert.deepEqual(validateLossReason({ code: "no_budget", note: "  Sem verba neste trimestre. " }), {
    code: "no_budget",
    label: "Sem orcamento",
    note: "Sem verba neste trimestre.",
  });
});

test("captura e exigida apenas ao entrar em lost", () => {
  assert.equal(requiresLossReason("proposal", "lost"), true);
  assert.equal(requiresLossReason("lost", "qualified"), false);
  assert.equal(requiresLossReason("lost", "lost"), false);
  assert.equal(requiresLossReason("proposal", "won"), false);
});

test("agregacao usa a ultima correcao do episodio e preserva reabertura", () => {
  const analysis = buildLossAnalysis({
    period: PERIOD,
    deals: [
      { id: 1, company: "A", stage: "lost", loss_reason_code: "no_budget" },
      { id: 2, company: "B", stage: "qualified" },
    ],
    records: [
      { id: 10, deal_id: 1, episode_id: "ep-1", reason_code: "no_priority", recorded_at: "2026-08-10T10:00:00.000Z", segment_snapshot: "industrial", origin_snapshot: "whatsapp", superseded_reason: "corrected" },
      { id: 11, deal_id: 1, episode_id: "ep-1", reason_code: "no_budget", recorded_at: "2026-08-11T10:00:00.000Z", segment_snapshot: "industrial", origin_snapshot: "whatsapp", superseded_reason: null },
      { id: 12, deal_id: 2, episode_id: "ep-2", reason_code: "bad_timing", recorded_at: "2026-08-12T10:00:00.000Z", segment_snapshot: "servicos", origin_snapshot: "instagram", superseded_reason: "reopened" },
    ],
  });

  assert.equal(analysis.totalLosses, 2);
  assert.equal(analysis.activeLosses, 1);
  assert.equal(analysis.reopenedLosses, 1);
  assert.deepEqual(analysis.byReason.map((item) => [item.code, item.count, item.sharePct]), [
    ["bad_timing", 1, 50],
    ["no_budget", 1, 50],
  ]);
  assert.deepEqual(analysis.bySegment.map((item) => [item.key, item.count]), [["industrial", 1], ["servicos", 1]]);
  assert.deepEqual(analysis.byOrigin.map((item) => [item.key, item.count]), [["instagram", 1], ["whatsapp", 1]]);
  assert.equal(analysis.baseSufficient, false);
});

test("correcao posterior nao move a perda para outro periodo", () => {
  const records = [
    { id: 50, deal_id: 5, episode_id: "ep-cross", reason_code: "no_priority", recorded_at: "2026-07-30T10:00:00.000Z", superseded_reason: "corrected" },
    { id: 51, deal_id: 5, episode_id: "ep-cross", reason_code: "no_budget", recorded_at: "2026-08-02T10:00:00.000Z", superseded_reason: null },
  ];
  const july = buildLossAnalysis({ records, period: { from: "2026-07-01", to: "2026-07-31" } });
  const august = buildLossAnalysis({ records, period: PERIOD });
  assert.equal(july.totalLosses, 1);
  assert.equal(july.byReason[0].code, "no_budget");
  assert.equal(august.totalLosses, 0);
});

test("legado lost sem motivo permanece valido e explicitamente nao informado", () => {
  const analysis = buildLossAnalysis({
    period: PERIOD,
    deals: [
      { id: 20, company: "Legado", stage: "lost", loss_reason_code: null },
      { id: 21, company: "Com motivo", stage: "lost", loss_reason_code: "competitor" },
    ],
    records: [],
  });
  assert.deepEqual(analysis.legacyWithoutReason, [{ dealId: 20, company: "Legado" }]);
  assert.equal(analysis.totalLosses, 0);
});

test("snapshot de perda e somente leitura no mapper generico", () => {
  const deal = mapDealFromRow({
    id: 22,
    company: "Auditavel",
    stage: "lost",
    loss_reason_code: "competitor",
    loss_reason_note: "Escolheu o fornecedor atual.",
    loss_recorded_by: "Erick",
    loss_recorded_at: "2026-08-11T12:00:00.000Z",
  });
  assert.equal(deal.lossReasonCode, "competitor");
  assert.equal(deal.lossRecordedBy, "Erick");
  assert.deepEqual(mapDealToRow({ lossReasonCode: "no_fit", lossReasonNote: "Nao deve gravar." }), {});
});

test("servico valida antes da RPC e envia transicao atomica com autoria", async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const supabase = {
    rpc(name: string, params: Record<string, unknown>) {
      calls.push({ name, params });
      return { single: async () => ({ data: { id: 30, stage: params.p_target_stage }, error: null }) };
    },
  };

  await assert.rejects(() => transitionDealStage(supabase, 30, "lost", null, { actor: "Erick" }), /razao.*obrigatoria/i);
  const result = await transitionDealStage(supabase, 30, "lost", { code: "no_fit", note: "Escopo fora." }, { actor: "Erick" });
  assert.equal(result.stage, "lost");
  assert.equal(calls[0].name, "transition_deal_stage_atomic");
  assert.equal(calls[0].params.p_reason_code, "no_fit");
  assert.equal(calls[0].params.p_actor, "Erick");
});

test("correcao usa RPC dedicada e nunca atualiza a versao anterior pelo cliente", async () => {
  const calls: string[] = [];
  const supabase = {
    rpc(name: string) {
      calls.push(name);
      return { single: async () => ({ data: { id: 31, stage: "lost" }, error: null }) };
    },
  };
  await correctDealLossReason(supabase, 31, { code: "competitor", note: "Escolheu fornecedor atual." }, { actor: "Erick" });
  assert.deepEqual(calls, ["correct_deal_loss_reason_atomic"]);
});

test("migration e aditiva, transacional, deny-by-default e sem backfill inventado", () => {
  const migration = readFileSync(new URL("../scripts/migrations/20260811_deal_loss_reasons.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.deal_loss_records/i);
  assert.match(migration, /transition_deal_stage_atomic/);
  assert.match(migration, /correct_deal_loss_reason_atomic/);
  assert.match(migration, /security definer/i);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /Nenhum deal legado e classificado/i);
  assert.doesNotMatch(migration, /where\s+stage\s*=\s*'lost'\s+and\s+loss_reason_code\s+is\s+null/i);
});

test("CLI valida periodo e permanece somente leitura", () => {
  assert.deepEqual(parseDealLossArgs(["--from=2026-08-01", "--to=2026-08-31", "--reason=no_budget"]), {
    from: "2026-08-01",
    to: "2026-08-31",
    reason: "no_budget",
  });
  assert.throws(() => parseDealLossArgs(["--from=2026-08-31", "--to=2026-08-01"]), /periodo invalido/i);
  const cli = readFileSync(new URL("../scripts/deal-losses.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(cli, /\.update\(|\.insert\(|\.delete\(|--go/);
});

test("forecast exclui lost e explica o motivo sem transforma-lo em previsao", () => {
  const forecast = calculateDealForecast({
    deal: {
      id: 40,
      company: "Perdido com contexto",
      stage: "lost",
      value: 5000,
      loss_reason_code: "bad_timing",
      loss_reason_note: "Retomar no proximo trimestre.",
    },
    period: PERIOD,
    now: "2026-08-11T12:00:00.000Z",
  });
  assert.equal(forecast.forecastStatus, "excluded");
  assert.equal(forecast.predictedValue, 0);
  assert.equal(forecast.lossReason?.label, "Momento inadequado");
  assert.match(forecast.risks[0].evidence, /Retomar no proximo trimestre/);
});

test("cancelamento do dialogo nao chama persistencia e mudancas passam pelo gate", () => {
  const pipeline = readFileSync(new URL("../src/app/pipeline/page.tsx", import.meta.url), "utf8");
  const dialog = pipeline.slice(pipeline.indexOf("function LossReasonDialog"), pipeline.indexOf("type DealCardProps"));
  assert.match(dialog, /onClick=\{onCancel\}/);
  assert.doesNotMatch(dialog, /updateDealStage|fetch\(/);
  assert.match(pipeline, /requestStageChange\(draggedDealId, stage\.id\)/);
  assert.match(pipeline, /onStageChange\(deal\.id, e\.target\.value as DealStage\)/);
  const store = readFileSync(new URL("../src/store/useCRMStore.ts", import.meta.url), "utf8");
  assert.doesNotMatch(store, /fetch\("\/api\/activities"/);
  const route = readFileSync(new URL("../src/app/api/deals/route.ts", import.meta.url), "utf8");
  assert.match(route, /transitionDealStage\(/);
});

test("Pipeline, Funis, Achados e forecast reutilizam superficies atuais", () => {
  const pipeline = readFileSync(new URL("../src/app/pipeline/page.tsx", import.meta.url), "utf8");
  const funnel = readFileSync(new URL("../src/app/funil/page.tsx", import.meta.url), "utf8");
  const insights = readFileSync(new URL("../src/app/insights/page.tsx", import.meta.url), "utf8");
  const forecast = readFileSync(new URL("../src/lib/dealForecast.mjs", import.meta.url), "utf8");
  assert.match(pipeline, /Registrar razao da perda/);
  assert.match(pipeline, /Corrigir motivo/);
  assert.match(funnel, /Razoes de perda/);
  assert.match(insights, /Aprendizado das perdas/);
  assert.match(forecast, /lossReason/);
  assert.doesNotMatch(`${pipeline}${funnel}${insights}`, /href=["']\/perdas/);
});
