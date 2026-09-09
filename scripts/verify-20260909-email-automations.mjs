import fs from "node:fs";
import path from "node:path";

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, "utf8").split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim().replace(/^["']|["']$/g, "")]),
  );
}

const env = { ...readEnv(path.resolve(".env")), ...process.env };
const projectRef = (env.SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!projectRef || !env.SUPABASE_ACCESS_TOKEN) {
  throw new Error("SUPABASE_URL e SUPABASE_ACCESS_TOKEN sao obrigatorias.");
}

const trackedTables = [
  "email_threads",
  "email_automations",
  "email_automation_revisions",
  "email_automation_test_runs",
];
const tableList = trackedTables.map((table) => `'${table}'`).join(", ");
const query = `
select json_build_object(
  'captured_at', now(),
  'relations', coalesce((
    select json_agg(json_build_object(
      'relation_name', c.relname,
      'rls_enabled', c.relrowsecurity,
      'comment', obj_description(c.oid)
    ) order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in (${tableList})
  ), '[]'::json),
  'columns', coalesce((
    select json_agg(json_build_object(
      'table_name', table_name,
      'column_name', column_name,
      'data_type', data_type,
      'is_nullable', is_nullable,
      'column_default', column_default
    ) order by table_name, ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name in (${tableList})
  ), '[]'::json),
  'constraints', coalesce((
    select json_agg(json_build_object(
      'table_name', c.relname,
      'constraint_name', con.conname,
      'constraint_type', con.contype,
      'definition', pg_get_constraintdef(con.oid, true)
    ) order by c.relname, con.conname)
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in (${tableList})
  ), '[]'::json),
  'indexes', coalesce((
    select json_agg(json_build_object('table_name', tablename, 'index_name', indexname, 'definition', indexdef)
      order by tablename, indexname)
    from pg_indexes where schemaname = 'public' and tablename in (${tableList})
  ), '[]'::json),
  'policies', coalesce((
    select json_agg(json_build_object('table_name', tablename, 'policy_name', policyname, 'roles', roles, 'command', cmd)
      order by tablename, policyname)
    from pg_policies where schemaname = 'public' and tablename in (${tableList})
  ), '[]'::json),
  'triggers', coalesce((
    select json_agg(json_build_object('table_name', c.relname, 'trigger_name', t.tgname, 'definition', pg_get_triggerdef(t.oid, true))
      order by c.relname, t.tgname)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname = 'public' and c.relname in (${tableList})
  ), '[]'::json),
  'functions', json_build_object(
    'create_exists', to_regprocedure('public.create_email_automation(text,text,jsonb,text)') is not null,
    'save_exists', to_regprocedure('public.save_email_automation(uuid,integer,text,text,text,jsonb,text)') is not null,
    'anon_create_execute', case when to_regprocedure('public.create_email_automation(text,text,jsonb,text)') is null then false else has_function_privilege('anon', 'public.create_email_automation(text,text,jsonb,text)', 'EXECUTE') end,
    'anon_save_execute', case when to_regprocedure('public.save_email_automation(uuid,integer,text,text,text,jsonb,text)') is null then false else has_function_privilege('anon', 'public.save_email_automation(uuid,integer,text,text,text,jsonb,text)', 'EXECUTE') end,
    'service_create_execute', case when to_regprocedure('public.create_email_automation(text,text,jsonb,text)') is null then false else has_function_privilege('service_role', 'public.create_email_automation(text,text,jsonb,text)', 'EXECUTE') end,
    'service_save_execute', case when to_regprocedure('public.save_email_automation(uuid,integer,text,text,text,jsonb,text)') is null then false else has_function_privilege('service_role', 'public.save_email_automation(uuid,integer,text,text,text,jsonb,text)', 'EXECUTE') end
  )
) as state;
`;

async function managementQuery(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text);
}

const body = await managementQuery(query);
const state = body?.[0]?.state ?? {};
const outputArgument = process.argv.find((value) => value.startsWith("--output="));
if (outputArgument) {
  const output = path.resolve(outputArgument.slice("--output=".length));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`Snapshot estrutural salvo: ${output}`);
}

const relation = (name) => state.relations?.find((item) => item.relation_name === name);
const columnsFor = (name) => new Set(
  state.columns?.filter((item) => item.table_name === name).map((item) => item.column_name) ?? [],
);
const indexes = new Set(state.indexes?.map((item) => item.index_name) ?? []);
const triggers = new Set(state.triggers?.map((item) => item.trigger_name) ?? []);
const automationPolicies = state.policies?.filter((item) => trackedTables.slice(1).includes(item.table_name)) ?? [];

const baselineChecks = {
  email_inbox_preserved: Boolean(relation("email_threads")),
};

const expectedColumns = {
  email_automations: ["id", "name", "description", "status", "graph", "version", "created_by", "created_at", "updated_at"],
  email_automation_revisions: ["id", "automation_id", "version", "graph", "name", "description", "status", "created_by", "created_at"],
  email_automation_test_runs: ["id", "automation_id", "automation_version", "input", "trace", "status", "error", "created_by", "created_at"],
};

const appliedChecks = {
  automation_table: Boolean(relation("email_automations")),
  revisions_table: Boolean(relation("email_automation_revisions")),
  test_runs_table: Boolean(relation("email_automation_test_runs")),
  all_tables_rls: trackedTables.slice(1).every((table) => relation(table)?.rls_enabled === true),
  expected_columns: Object.entries(expectedColumns).every(([table, columns]) => columns.every((column) => columnsFor(table).has(column))),
  status_version_index: indexes.has("email_automations_updated_idx"),
  revisions_index: indexes.has("email_automation_revisions_lookup_idx"),
  test_runs_index: indexes.has("email_automation_test_runs_lookup_idx"),
  updated_at_trigger: triggers.has("email_automations_updated_at"),
  no_public_policies: automationPolicies.length === 0,
  create_function: state.functions?.create_exists === true,
  save_function: state.functions?.save_exists === true,
  anon_function_execute_denied: state.functions?.anon_create_execute === false && state.functions?.anon_save_execute === false,
  service_function_execute_allowed: state.functions?.service_create_execute === true && state.functions?.service_save_execute === true,
};

const absentChecks = {
  automation_tables_absent: trackedTables.slice(1).every((table) => !relation(table)),
  automation_functions_absent: state.functions?.create_exists === false && state.functions?.save_exists === false,
};

const mode = process.argv.includes("--expect-applied")
  ? "applied"
  : process.argv.includes("--expect-absent") ? "absent" : "baseline";
const checks = mode === "applied"
  ? { ...baselineChecks, ...appliedChecks }
  : mode === "absent" ? { ...baselineChecks, ...absentChecks } : baselineChecks;

if (process.argv.includes("--test-rls")) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY e obrigatoria para testar RLS.");
  const serviceResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/email_automations?select=id&limit=1`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  const negativeSql = `
    begin;
    set local role anon;
    insert into public.email_automations (name, graph)
    values ('rls rollback probe', '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb);
    rollback;
  `;
  const negativeResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: negativeSql }),
  });
  const negativeBody = await negativeResponse.text();
  checks.service_role_select = serviceResponse.ok;
  checks.anon_insert_denied = !negativeResponse.ok && /row-level security|permission denied/i.test(negativeBody);
}

console.log(JSON.stringify({ mode, checks }, null, 2));
if (Object.values(checks).some((value) => !value)) process.exitCode = 1;

