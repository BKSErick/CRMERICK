import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { recalculateDealHealth } from "../src/lib/dealHealthService.mjs";

function flagValue(argv, name, fallback = "") {
  const item = argv.find((value) => value.startsWith(`--${name}=`));
  return item ? item.split("=").slice(1).join("=") : fallback;
}

export function parseDealHealthArgs(argv = process.argv.slice(2)) {
  const dealId = Number(flagValue(argv, "deal-id"));
  const minScore = Number(flagValue(argv, "min-score", "0"));
  const maxScore = Number(flagValue(argv, "max-score", "100"));
  if (!Number.isFinite(minScore) || !Number.isFinite(maxScore) || minScore < 0 || maxScore > 100 || minScore > maxScore) {
    throw new Error("Faixa invalida: use --min-score=0..100 e --max-score=0..100.");
  }
  return {
    go: argv.includes("--go"),
    dealId: Number.isInteger(dealId) && dealId > 0 ? dealId : null,
    minScore,
    maxScore,
  };
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function listActiveDealIds(supabase, requestedDealId) {
  if (requestedDealId) return [requestedDealId];
  const ids = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const result = await supabase
      .from("deals")
      .select("id")
      .not("stage", "in", "(won,lost)")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    ids.push(...page.map((row) => Number(row.id)));
    if (page.length < pageSize) break;
  }
  return ids;
}

function explanation(result) {
  return {
    dealId: result.dealId,
    dealHealthScore: result.health.dealHealthScore,
    classification: result.health.classification,
    confidence: result.health.confidence,
    factors: result.health.factors,
    risks: result.health.risks,
    warnings: result.health.warnings,
    recommendedNextAction: result.health.recommendedNextAction,
    changed: result.changed,
    persisted: result.persisted,
  };
}

async function main() {
  const options = parseDealHealthArgs();
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const dealIds = await listActiveDealIds(supabase, options.dealId);

  const simulated = [];
  for (const dealId of dealIds) {
    const result = await recalculateDealHealth(supabase, dealId, { apply: false, now });
    const score = result.health.dealHealthScore;
    if (score >= options.minScore && score <= options.maxScore) simulated.push(result);
  }

  console.log(JSON.stringify({
    phase: "simulation",
    mode: "dry-run",
    filter: { minScore: options.minScore, maxScore: options.maxScore },
    matched: simulated.length,
    results: simulated.map(explanation),
  }, null, 2));

  if (!options.go) return;

  const applied = [];
  for (const item of simulated) {
    applied.push(await recalculateDealHealth(supabase, item.dealId, { apply: true, now }));
  }
  console.log(JSON.stringify({
    phase: "application",
    mode: "apply",
    matched: applied.length,
    persisted: applied.filter((item) => item.persisted).length,
    unchanged: applied.filter((item) => !item.changed).length,
    results: applied.map(explanation),
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
