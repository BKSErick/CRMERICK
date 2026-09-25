/**
 * Piloto controlado 20 Tier A + 20 Tier B (Story 065, P8 do checklist de 24/09/2026).
 * NUNCA envia mensagem. Sem --go so mostra a previa; com --go congela dois manifestos v2
 * (manha e tarde) e a auditoria em branco. A aprovacao continua sendo do Erick:
 *
 *   node scripts/prepare-pilot-batch.mjs --date=2026-09-28                 # previa
 *   node scripts/prepare-pilot-batch.mjs --date=2026-09-28 --go            # congela
 *   node scripts/audit-pilot.mjs --date=2026-09-28                         # le os 40
 *   node scripts/audit-pilot.mjs --date=2026-09-28 --aprovar=all --por=erick
 *   node scripts/approve-prospecting-day.mjs --date=2026-09-28 --slot=all  # hash
 *
 * Cada lead do manifesto leva empresa, evidencia, tier, acesso ao decisor, a mensagem
 * exata, a oferta e o resultado dos gates Willian Celso (texto) e Thiago Finch (economia).
 * Tudo isso entra no hash: mudou a copy, a aprovacao deixa de valer, e o envio confere a
 * copy do banco contra a do manifesto antes de cada mensagem.
 *
 * O lote passa antes pelo gate Finch de LOTE: resposta qualificada parada, lote anterior
 * sem classificacao, volume acima do piloto ou kill disparado seguram o piloto inteiro.
 * Reprovou um lead na auditoria? Rode de novo com --excluir=<ids> antes de aprovar.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { auditarCopy } from "../src/lib/copyGate.mjs";
import { avaliarGateFinchLead, avaliarGateFinchLote } from "../src/lib/finchGate.mjs";
import { avaliarElegibilidadeProspeccao } from "../src/lib/prospectingEligibility.mjs";
import { SALES_PLAYBOOK, ofertaDoLead } from "../src/lib/salesPlaybook.mjs";
import { manifestHash } from "../src/lib/prospectingApproval.ts";
import { carregarEnv, clienteSupabase } from "./lib/analise-comum.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "logs", "prospecting-batches");
const arg = (nome, padrao = "") => {
  const valor = process.argv.find((item) => item.startsWith(`--${nome}=`));
  return valor ? valor.slice(nome.length + 3) : padrao;
};
const GO = process.argv.includes("--go");
const date = arg("date");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Informe --date=AAAA-MM-DD (dia util do piloto).");
const tierA = Number(arg("tierA", SALES_PLAYBOOK.pilot.perTier.governante));
const tierB = Number(arg("tierB", SALES_PLAYBOOK.pilot.perTier.estruturado));
const excluir = arg("excluir", "").split(",").map(Number).filter(Number.isInteger);

carregarEnv(ROOT);
const db = clienteSupabase();
fs.mkdirSync(DIR, { recursive: true });

for (const slot of ["morning", "afternoon"]) {
  if (fs.existsSync(path.join(DIR, `${date}-${slot}.approval.json`))) {
    throw new Error(`Ja existe aprovacao para ${date}/${slot}. O piloto so e preparado antes do OK do Erick.`);
  }
}

// --- Gate Finch de lote ---------------------------------------------------------------
const relatorios = fs.readdirSync(DIR).filter((nome) => nome.endsWith("-pilot.report.json")).sort();
const pilotoAnterior = relatorios.length
  ? JSON.parse(fs.readFileSync(path.join(DIR, relatorios.at(-1)), "utf8").trimStart())
  : null;
const abertos = await db.get("deals?stage=not.in.(lost,won)&select=id,company,name,stage,response_type,last_inbound_at,last_outbound_at,is_icp,is_prospect,segment,segment_norm,cnae_descricao");
const lote = avaliarGateFinchLote({ deals: abertos, pedido: { governante: tierA, estruturado: tierB }, pilotoAnterior });
console.log(`Gate Thiago Finch (lote) para ${date}:`);
for (const item of lote.criterios) console.log(`  ${item.ok ? "OK  " : "NAO "} ${item.titulo} ${item.motivo}`);

// --- Candidatos: a mesma coleta do disparo, com todos os gates, cota por tier ----------
// IDs em manifesto ainda nao consumido (ex.: a fila congelada de 25/09) ficam de fora.
const emManifestoAberto = new Set();
for (const nome of fs.readdirSync(DIR).filter((item) => item.endsWith(".manifest.json"))) {
  const manifesto = JSON.parse(fs.readFileSync(path.join(DIR, nome), "utf8").trimStart());
  const aprovacao = path.join(DIR, nome.replace(".manifest.json", ".approval.json"));
  const consumido = fs.existsSync(aprovacao) && JSON.parse(fs.readFileSync(aprovacao, "utf8").trimStart()).consumedAt;
  if (manifesto.date >= new Date().toISOString().slice(0, 10) && !consumido && manifesto.date !== date) {
    for (const id of [...(manifesto.firstContactIds ?? []), ...(manifesto.followupIds ?? [])]) emManifestoAberto.add(Number(id));
  }
}
const excluidos = [...new Set([...excluir, ...emManifestoAberto])];
const saida = path.join("logs", "prospecting-batches", `${date}-pilot.candidates.json`);
const coleta = spawnSync(
  process.execPath,
  [
    path.join(ROOT, "scripts", "uazapi-send-batch.mjs"),
    `--limit=${tierA + tierB}`,
    `--por-tier=governante:${tierA},estruturado:${tierB}`,
    `--json-out=${saida}`,
    ...(excluidos.length ? [`--exclude-ids=${excluidos.join(",")}`] : []),
  ],
  { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" },
);
if (coleta.status !== 0) throw new Error(`Coleta de candidatos falhou (exit ${coleta.status}).`);
const candidatos = JSON.parse(fs.readFileSync(path.join(ROOT, saida), "utf8")).candidates ?? [];
fs.unlinkSync(path.join(ROOT, saida));
const retidosDaColeta = coleta.stdout.split("\n").filter((linha) => /^Retidos|^\s+#\d+/.test(linha)).slice(0, 12);

// --- Detalhe de cada lead + gates por mensagem ------------------------------------------
const ids = candidatos.map((item) => Number(item.id));
const campos = "id,company,name,stage,copy_text,site_url,segment,segment_norm,is_icp,porte,capital_social,cnae_descricao,decisor_nome,decision_access,eligibility_exception,points";
const deals = ids.length ? await db.get(`deals?id=in.(${ids.join(",")})&select=${campos}`) : [];
const porId = new Map(deals.map((deal) => [Number(deal.id), deal]));

const leads = [];
for (const id of ids) {
  const deal = porId.get(id);
  if (!deal) continue;
  const elegibilidade = avaliarElegibilidadeProspeccao(deal);
  const oferta = ofertaDoLead(elegibilidade);
  const willian = auditarCopy(deal.copy_text, { tier: elegibilidade.capacity_tier, degrau: "msg1" });
  const finch = avaliarGateFinchLead({ ...deal, prospectingEligibility: elegibilidade }, { degrau: "msg1", mensagem: deal.copy_text });
  leads.push({
    id,
    company: String(deal.company ?? deal.name ?? ""),
    tier: elegibilidade.capacity_tier,
    evidence: elegibilidade.capacity_evidence,
    decisionAccess: elegibilidade.decision_access,
    decisor: deal.decisor_nome ?? null,
    copy: String(deal.copy_text),
    offer: oferta
      ? { key: oferta.key, name: oferta.name, version: oferta.version, priceInMessage: oferta.priceInMessage }
      : { key: "nenhuma", name: "sem oferta", version: "-", priceInMessage: false },
    gates: {
      willian: { aprovado: willian.aprovado, pendenteManual: willian.pendenteManual, criterios: willian.criterios.map(({ id: c, status, motivo }) => ({ id: c, status, motivo })) },
      finch: { aprovado: finch.aprovado, criterios: finch.criterios.map(({ id: c, ok, motivo }) => ({ id: c, ok, motivo })) },
    },
  });
}

const doTier = (tier) => leads.filter((lead) => lead.tier === tier);
const a = doTier("governante");
const b = doTier("estruturado");
console.log(`\nCandidatos: Tier A ${a.length}/${tierA} | Tier B ${b.length}/${tierB}`);
if (retidosDaColeta.length) retidosDaColeta.forEach((linha) => console.log(`  ${linha.trim()}`));
for (const lead of leads) {
  const w = lead.gates.willian;
  console.log(`\n#${lead.id} ${lead.company} [${lead.tier === "governante" ? "Tier A" : "Tier B"}] oferta ${lead.offer.key} | acesso ${lead.decisionAccess}${lead.decisor ? ` (${lead.decisor})` : ""}`);
  console.log(`  evidencia: ${lead.evidence.join("; ") || "-"}`);
  console.log(`  Willian: ${w.aprovado ? (w.pendenteManual.length ? `MANUAL(${w.pendenteManual.join(",")})` : "OK") : "REPROVADO"} | Finch: ${lead.gates.finch.aprovado ? "OK" : "RETIDO"}`);
  console.log(lead.copy.split("\n").map((linha) => `    ${linha}`).join("\n"));
}

const faltam = [];
if (!lote.aprovado) faltam.push("gate Finch de lote reprovado");
if (a.length < tierA) faltam.push(`Tier A com ${a.length} de ${tierA}`);
if (b.length < tierB) faltam.push(`Tier B com ${b.length} de ${tierB}`);
if (!GO || faltam.length) {
  console.log(`\n${faltam.length ? `Piloto NAO congelado: ${faltam.join("; ")}.` : "Previa."} Nada gravado.${faltam.length ? "" : " Rode com --go para congelar."}`);
  process.exit(faltam.length && GO ? 2 : 0);
}

// --- Congela: manha e tarde com A e B intercalados, metade em cada turno ------------------
const intercalar = (x, y) => x.flatMap((item, i) => [item, y[i]]).concat(y.slice(x.length)).filter(Boolean);
const manha = intercalar(a.slice(0, Math.ceil(tierA / 2)), b.slice(0, Math.ceil(tierB / 2)));
const tarde = intercalar(a.slice(Math.ceil(tierA / 2), tierA), b.slice(Math.ceil(tierB / 2), tierB));
const createdAt = new Date().toISOString();
const manifestos = [
  { slot: "morning", leads: manha, cumulativeTarget: manha.length },
  { slot: "afternoon", leads: tarde, cumulativeTarget: manha.length + tarde.length },
].map(({ slot, leads: doTurno, cumulativeTarget }) => ({
  version: 2,
  kind: "pilot",
  pilotVersion: SALES_PLAYBOOK.pilot.version,
  date,
  slot,
  cumulativeTarget,
  firstContactIds: doTurno.map((lead) => lead.id),
  followupIds: [],
  createdAt,
  leads: doTurno,
}));

const auditoria = {
  version: 1,
  date,
  pilotVersion: SALES_PLAYBOOK.pilot.version,
  manifestHashes: Object.fromEntries(manifestos.map((manifesto) => [manifesto.slot, manifestHash(manifesto)])),
  auditadoPor: null,
  leads: manifestos.flatMap((manifesto) =>
    manifesto.leads.map((lead) => ({
      id: lead.id,
      slot: manifesto.slot,
      pendentesManuais: lead.gates.willian.pendenteManual,
      confirmacoes: Object.fromEntries(lead.gates.willian.pendenteManual.map((criterio) => [criterio, null])),
      aprovado: null,
      nota: "",
    })),
  ),
};

for (const manifesto of manifestos) {
  fs.writeFileSync(path.join(DIR, `${date}-${manifesto.slot}.manifest.json`), JSON.stringify(manifesto, null, 2) + "\n");
  console.log(`${manifesto.slot}: ${manifesto.leads.length} primeiras mensagens; alvo acumulado ${manifesto.cumulativeTarget}; hash ${manifestHash(manifesto).slice(0, 12)}.`);
}
fs.writeFileSync(path.join(DIR, `${date}-pilot.audit.json`), JSON.stringify(auditoria, null, 2) + "\n");
console.log(`\nPiloto congelado para ${date}. Nenhuma mensagem foi enviada.`);
console.log(`Proximo passo do Erick: node scripts/audit-pilot.mjs --date=${date}`);
