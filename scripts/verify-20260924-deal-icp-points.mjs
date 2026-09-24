import fs from "node:fs";
import path from "node:path";

// Verifica a migration 20260924_deal_icp_points (Story 058). Somente leitura.

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

const query = `
select json_build_object(
  'column', (
    select json_build_object('type', data_type, 'nullable', is_nullable, 'default', column_default)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'icp_points'
  ),
  'counts', json_build_object(
    'deals', (select count(*) from public.deals),
    'with_icp_points', (select count(*) from public.deals where icp_points <> 0),
    'is_icp_true', (select count(*) from public.deals where is_icp is true),
    'is_icp_false', (select count(*) from public.deals where is_icp is false),
    'is_icp_null', (select count(*) from public.deals where is_icp is null)
  )
) as state;
`;

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const responseText = await response.text();
if (!response.ok) throw new Error(`HTTP ${response.status}: ${responseText.slice(0, 500)}`);

const state = JSON.parse(responseText)?.[0]?.state ?? {};
const checks = {
  column_exists: state.column?.type === "smallint",
  not_null_default_zero: state.column?.nullable === "NO" && /^0/.test(String(state.column?.default ?? "")),
};

console.log(JSON.stringify({ checks, counts: state.counts }, null, 2));
if (Object.values(checks).some((value) => !value)) process.exitCode = 1;
