import fs from "node:fs";
import path from "node:path";

// Verifica a migration 20260924_whatsapp_leitura_tipada (Story 057). Somente leitura.

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
  'columns', coalesce((
    select json_agg(column_name order by column_name)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'messages'
      and column_name in ('ai_intent', 'ai_objection', 'ai_card', 'ai_evidence', 'ai_decided_by')
  ), '[]'::json),
  'constraints', coalesce((
    select json_agg(json_build_object('name', conname, 'validated', convalidated) order by conname)
    from pg_constraint
    where conname in ('messages_ai_intent_check', 'messages_ai_objection_check', 'messages_ai_decided_by_check')
  ), '[]'::json),
  'index', (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'messages_deal_reading_idx'),
  'view', pg_get_viewdef('public.messages_ai_pendentes'::regclass),
  'counts', json_build_object(
    'received', (select count(*) from public.messages where direction = 'received'),
    'typed', (select count(*) from public.messages where direction = 'received' and ai_intent is not null),
    'pending', (select count(*) from public.messages_ai_pendentes)
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
const constraints = new Map((state.constraints ?? []).map((constraint) => [constraint.name, constraint]));
const checks = {
  required_columns: ["ai_card", "ai_decided_by", "ai_evidence", "ai_intent", "ai_objection"]
    .every((column) => (state.columns ?? []).includes(column)),
  validated_constraints: ["messages_ai_intent_check", "messages_ai_objection_check", "messages_ai_decided_by_check"]
    .every((name) => constraints.get(name)?.validated === true),
  reading_index: /ai_intent IS NOT NULL/i.test(state.index ?? ""),
  pending_view_uses_intent: /ai_intent IS NULL/i.test(state.view ?? ""),
  pending_view_only_whatsapp: /'uazapi'/i.test(state.view ?? ""),
};

console.log(JSON.stringify({ checks, counts: state.counts }, null, 2));
if (Object.values(checks).some((value) => !value)) process.exitCode = 1;
