// Exporta os achados (tabela insights) em markdown para consumo externo,
// ex.: Claude Code montar plano de melhoria sem precisar do dev server rodando.
// Le SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY de .env.local (mesmas envs do app).
//
// Uso:  node scripts/dump-achados.mjs [--type copy] [--json]

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nao encontradas (.env.local).");
  process.exit(1);
}

const typeArgIndex = process.argv.indexOf("--type");
const typeFilter = typeArgIndex !== -1 ? process.argv[typeArgIndex + 1] : null;
const asJson = process.argv.includes("--json");

let query = `${url}/rest/v1/insights?select=*&order=created_at.desc&limit=200`;
if (typeFilter) query += `&type=eq.${encodeURIComponent(typeFilter)}`;

const res = await fetch(query, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(`Supabase HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}
const rows = await res.json();

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

console.log(`# Achados do CRM ERICK (${rows.length})\n`);
for (const r of rows) {
  const empresa = r.company ? ` · ${r.company}` : "";
  const data = r.created_at ? String(r.created_at).slice(0, 10) : "";
  console.log(`## [${r.type ?? "geral"}]${empresa} · ${data} (id ${r.id})\n`);
  console.log(`${r.content}\n`);
}
