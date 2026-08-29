import fs from "node:fs";
import path from "node:path";

const PROJECT_REF = "rezgkabwxxltpprpvdua";
const env = {};

for (const line of fs.readFileSync(path.resolve(".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
}

if (!env.SUPABASE_ACCESS_TOKEN) {
  throw new Error("SUPABASE_ACCESS_TOKEN ausente.");
}

const query = `
select json_build_object(
  'captured_at', now(),
  'clients_columns', coalesce((
    select json_agg(json_build_object(
      'column_name', column_name,
      'data_type', data_type,
      'is_nullable', is_nullable,
      'column_default', column_default
    ) order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clients'
      and column_name in ('representative_name', 'representative_document')
  ), '[]'::json),
  'contracts_table', to_regclass('public.client_contracts') is not null,
  'counters_table', to_regclass('public.client_contract_number_counters') is not null,
  'contracts_rls', coalesce((
    select relrowsecurity from pg_class where oid = to_regclass('public.client_contracts')
  ), false),
  'counters_rls', coalesce((
    select relrowsecurity from pg_class where oid = to_regclass('public.client_contract_number_counters')
  ), false),
  'allocator_function', to_regprocedure('public.allocate_client_contract_number(integer)') is not null,
  'public_policies', coalesce((
    select json_agg(json_build_object('table', tablename, 'policy', policyname))
    from pg_policies
    where schemaname = 'public'
      and tablename in ('client_contracts', 'client_contract_number_counters')
  ), '[]'::json),
  'direct_grants', coalesce((
    select json_agg(json_build_object('table', table_name, 'grantee', grantee, 'privilege', privilege_type))
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('client_contracts', 'client_contract_number_counters')
      and grantee in ('anon', 'authenticated')
  ), '[]'::json)
) as state;
`;

const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query }),
});

const body = await response.json();
if (!response.ok) throw new Error(body?.message ?? `HTTP ${response.status}`);

const state = body?.[0]?.state ?? {};
const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
if (outputArgument) {
  const outputPath = path.resolve(outputArgument.slice("--output=".length));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  console.log(`Snapshot estrutural salvo: ${outputPath}`);
}

const expected = process.argv.includes("--expect-applied");
const checks = {
  representative_fields: state.clients_columns?.length === 2,
  contracts_table: state.contracts_table === true,
  counters_table: state.counters_table === true,
  contracts_rls: state.contracts_rls === true,
  counters_rls: state.counters_rls === true,
  allocator_function: state.allocator_function === true,
  no_public_policies: state.public_policies?.length === 0,
  no_direct_grants: state.direct_grants?.length === 0,
};

console.log(JSON.stringify({ expected, checks }, null, 2));
if (expected && Object.values(checks).some((value) => !value)) process.exitCode = 1;
