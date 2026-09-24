/**
 * Placar do piloto 20 Tier A + 20 Tier B (Story 065, P8). Le os manifestos v2 da data,
 * busca o que aconteceu com cada lead e compara Tier A e Tier B separados. So leitura no
 * banco; grava o relatorio em logs/prospecting-batches/<data>-pilot.report.json, que o
 * gate Finch de lote usa antes do proximo piloto (kill, scale, respostas sem leitura).
 *
 *   node scripts/pilot-report.mjs --date=2026-09-28
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { metricasDoPiloto } from "../src/lib/pilotMetrics.mjs";
import { carregarEnv, clienteSupabase } from "./lib/analise-comum.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "logs", "prospecting-batches");
const arg = (nome, padrao = "") => {
  const valor = process.argv.find((item) => item.startsWith(`--${nome}=`));
  return valor ? valor.slice(nome.length + 3) : padrao;
};
const date = arg("date");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Informe --date=AAAA-MM-DD do piloto.");

const leads = ["morning", "afternoon"]
  .map((slot) => path.join(DIR, `${date}-${slot}.manifest.json`))
  .filter((arquivo) => fs.existsSync(arquivo))
  .map((arquivo) => JSON.parse(fs.readFileSync(arquivo, "utf8").trimStart()))
  .filter((manifesto) => manifesto.version === 2)
  .flatMap((manifesto) => manifesto.leads.map((lead) => ({ id: Number(lead.id), tier: lead.tier, company: lead.company })));
if (!leads.length) throw new Error(`Nenhum manifesto de piloto (v2) para ${date}.`);

carregarEnv(ROOT);
const db = clienteSupabase();
const ids = leads.map((lead) => lead.id).join(",");
const [deals, messages, meetings, envios] = await Promise.all([
  db.get(`deals?id=in.(${ids})&select=id,company,stage,response_type,decision_access,referred_name,loss_reason_code`),
  db.get(`messages?deal_id=in.(${ids})&select=deal_id,direction,content,ai_intent,created_at`),
  db.get(`calendar_events?deal_id=in.(${ids})&select=deal_id,kind,meeting_status`),
  db.get(`activities?deal_id=in.(${ids})&type=eq.whatsapp_sent&select=deal_id,created_at&order=created_at.asc`),
]);
const primeiroEnvio = {};
for (const envio of envios) primeiroEnvio[envio.deal_id] ??= envio.created_at;

const relatorio = { date, geradoEm: new Date().toISOString(), enviados: Object.keys(primeiroEnvio).length, ...metricasDoPiloto({ leads, deals, messages, meetings, primeiroEnvio }) };

const linhas = ["decisor_alcancado", "reconhecimento", "case_aceito", "preco_apresentado", "entrada_producao", "proposta", "venda", "respondeu"];
console.log(`Piloto ${date} (${relatorio.pilotVersion}) | enviados ${relatorio.enviados}/${leads.length} | ${relatorio.encerrado ? "janela encerrada" : "janela aberta"}`);
console.log(`${"metrica".padEnd(20)} ${"Tier A".padStart(8)} ${"Tier B".padStart(8)}`);
const a = relatorio.tiers.governante ?? {};
const b = relatorio.tiers.estruturado ?? {};
for (const linha of linhas) {
  const rotulo = linha === "respondeu" ? "respondeu (sec.)" : linha;
  console.log(`${rotulo.padEnd(20)} ${`${a[linha] ?? 0}/${a.leads ?? 0}`.padStart(8)} ${`${b[linha] ?? 0}/${b.leads ?? 0}`.padStart(8)}`);
}
for (const [tier, placar] of Object.entries(relatorio.tiers)) {
  const nome = tier === "governante" ? "Tier A" : "Tier B";
  console.log(`\n${nome}: ${placar.kill ? `KILL (${placar.killMotivo})` : placar.scale ? "SCALE: pede decisao do Erick" : "seguir medindo"}`);
  if (Object.keys(placar.motivo_perda).length) console.log(`  motivo real de perda: ${JSON.stringify(placar.motivo_perda)}`);
  if (placar.pendentesClassificacao) console.log(`  ${placar.pendentesClassificacao} lead(s) com resposta sem leitura: rode npm run ai:reler-whatsapp antes do proximo lote`);
}

const destino = path.join(DIR, `${date}-pilot.report.json`);
fs.writeFileSync(destino, JSON.stringify(relatorio, null, 2) + "\n");
console.log(`\nRelatorio gravado em ${path.relative(ROOT, destino)}.`);
