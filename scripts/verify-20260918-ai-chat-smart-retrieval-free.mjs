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

const query = `
select json_build_object(
  'columns', coalesce((
    select json_agg(json_build_object(
      'table', table_name,
      'column', column_name,
      'type', data_type,
      'nullable', is_nullable,
      'default', column_default
    ) order by table_name, ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and (
      (table_name = 'ai_conversations' and column_name = 'model_preference') or
      (table_name = 'ai_conversation_messages' and column_name in ('usage', 'provider_attempts', 'routing_plan')) or
      (table_name = 'email_threads' and column_name in ('last_message_direction', 'last_message_id'))
    )
  ), '[]'::json),
  'constraints', coalesce((
    select json_agg(json_build_object('name', conname, 'validated', convalidated) order by conname)
    from pg_constraint
    where conname in (
      'ai_conversations_model_preference_object',
      'ai_messages_usage_object',
      'ai_messages_provider_attempts_array',
      'ai_messages_routing_plan_object',
      'email_threads_last_message_direction_check'
    )
  ), '[]'::json),
  'indexes', coalesce((
    select json_agg(json_build_object('name', indexname, 'definition', indexdef) order by indexname)
    from pg_indexes
    where schemaname = 'public' and indexname in (
      'email_threads_awaiting_reply_idx',
      'activities_whatsapp_timeline_idx'
    )
  ), '[]'::json),
  'tables', coalesce((
    select json_agg(json_build_object('name', c.relname, 'rls', c.relrowsecurity) order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in (
      'ai_conversations', 'ai_conversation_messages', 'email_threads'
    )
  ), '[]'::json),
  'access', json_build_object(
    'anon_ai_conversations', has_table_privilege('anon', 'public.ai_conversations', 'SELECT'),
    'authenticated_ai_conversations', has_table_privilege('authenticated', 'public.ai_conversations', 'SELECT'),
    'anon_ai_messages', has_table_privilege('anon', 'public.ai_conversation_messages', 'SELECT'),
    'authenticated_ai_messages', has_table_privilege('authenticated', 'public.ai_conversation_messages', 'SELECT'),
    'anon_email_threads', has_table_privilege('anon', 'public.email_threads', 'SELECT'),
    'authenticated_email_threads', has_table_privilege('authenticated', 'public.email_threads', 'SELECT'),
    'service_ai_conversations', has_table_privilege('service_role', 'public.ai_conversations', 'SELECT'),
    'service_ai_messages', has_table_privilege('service_role', 'public.ai_conversation_messages', 'SELECT'),
    'service_email_threads', has_table_privilege('service_role', 'public.email_threads', 'SELECT')
  ),
  'backfill_mismatches', (
    select count(*) from public.email_threads thread
    left join lateral (
      select message.id, message.direction
      from public.messages message
      where message.email_thread_id = thread.id
      order by message.occurred_at desc nulls last, message.id desc
      limit 1
    ) latest on true
    where thread.last_message_id is distinct from latest.id
       or thread.last_message_direction is distinct from latest.direction
  ),
  'counts', json_build_object(
    'email_threads', (select count(*) from public.email_threads),
    'email_awaiting_reply', (
      select count(*) from public.email_threads
      where status = 'open' and last_message_direction = 'received'
    )
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
const columns = new Set((state.columns ?? []).map((column) => `${column.table}.${column.column}`));
const constraints = new Map((state.constraints ?? []).map((constraint) => [constraint.name, constraint]));
const indexes = new Map((state.indexes ?? []).map((index) => [index.name, index]));
const tables = new Map((state.tables ?? []).map((table) => [table.name, table]));
const requiredColumns = [
  "ai_conversations.model_preference",
  "ai_conversation_messages.usage",
  "ai_conversation_messages.provider_attempts",
  "ai_conversation_messages.routing_plan",
  "email_threads.last_message_direction",
  "email_threads.last_message_id",
];
const requiredConstraints = [
  "ai_conversations_model_preference_object",
  "ai_messages_usage_object",
  "ai_messages_provider_attempts_array",
  "ai_messages_routing_plan_object",
  "email_threads_last_message_direction_check",
];
const access = state.access ?? {};
const checks = {
  required_columns: requiredColumns.every((column) => columns.has(column)),
  validated_constraints: requiredConstraints.every((name) => constraints.get(name)?.validated === true),
  awaiting_email_index: /last_message_direction = 'received'/.test(indexes.get("email_threads_awaiting_reply_idx")?.definition ?? ""),
  whatsapp_timeline_index: /whatsapp_sent_sync/.test(indexes.get("activities_whatsapp_timeline_idx")?.definition ?? ""),
  rls_enabled: ["ai_conversations", "ai_conversation_messages", "email_threads"]
    .every((table) => tables.get(table)?.rls === true),
  anon_and_authenticated_denied: [
    "anon_ai_conversations", "authenticated_ai_conversations",
    "anon_ai_messages", "authenticated_ai_messages",
    "anon_email_threads", "authenticated_email_threads",
  ].every((key) => access[key] === false),
  service_role_allowed: ["service_ai_conversations", "service_ai_messages", "service_email_threads"]
    .every((key) => access[key] === true),
  email_backfill_consistent: Number(state.backfill_mismatches ?? -1) === 0,
};

console.log(JSON.stringify({ checks, counts: state.counts }, null, 2));
if (Object.values(checks).some((value) => !value)) process.exitCode = 1;
