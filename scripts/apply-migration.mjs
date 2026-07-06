// Aplica um arquivo .sql no Supabase via Management API (usa SUPABASE_ACCESS_TOKEN do .env).
// Uso: node scripts/apply-migration.mjs scripts/migrations/001_pixel_events.sql
import fs from "node:fs";
import path from "node:path";

const PROJECT_REF = "rezgkabwxxltpprpvdua";

const envPath = path.resolve(process.cwd(), ".env");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const token = env.SUPABASE_ACCESS_TOKEN;
const file = process.argv[2];
if (!token) { console.error("❌ SUPABASE_ACCESS_TOKEN ausente no .env"); process.exit(1); }
if (!file) { console.error("❌ passe o caminho do .sql"); process.exit(1); }

const sql = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const text = await r.text();
if (r.ok) {
  console.log(`✅ Migration aplicada (${path.basename(file)}) — HTTP ${r.status}`);
  console.log(text.slice(0, 200));
} else {
  console.error(`❌ HTTP ${r.status}`);
  console.error(text.slice(0, 600));
  process.exit(1);
}
