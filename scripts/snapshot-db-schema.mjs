import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

function argument(name, fallback = "") {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function connectionString(env) {
  const configured = env.DATABASE_URL ?? "";
  if (configured && !/\[YOUR-PASSWORD\]|\[.*?\]/.test(configured)) return configured;
  const projectRef = (env.SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  if (!projectRef || !env.DB_PASSWORD) return "";
  return `postgresql://postgres.${projectRef}:${encodeURIComponent(env.DB_PASSWORD)}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;
}

const env = { ...readEnv(path.resolve(".env")), ...process.env };
const databaseUrl = connectionString(env);
const output = path.resolve(argument("output"));
const label = argument("label", "schema_snapshot");
const purpose = argument("purpose", "pre-deployment schema snapshot");
const tables = argument("tables", "public.messages,public.email_threads,public.contacts,public.deals")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => {
    const [schema = "public", table] = value.includes(".") ? value.split(".", 2) : ["public", value];
    return { schema, table };
  });

if (!databaseUrl) throw new Error("DATABASE_URL ou DB_PASSWORD + SUPABASE_URL sao obrigatorias.");
if (!argument("output")) throw new Error("Passe --output=<arquivo.json>.");
if (!output.toLowerCase().endsWith(".json")) throw new Error("O snapshot precisa usar extensao .json.");

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const qualified = tables.map(({ schema, table }) => `${schema}.${table}`);
  const relationNames = tables.map(({ table }) => table);
  const schemaNames = [...new Set(tables.map(({ schema }) => schema))];
  const params = [schemaNames, relationNames];

  const [database, relations, columns, constraints, indexes, policies, triggers] = await Promise.all([
    client.query("select current_database() as database, current_setting('server_version') as server_version"),
    client.query(
      `select n.nspname as schema_name, c.relname as relation_name, c.relkind,
              c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
              obj_description(c.oid) as comment
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = any($1::text[]) and c.relname = any($2::text[])
        order by n.nspname, c.relname`,
      params,
    ),
    client.query(
      `select table_schema as schema_name, table_name, ordinal_position, column_name,
              data_type, udt_name, is_nullable, column_default
         from information_schema.columns
        where table_schema = any($1::text[]) and table_name = any($2::text[])
        order by table_schema, table_name, ordinal_position`,
      params,
    ),
    client.query(
      `select n.nspname as schema_name, c.relname as table_name, con.conname as constraint_name,
              con.contype as constraint_type, pg_get_constraintdef(con.oid, true) as definition
         from pg_constraint con
         join pg_class c on c.oid = con.conrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = any($1::text[]) and c.relname = any($2::text[])
        order by n.nspname, c.relname, con.conname`,
      params,
    ),
    client.query(
      `select schemaname as schema_name, tablename as table_name, indexname as index_name, indexdef as definition
         from pg_indexes
        where schemaname = any($1::text[]) and tablename = any($2::text[])
        order by schemaname, tablename, indexname`,
      params,
    ),
    client.query(
      `select schemaname as schema_name, tablename as table_name, policyname as policy_name,
              permissive, roles, cmd, qual, with_check
         from pg_policies
        where schemaname = any($1::text[]) and tablename = any($2::text[])
        order by schemaname, tablename, policyname`,
      params,
    ),
    client.query(
      `select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name,
              pg_get_triggerdef(t.oid, true) as definition
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where not t.tgisinternal and n.nspname = any($1::text[]) and c.relname = any($2::text[])
        order by n.nspname, c.relname, t.tgname`,
      params,
    ),
  ]);

  const snapshot = {
    label,
    purpose,
    createdAt: new Date().toISOString(),
    scope: qualified,
    database: database.rows[0],
    relations: relations.rows,
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    policies: policies.rows,
    triggers: triggers.rows,
  };

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`Snapshot de schema criado: ${output}`);
  console.log(`Relacoes encontradas: ${relations.rowCount}/${tables.length}`);
} finally {
  await client.end();
}
