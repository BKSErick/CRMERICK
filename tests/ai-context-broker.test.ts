import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { minimizeForecastForAi, minimizeLossesForAi } from "../src/lib/aiContextBroker.ts";

const broker = readFileSync(new URL("../src/lib/aiContextBroker.ts", import.meta.url), "utf8");

test("broker usa registro fechado e envelopes comuns", () => {
  assert.match(broker, /CONTEXT_PROVIDER_REGISTRY/);
  assert.match(broker, /sourceId/);
  assert.match(broker, /limitations/);
  assert.match(broker, /calculateForecastFromSupabase/);
  assert.doesNotMatch(broker, /eval\(|new Function|rpc\(.*question|from\(.*question/i);
});

test("broker minimiza dados sensiveis e degrada fontes isoladamente", () => {
  assert.match(broker, /redactSensitiveText/);
  assert.match(broker, /Promise\.allSettled/);
  assert.doesNotMatch(broker, /process\.env\[[^\]]*question|serviceRoleKey/);
});

test("broker resume colecoes volumosas antes de montar o prompt", () => {
  const forecast = minimizeForecastForAi({
    pipeline: { total: 2 }, predicted: { total: 100 }, counts: { active: 2 },
    relevantDeals: [{ dealId: 1 }], deals: [{ dealId: 1 }, { dealId: 2 }],
  });
  const losses = minimizeLossesForAi({
    totalLosses: 3, byReason: [{ reason: "preco", count: 3 }],
    legacyWithoutReason: [{ dealId: 1 }, { dealId: 2 }],
  });

  assert.equal("deals" in forecast, false);
  assert.deepEqual(forecast.relevantDeals, [{ dealId: 1 }]);
  assert.equal(forecast.dealsOmitted, 2);
  assert.equal("legacyWithoutReason" in losses, false);
  assert.equal(losses.legacyWithoutReasonCount, 2);
});
