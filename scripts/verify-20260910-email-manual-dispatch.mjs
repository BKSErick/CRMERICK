import fs from "node:fs";
import path from "node:path";

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].trim().replace(/^["']|["']$/g, "")]));
}

const env = { ...readEnv(path.resolve(".env")), ...process.env };
const projectRef = (env.SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!projectRef || !env.SUPABASE_ACCESS_TOKEN) {
  throw new Error("SUPABASE_URL e SUPABASE_ACCESS_TOKEN sao obrigatorias.");
}

const claimSignature = "public.claim_email_automation_dispatch(uuid,integer,bigint,text,integer,text,text,text,text,text,integer)";
const completeSignature = "public.complete_email_automation_dispatch(bigint,text,integer,timestamp with time zone,boolean)";
const query = `
select json_build_object(
  'tables', coalesce((
    select json_agg(json_build_object('name', c.relname, 'rls', c.relrowsecurity) order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('email_automation_enrollments', 'email_automation_dispatches')
  ), '[]'::json),
  'policies', coalesce((
    select json_agg(json_build_object('table', tablename, 'policy', policyname))
    from pg_policies
    where schemaname = 'public' and tablename in ('email_automation_enrollments', 'email_automation_dispatches')
  ), '[]'::json),
  'functions', json_build_object(
    'claim_exists', to_regprocedure('${claimSignature}') is not null,
    'complete_exists', to_regprocedure('${completeSignature}') is not null,
    'anon_claim', case when to_regprocedure('${claimSignature}') is null then false else has_function_privilege('anon', '${claimSignature}', 'EXECUTE') end,
    'anon_complete', case when to_regprocedure('${completeSignature}') is null then false else has_function_privilege('anon', '${completeSignature}', 'EXECUTE') end,
    'service_claim', case when to_regprocedure('${claimSignature}') is null then false else has_function_privilege('service_role', '${claimSignature}', 'EXECUTE') end,
    'service_complete', case when to_regprocedure('${completeSignature}') is null then false else has_function_privilege('service_role', '${completeSignature}', 'EXECUTE') end
  ),
  'row_counts', json_build_object(
    'enrollments', (select count(*) from public.email_automation_enrollments),
    'dispatches', (select count(*) from public.email_automation_dispatches)
  )
) as state;
`;

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const text = await response.text();
if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
const state = JSON.parse(text)?.[0]?.state ?? {};
const tables = new Map((state.tables ?? []).map((table) => [table.name, table]));
const checks = {
  enrollment_table_rls: tables.get("email_automation_enrollments")?.rls === true,
  dispatch_table_rls: tables.get("email_automation_dispatches")?.rls === true,
  no_public_policies: (state.policies ?? []).length === 0,
  functions_exist: state.functions?.claim_exists === true && state.functions?.complete_exists === true,
  anon_execute_denied: state.functions?.anon_claim === false && state.functions?.anon_complete === false,
  service_execute_allowed: state.functions?.service_claim === true && state.functions?.service_complete === true,
  no_enrollment_created: Number(state.row_counts?.enrollments ?? -1) === 0,
  no_dispatch_created: Number(state.row_counts?.dispatches ?? -1) === 0,
};

console.log(JSON.stringify({ checks, rowCounts: state.row_counts }, null, 2));
if (Object.values(checks).some((value) => !value)) process.exitCode = 1;
