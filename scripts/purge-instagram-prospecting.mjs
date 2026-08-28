// Apaga os leads de prospeccao do canal instagram de prospecting_channels.
// As telas "Achados" e "Leads e follow-ups" sairam do /instagram e esses registros
// deixaram de ter uso; a decisao de apagar foi do dono do CRM.
//
// Seguro por padrao: sem --go, so conta e grava o backup. Nao toca em deals/contacts —
// se um lead virou deal, o deal continua no pipeline.
//
// Uso:
//   node --env-file-if-exists=.env scripts/purge-instagram-prospecting.mjs
//   node --env-file-if-exists=.env scripts/purge-instagram-prospecting.mjs --go
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const go = process.argv.includes("--go");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no .env");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const rows = [];
for (let offset = 0; ; offset += 1000) {
  const result = await supabase
    .from("prospecting_channels")
    .select("*")
    .eq("channel", "instagram")
    .order("id", { ascending: true })
    .range(offset, offset + 999);
  if (result.error) {
    console.error("Falha ao ler prospecting_channels:", result.error.message);
    process.exit(1);
  }
  const page = result.data ?? [];
  rows.push(...page);
  if (page.length < 1000) break;
}

console.log(`Encontrados ${rows.length} registros de instagram em prospecting_channels.`);

const byStatus = rows.reduce((acc, row) => {
  const status = row.status ?? "sem_status";
  acc[status] = (acc[status] ?? 0) + 1;
  return acc;
}, {});
console.log("Por status:", byStatus);

const dealIds = [...new Set(rows.map((row) => row.deal_id).filter(Boolean))];
console.log(`Deals ligados a esses leads: ${dealIds.length} (NAO serao apagados).`);

if (rows.length === 0) {
  console.log("Nada a fazer.");
  process.exit(0);
}

const stamp = new Date().toISOString().slice(0, 10);
const backupDir = path.resolve(process.cwd(), "scratchpad");
fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `backup-prospecting-instagram-${stamp}.json`);
fs.writeFileSync(backupPath, JSON.stringify({ exportedAt: new Date().toISOString(), rows }, null, 2), "utf8");
console.log(`\nBackup gravado em: ${backupPath}`);

if (!go) {
  console.log("\nDry-run: nada foi apagado. Confira a contagem acima e rode de novo com --go.");
  process.exit(0);
}

const removed = await supabase.from("prospecting_channels").delete().eq("channel", "instagram").select("id");
if (removed.error) {
  console.error("Falha ao apagar:", removed.error.message);
  process.exit(1);
}

console.log(`\nOK: ${removed.data.length} registros apagados de prospecting_channels.`);
console.log(`Backup preservado em ${backupPath}.`);
