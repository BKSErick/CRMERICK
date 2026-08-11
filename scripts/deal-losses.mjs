import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { LOSS_REASON_CATALOG, validateLossReason } from "../src/lib/dealLossReasons.mjs";
import { loadLossAnalysis } from "../src/lib/dealLossService.mjs";

function flagValue(argv, name) {
  const item = argv.find((value) => value.startsWith(`--${name}=`));
  return item ? item.split("=").slice(1).join("=").trim() : "";
}

function validDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime())) {
    throw new Error(`${label} invalida: use YYYY-MM-DD.`);
  }
  return value;
}

function currentMonth(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const lastDay = String(new Date(Date.UTC(year, now.getUTCMonth() + 1, 0)).getUTCDate()).padStart(2, "0");
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${lastDay}` };
}

export function parseDealLossArgs(argv = process.argv.slice(2), now = new Date()) {
  const defaults = currentMonth(now);
  const from = validDate(flagValue(argv, "from") || defaults.from, "Data inicial");
  const to = validDate(flagValue(argv, "to") || defaults.to, "Data final");
  if (from > to) throw new Error("Periodo invalido: --from deve anteceder --to.");
  const reason = flagValue(argv, "reason") || null;
  if (reason) validateLossReason({ code: reason, note: reason === "other" ? "filtro" : null });
  return { from, to, reason };
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function main() {
  const options = parseDealLossArgs();
  const analysis = await loadLossAnalysis(getSupabase(), options);
  console.log(JSON.stringify({
    mode: "verification",
    persistence: "disabled",
    filters: options,
    catalog: LOSS_REASON_CATALOG,
    analysis,
    selectedReason: options.reason ? analysis.byReason.find((item) => item.code === options.reason) ?? null : null,
    lossesWithoutReason: analysis.legacyWithoutReason,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
