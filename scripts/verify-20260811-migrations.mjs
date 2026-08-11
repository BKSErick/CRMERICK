import fs from "node:fs";
import path from "node:path";

const PROJECT_REF = "rezgkabwxxltpprpvdua";
const env = {};
for (const line of fs.readFileSync(path.resolve(".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
}
if (!env.SUPABASE_ACCESS_TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN ausente.");

const query = `
select
  to_regclass('public.commercial_events') is not null as commercial_events,
  to_regclass('public.commercial_automation_rules') is not null as commercial_automation_rules,
  to_regclass('public.commercial_automation_runs') is not null as commercial_automation_runs,
  to_regclass('public.deal_loss_records') is not null as deal_loss_records,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='deals' and column_name='deal_health_score') as deal_health,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='deals' and column_name='qualification') as deal_qualification,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='deals' and column_name='loss_reason_code') as deal_loss_snapshot,
  to_regprocedure('public.transition_deal_stage_atomic(bigint,text,text,text,text)') is not null as loss_transition_rpc,
  to_regprocedure('public.correct_deal_loss_reason_atomic(bigint,text,text,text)') is not null as loss_correction_rpc,
  coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.commercial_events')), false) as commercial_events_rls,
  coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.commercial_automation_rules')), false) as commercial_automation_rules_rls,
  coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.commercial_automation_runs')), false) as commercial_automation_runs_rls,
  coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.deal_loss_records')), false) as deal_loss_records_rls;
`;

const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const body = await response.json();
if (!response.ok) throw new Error(body?.message ?? `HTTP ${response.status}`);
const result = body?.[0] ?? {};
const failed = Object.entries(result).filter(([, value]) => value !== true);
console.log(JSON.stringify({ ok: failed.length === 0, checks: result }, null, 2));
if (failed.length > 0) process.exitCode = 1;
