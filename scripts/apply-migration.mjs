// Aplica um arquivo .sql no Supabase via Management API (usa SUPABASE_ACCESS_TOKEN do .env).
// Uso:
//   node scripts/apply-migration.mjs scripts/migrations/001_pixel_events.sql --dry-run
//   node scripts/apply-migration.mjs scripts/migrations/001_pixel_events.sql
import fs from "node:fs";
import path from "node:path";

const PROJECT_REF = "rezgkabwxxltpprpvdua";

const envPath = path.resolve(process.cwd(), ".env");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
}

const token = env.SUPABASE_ACCESS_TOKEN;
const dryRun = process.argv.includes("--dry-run");
const files = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
if (!token) { console.error("SUPABASE_ACCESS_TOKEN ausente no .env"); process.exit(1); }
if (files.length === 0) { console.error("Passe o caminho de pelo menos um arquivo .sql"); process.exit(1); }
for (const file of files) {
  if (!fs.existsSync(file)) { console.error(`Arquivo nao encontrado: ${file}`); process.exit(1); }
}

const sourceSql = files
  .map((file) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8"))
  .join("\n\n");
const sql = dryRun ? `begin;\n${sourceSql}\nrollback;` : sourceSql;
const label = files.map((file) => path.basename(file)).join(", ");

const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const responseText = await response.text();
if (response.ok) {
  console.log(dryRun
    ? `Dry-run validado com ROLLBACK (${label}) - HTTP ${response.status}`
    : `Migration aplicada (${label}) - HTTP ${response.status}`);
  console.log(responseText.slice(0, 200));
} else {
  console.error(`HTTP ${response.status}`);
  console.error(responseText.slice(0, 600));
  process.exit(1);
}
