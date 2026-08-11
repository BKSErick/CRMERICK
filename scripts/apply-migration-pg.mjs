// Aplica um .sql direto no Postgres via DATABASE_URL.
//
// Por que existe: scripts/apply-migration.mjs usa a Management API com
// SUPABASE_ACCESS_TOKEN (sbp_) e passou a devolver 401 quando o token expira. Este
// caminho depende so da DATABASE_URL, que nao expira.
//
// Uso:
//   node scripts/apply-migration-pg.mjs scripts/migrations/arquivo.sql          (dry-run)
//   node scripts/apply-migration-pg.mjs scripts/migrations/arquivo.sql --apply  (commit)
//
// O dry-run roda o SQL de verdade dentro de BEGIN/ROLLBACK: erro de sintaxe e de
// constraint aparecem antes de qualquer gravacao.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const sqlPath = args.find((a) => !a.startsWith("--"));

if (!sqlPath) {
  console.error("uso: node scripts/apply-migration-pg.mjs <arquivo.sql> [--apply]");
  process.exit(1);
}
if (!fs.existsSync(sqlPath)) {
  console.error(`arquivo nao encontrado: ${sqlPath}`);
  process.exit(1);
}

function lerEnv(arquivo) {
  if (!fs.existsSync(arquivo)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(arquivo, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.trimStart().startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

const env = { ...lerEnv(path.resolve(".env")), ...process.env };

// A DATABASE_URL do .env pode estar com o placeholder [YOUR-PASSWORD] do .env.example.
// Nesse caso remontamos a string a partir de DB_PASSWORD + o ref do SUPABASE_URL.
function resolverConexao() {
  const url = env.DATABASE_URL ?? "";
  const temPlaceholder = /\[YOUR-PASSWORD\]|\[.*?\]/.test(url);
  if (url && !temPlaceholder) return url;
  const ref = (env.SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  if (!ref || !env.DB_PASSWORD) return url;
  const senha = encodeURIComponent(env.DB_PASSWORD);
  return `postgresql://postgres.${ref}:${senha}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;
}

const connectionString = resolverConexao();
if (!connectionString) {
  console.error("Sem conexao: defina DATABASE_URL ou DB_PASSWORD + SUPABASE_URL no .env");
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8");
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

console.log(APPLY ? "=== APLICANDO ===" : "=== DRY-RUN (BEGIN/ROLLBACK) ===");
console.log(`arquivo: ${sqlPath}`);

await client.connect();
try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query(APPLY ? "COMMIT" : "ROLLBACK");
  console.log(APPLY ? "COMMIT ok" : "ROLLBACK ok (nada gravado, SQL valido)");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("ERRO:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
