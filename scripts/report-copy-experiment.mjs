import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildVariantReport } from "../src/lib/funnelMetrics.ts";
import salesPlaybookModule from "../src/lib/salesPlaybook.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

async function table(pathname) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Range: "0-19999" },
  });
  if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status}`);
  return response.json();
}

const experimentId = salesPlaybookModule.SALES_PLAYBOOK.experiment.id;
const [deals, activities, meetings] = await Promise.all([
  table(`deals?experiment_id=eq.${encodeURIComponent(experimentId)}&select=id,stage,response_type,referred_phone,value,recurring,is_prospect,copy_variant,experiment_id`),
  table("activities?type=in.(whatsapp_sent,whatsapp_sent_sync)&select=deal_id,type"),
  table("calendar_events?kind=eq.reuniao&select=deal_id,kind,meeting_status,done"),
]);

const report = buildVariantReport({ deals, activities, meetings, experimentId });
console.log(`\nExperimento: ${experimentId}`);
console.log("Variante | Enviados | Respostas validas | Reunioes realizadas | Propostas | Vendas");
for (const row of report) {
  console.log(
    `${row.variant.padEnd(8)} | ${String(row.counts.approached).padEnd(8)} | ${String(row.counts.validResponses).padEnd(17)} | ${String(row.counts.meetingsHeld).padEnd(20)} | ${String(row.counts.proposals).padEnd(9)} | ${row.counts.won}`,
  );
}
console.log("\nLeitura: compare taxas e volume. Amostra zero permanece zero; nenhum resultado e estimado.\n");
