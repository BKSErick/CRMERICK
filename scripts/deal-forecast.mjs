import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { calculateForecastFromSupabase } from "../src/lib/dealForecastService.mjs";

const STAGES = new Set(["prospect", "abordado", "followup", "qualified", "proposal", "negotiation", "won", "lost"]);

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

function currentMonthPeriod(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const lastDay = String(new Date(Date.UTC(year, now.getUTCMonth() + 1, 0)).getUTCDate()).padStart(2, "0");
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${lastDay}` };
}

export function parseDealForecastArgs(argv = process.argv.slice(2), now = new Date()) {
  const defaults = currentMonthPeriod(now);
  const from = validDateArg(flagValue(argv, "from") || defaults.from, "Data inicial");
  const to = validDateArg(flagValue(argv, "to") || defaults.to, "Data final");
  if (from > to) throw new Error("Periodo invalido: --from deve anteceder --to.");
  const rawDealId = flagValue(argv, "deal-id");
  const dealId = rawDealId ? Number(rawDealId) : null;
  if (rawDealId && (!Number.isInteger(dealId) || dealId <= 0)) throw new Error("Deal invalido: use --deal-id=<inteiro positivo>.");
  const stage = flagValue(argv, "stage") || null;
  if (stage && !STAGES.has(stage)) throw new Error("Etapa invalida no filtro --stage.");
  return { from, to, dealId, stage };
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function main() {
  const options = parseDealForecastArgs();
  const result = await calculateForecastFromSupabase(getSupabase(), options);
  console.log(JSON.stringify({
    mode: "verification",
    persistence: "disabled",
    filters: options,
    rubricVersion: result.rubricVersion,
    probabilitySource: result.probabilitySource,
    pipeline: result.pipeline,
    predicted: result.predicted,
    realized: result.realized,
    attention: result.attention,
    counts: result.counts,
    deals: result.deals,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
