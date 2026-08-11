import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  QUALIFICATION_REVIEW_STAGES,
  normalizeDealQualification,
  summarizeDealQualification,
} from "../src/lib/dealQualification.mjs";

const ACTIVE_STAGES = ["prospect", "abordado", "followup", ...QUALIFICATION_REVIEW_STAGES];

function flagValue(argv, name) {
  const item = argv.find((value) => value.startsWith(`--${name}=`));
  return item ? item.split("=").slice(1).join("=").trim() : "";
}

export function parseDealQualificationArgs(argv = process.argv.slice(2)) {
  const rawDealId = flagValue(argv, "deal-id");
  const dealId = rawDealId ? Number(rawDealId) : null;
  const stage = flagValue(argv, "stage") || null;
  if (rawDealId && (!Number.isInteger(dealId) || dealId <= 0)) throw new Error("deal-id invalido.");
  if (stage && !ACTIVE_STAGES.includes(stage)) throw new Error("Etapa invalida para qualificacao.");
  return { dealId, pendingOnly: argv.includes("--pending-only"), stage };
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function listDeals(supabase, options) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("deals")
      .select("id, company, name, stage, qualification")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (options.dealId) query = query.eq("id", options.dealId);
    else if (options.stage) query = query.eq("stage", options.stage);
    else query = query.in("stage", ACTIVE_STAGES);
    const result = await query;
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize || options.dealId) break;
  }
  return rows;
}

async function main() {
  const options = parseDealQualificationArgs();
  const deals = await listDeals(getSupabase(), options);
  const report = deals.map((deal) => {
    const qualification = normalizeDealQualification(deal.qualification);
    const summary = summarizeDealQualification(qualification);
    return {
      dealId: Number(deal.id),
      company: String(deal.company ?? deal.name ?? "Sem empresa"),
      stage: String(deal.stage ?? "prospect"),
      completeness: summary.completeness,
      confirmedCount: summary.confirmedCount,
      suggestedCount: summary.suggestedCount,
      pendingFields: summary.pendingFields,
      fields: qualification.fields,
    };
  }).filter((item) => !options.pendingOnly || item.pendingFields.length > 0);

  console.log(JSON.stringify({ mode: "read-only", count: report.length, results: report }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
