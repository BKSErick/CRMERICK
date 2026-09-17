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

// USO:
//   node scripts/report-copy-experiment.mjs          # experimento vigente (A x B)
//   node scripts/report-copy-experiment.mjs --todos  # todos os experimentos, v1..v4, um abaixo do outro
//
// "Chegou a preco" vem da conversa (mensagem ENVIADA com R$), nao do stage:
// taxa de resposta e a metrica errada pra comparar copy; o que decide e quantos
// dos que responderam viram preco e quantos desses fecharam.
const TODOS = process.argv.includes("--todos");
const experimentoVigente = salesPlaybookModule.SALES_PLAYBOOK.experiment.id;

const filtroDeals = TODOS ? "experiment_id=not.is.null" : `experiment_id=eq.${encodeURIComponent(experimentoVigente)}`;
const [deals, activities, meetings, messages] = await Promise.all([
  table(`deals?${filtroDeals}&select=id,stage,response_type,referred_phone,value,recurring,is_prospect,copy_variant,experiment_id`),
  table("activities?type=in.(whatsapp_sent,whatsapp_sent_sync)&select=deal_id,type"),
  table("calendar_events?kind=eq.reuniao&select=deal_id,kind,meeting_status,done"),
  table("messages?deal_id=not.is.null&select=deal_id,direction,content"),
]);

const experimentos = TODOS ? [...new Set(deals.map((d) => d.experiment_id))].sort() : [experimentoVigente];
const pad = (v, n) => String(v).padEnd(n);

for (const experimentId of experimentos) {
  const report = buildVariantReport({ deals, activities, meetings, messages, experimentId });
  console.log(`\nExperimento: ${experimentId}${experimentId === experimentoVigente ? " (vigente)" : ""}`);
  console.log("Variante | Enviados | Respostas validas | Lead pediu preco | Chegou a preco | Preco/resp. | Reunioes realizadas | Propostas | Vendas");
  for (const row of report) {
    const c = row.counts;
    console.log(
      `${pad(row.variant, 8)} | ${pad(c.approached, 8)} | ${pad(c.validResponses, 17)} | ${pad(c.leadAskedPrice, 16)} | ${pad(c.reachedPrice, 14)} | ${pad(row.rates.pricePerResponse + "%", 11)} | ${pad(c.meetingsHeld, 19)} | ${pad(c.proposals, 9)} | ${c.won}`,
    );
  }
}
console.log("\nLeitura: compare taxas e volume. Amostra zero permanece zero; nenhum resultado e estimado.");
console.log("Chegou a preco = alguma mensagem enviada na thread tem R$. Lead pediu preco = alguma recebida pergunta valor/quanto.\n");
