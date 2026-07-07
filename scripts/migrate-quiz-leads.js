const fs = require("node:fs");
const path = require("node:path");

const OLD_PROJECT_REF = process.env.OLD_QUIZ_SUPABASE_PROJECT_REF || "sceidcbjxnaakeqpltun";
const CRM_PROJECT_REF = process.env.CRM_SUPABASE_PROJECT_REF || "rezgkabwxxltpprpvdua";
const BATCH_SIZE = 100;

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
}

async function queryProject(projectRef, query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase Management API ${projectRef} HTTP ${response.status}: ${text.slice(0, 600)}`);
  }

  return text ? JSON.parse(text) : [];
}

function sqlJson(value) {
  return `$quiz_payload$${JSON.stringify(value).replace(/\$quiz_payload\$/g, "")}$quiz_payload$::jsonb`;
}

async function inspectSource() {
  const columns = await queryProject(
    OLD_PROJECT_REF,
    "select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'quiz_leads' order by ordinal_position;",
  );
  const count = await queryProject(OLD_PROJECT_REF, "select count(*)::int as total from public.quiz_leads;");

  console.log("quiz_leads origem:", {
    project: OLD_PROJECT_REF,
    total: count?.[0]?.total ?? 0,
    columns: columns.map((column) => `${column.column_name}:${column.data_type}`),
  });
}

async function fetchRows() {
  return queryProject(OLD_PROJECT_REF, "select row_to_json(q)::jsonb as payload from public.quiz_leads q;");
}

async function migrateBatch(batch) {
  const payload = batch.map((row) => row.payload ?? row);
  const sql = `
with payload as (
  select value as row
  from jsonb_array_elements(${sqlJson(payload)}) as value
)
insert into public.quiz_leads (
  external_id,
  quiz_id,
  source,
  name,
  email,
  phone,
  whatsapp,
  score,
  gargalo,
  answers,
  raw_payload,
  created_at
)
select
  nullif(coalesce(row->>'external_id', row->>'externalId', row->>'quiz_lead_id', row->>'id'), ''),
  nullif(coalesce(row->>'quiz_id', row->>'quizId', row->>'quiz', row->>'form_id'), ''),
  coalesce(nullif(row->>'source', ''), 'quiz-migration'),
  nullif(coalesce(row->>'name', row->>'nome', row->>'full_name', row->>'fullName', row->>'lead_name'), ''),
  nullif(lower(coalesce(row->>'email', row->>'lead_email')), ''),
  nullif(regexp_replace(coalesce(row->>'phone', row->>'telefone', row->>'whatsapp', row->>'lead_phone', ''), '\\D', '', 'g'), ''),
  nullif(regexp_replace(coalesce(row->>'whatsapp', row->>'phone', row->>'telefone', ''), '\\D', '', 'g'), ''),
  case
    when nullif(coalesce(row->>'score', row->>'points', row->>'pontuacao'), '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
      then nullif(coalesce(row->>'score', row->>'points', row->>'pontuacao'), '')::numeric
    else null
  end,
  nullif(coalesce(row->>'gargalo', row->>'bottleneck', row->>'diagnostic', row->>'diagnostico', row->>'segment'), ''),
  coalesce(row->'answers', row->'respostas', row->'result', row->'results'),
  row,
  coalesce(nullif(row->>'created_at', '')::timestamptz, now())
from payload
where not exists (
  select 1
  from public.quiz_leads existing
  where (nullif(coalesce(row->>'external_id', row->>'externalId', row->>'quiz_lead_id', row->>'id'), '') is not null and existing.external_id = nullif(coalesce(row->>'external_id', row->>'externalId', row->>'quiz_lead_id', row->>'id'), ''))
    or (nullif(lower(coalesce(row->>'email', row->>'lead_email')), '') is not null and existing.email = nullif(lower(coalesce(row->>'email', row->>'lead_email')), ''))
    or (nullif(regexp_replace(coalesce(row->>'phone', row->>'telefone', row->>'whatsapp', row->>'lead_phone', ''), '\\D', '', 'g'), '') is not null and existing.phone = nullif(regexp_replace(coalesce(row->>'phone', row->>'telefone', row->>'whatsapp', row->>'lead_phone', ''), '\\D', '', 'g'), ''))
);
`;

  await queryProject(CRM_PROJECT_REF, sql);
}

async function main() {
  loadEnv();
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    throw new Error("SUPABASE_ACCESS_TOKEN ausente no .env.");
  }

  const dryRun = process.argv.includes("--dry-run");
  await inspectSource();

  const rows = await fetchRows();
  console.log(`Registros encontrados para migracao: ${rows.length}`);

  if (dryRun) {
    console.log("Dry-run: nenhuma gravacao foi feita.");
    return;
  }

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    await migrateBatch(batch);
    console.log(`Migrados ${Math.min(index + batch.length, rows.length)}/${rows.length}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
