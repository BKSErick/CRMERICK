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

const columns = ["capacity_tier", "capacity_evidence", "decision_access", "offer_track", "eligibility_reason"];
const query = `
select json_build_object(
  'columns', (select json_object_agg(column_name, data_type) from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = any(array[${columns.map((c) => `'${c}'`).join(",")}])) ,
  'counts', json_build_object(
    'materialized', (select count(*) from public.deals where eligibility_reason is not null),
    'project', (select count(*) from public.deals where offer_track = 'projeto'),
    'entry', (select count(*) from public.deals where offer_track = 'entrada'),
    'none', (select count(*) from public.deals where offer_track = 'nenhuma')
  )
) as state;`;

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const text = await response.text();
if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
const state = JSON.parse(text)?.[0]?.state ?? {};
const checks = Object.fromEntries(columns.map((column) => [`column_${column}`, Boolean(state.columns?.[column])]));
checks.materialized = Number(state.counts?.materialized || 0) > 0;
console.log(JSON.stringify({ checks, counts: state.counts }, null, 2));
if (Object.values(checks).some((value) => !value)) process.exitCode = 1;
