import fs from "node:fs";
import path from "node:path";

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim().replace(/^["']|["']$/g, "")]),
  );
}

const env = { ...readEnv(path.resolve(".env")), ...process.env };
const projectRef = (env.SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const accessToken = env.SUPABASE_ACCESS_TOKEN;

if (!projectRef || !accessToken) {
  throw new Error("SUPABASE_URL e SUPABASE_ACCESS_TOKEN sao obrigatorias.");
}

const query = `
select json_build_object(
  'captured_at', now(),
  'relations', coalesce((
    select json_agg(json_build_object(
      'schema_name', n.nspname,
      'relation_name', c.relname,
      'kind', c.relkind,
      'rls_enabled', c.relrowsecurity,
      'rls_forced', c.relforcerowsecurity,
      'comment', obj_description(c.oid)
    ) order by n.nspname, c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('messages', 'email_threads', 'contacts', 'deals')
  ), '[]'::json),
  'columns', coalesce((
    select json_agg(json_build_object(
      'table_name', table_name,
      'ordinal_position', ordinal_position,
      'column_name', column_name,
      'data_type', data_type,
      'udt_name', udt_name,
      'is_nullable', is_nullable,
      'column_default', column_default
    ) order by table_name, ordinal_position)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('messages', 'email_threads', 'contacts', 'deals')
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
    where n.nspname = 'public'
      and c.relname in ('messages', 'email_threads', 'contacts', 'deals')
  ), '[]'::json),
  'indexes', coalesce((
    select json_agg(json_build_object(
      'table_name', tablename,
      'index_name', indexname,
      'definition', indexdef
    ) order by tablename, indexname)
    from pg_indexes
    where schemaname = 'public'
      and tablename in ('messages', 'email_threads', 'contacts', 'deals')
  ), '[]'::json),
  'policies', coalesce((
    select json_agg(json_build_object(
      'table_name', tablename,
      'policy_name', policyname,
      'roles', roles,
      'command', cmd,
      'using', qual,
      'with_check', with_check
    ) order by tablename, policyname)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('messages', 'email_threads', 'contacts', 'deals')
  ), '[]'::json),
  'triggers', coalesce((
    select json_agg(json_build_object(
      'table_name', c.relname,
      'trigger_name', t.tgname,
      'definition', pg_get_triggerdef(t.oid, true)
    ) order by c.relname, t.tgname)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname = 'public'
      and c.relname in ('messages', 'email_threads', 'contacts', 'deals')
  ), '[]'::json),
  'set_updated_at_function', to_regprocedure('public.set_updated_at()') is not null
) as state;
`;

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query }),
});

const body = await response.json();
if (!response.ok) throw new Error(body?.message ?? `HTTP ${response.status}`);

const state = body?.[0]?.state ?? {};
const outputArgument = process.argv.find((value) => value.startsWith("--output="));
if (outputArgument) {
  const output = path.resolve(outputArgument.slice("--output=".length));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`Snapshot estrutural salvo: ${output}`);
}

const relation = (name) => state.relations?.find((item) => item.relation_name === name);
const messageColumns = new Set(
  state.columns?.filter((item) => item.table_name === "messages").map((item) => item.column_name) ?? [],
);
const indexNames = new Set(state.indexes?.map((item) => item.index_name) ?? []);
const triggerNames = new Set(state.triggers?.map((item) => item.trigger_name) ?? []);
const policies = state.policies?.filter((item) => item.table_name === "email_threads") ?? [];

const baselineChecks = {
  messages_table: Boolean(relation("messages")),
  contacts_table: Boolean(relation("contacts")),
  deals_table: Boolean(relation("deals")),
  messages_provider: messageColumns.has("provider"),
  messages_provider_message_id: messageColumns.has("provider_message_id"),
  messages_occurred_at: messageColumns.has("occurred_at"),
  provider_message_unique_index: indexNames.has("messages_provider_message_uidx"),
  set_updated_at_function: state.set_updated_at_function === true,
};

const expectedColumns = [
  "email_thread_id",
  "subject",
  "from_email",
  "recipient_emails",
  "cc_emails",
  "bcc_emails",
  "reply_to_email",
  "html_content",
  "source_message_id",
  "attachments",
];
const appliedChecks = {
  email_threads_table: Boolean(relation("email_threads")),
  email_threads_rls: relation("email_threads")?.rls_enabled === true,
  email_message_columns: expectedColumns.every((column) => messageColumns.has(column)),
  thread_order_index: indexNames.has("email_threads_last_message_idx"),
  thread_deal_index: indexNames.has("email_threads_deal_idx"),
  thread_contact_index: indexNames.has("email_threads_contact_idx"),
  message_thread_index: indexNames.has("messages_email_thread_occurred_idx"),
  updated_at_trigger: triggerNames.has("email_threads_updated_at"),
  no_public_thread_policy: policies.length === 0,
};

const mode = process.argv.includes("--expect-applied") ? "applied" : "baseline";
const checks = mode === "applied" ? { ...baselineChecks, ...appliedChecks } : baselineChecks;

if (process.argv.includes("--test-rls")) {
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY e obrigatoria para o teste positivo de acesso.");

  const serviceResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/email_threads?select=id&limit=1`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  const negativeQuery = `
    begin;
    set local role anon;
    insert into public.email_threads (provider, provider_thread_id, participant_email)
    values ('rls_probe', 'rollback_only', 'probe@example.invalid');
    rollback;
  `;
  const negativeResponse = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: negativeQuery }),
    },
  );
  const negativeBody = await negativeResponse.text();

  checks.service_role_select = serviceResponse.ok;
  checks.anon_insert_denied =
    !negativeResponse.ok && /row-level security|permission denied/i.test(negativeBody);
}

console.log(JSON.stringify({ mode, checks }, null, 2));
if (Object.values(checks).some((value) => !value)) process.exitCode = 1;
