/**
 * Auditoria manual do piloto (Story 065, P8). Quem roda e o Erick: a aprovacao do hash
 * so sai quando cada lead foi lido e aprovado aqui.
 *
 *   node scripts/audit-pilot.mjs --date=2026-09-28                      # le os leads
 *   node scripts/audit-pilot.mjs --date=2026-09-28 --aprovar=all --por=erick
 *   node scripts/audit-pilot.mjs --date=2026-09-28 --aprovar=812,905 --por=erick
 *   node scripts/audit-pilot.mjs --date=2026-09-28 --reprovar=812 --nota="copy fala de site" --por=erick
 *
 * Aprovar um lead confirma os criterios manuais do gate Willian Celso que regex nao decide
 * (cercadinho visivel, prova de que entendemos a operacao). Lead reprovado bloqueia a
 * aprovacao do turno: rode prepare-pilot-batch.mjs de novo com --excluir=<id>.
 * Nao envia mensagem e nao cria a aprovacao do hash (isso e approve-prospecting-day.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { manifestHash, pilotAuditIssues } from "../src/lib/prospectingApproval.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "logs", "prospecting-batches");
const arg = (nome, padrao = "") => {
  const valor = process.argv.find((item) => item.startsWith(`--${nome}=`));
  return valor ? valor.slice(nome.length + 3) : padrao;
};
const date = arg("date");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Informe --date=AAAA-MM-DD.");
const lerJson = (arquivo) => JSON.parse(fs.readFileSync(arquivo, "utf8").trimStart());

const auditFile = path.join(DIR, `${date}-pilot.audit.json`);
if (!fs.existsSync(auditFile)) throw new Error(`Auditoria ausente: rode prepare-pilot-batch.mjs --date=${date} --go.`);
const auditoria = lerJson(auditFile);
const manifestos = ["morning", "afternoon"]
  .map((slot) => path.join(DIR, `${date}-${slot}.manifest.json`))
  .filter((arquivo) => fs.existsSync(arquivo))
  .map(lerJson)
  .filter((manifesto) => manifesto.version === 2);

const aprovar = arg("aprovar");
const reprovar = arg("reprovar");
const por = arg("por").trim();
if ((aprovar || reprovar) && !por) throw new Error("Informe --por=<quem auditou>.");

const idsDe = (lista) =>
  lista === "all" ? new Set(auditoria.leads.map((lead) => Number(lead.id))) : new Set(lista.split(",").map(Number).filter(Number.isInteger));

if (aprovar || reprovar) {
  // A auditoria vale para a versao exata do manifesto; se ele foi regenerado, recomeca.
  for (const manifesto of manifestos) {
    if (auditoria.manifestHashes?.[manifesto.slot] !== manifestHash(manifesto)) {
      throw new Error(`O manifesto ${manifesto.slot} mudou depois que a auditoria foi criada. Rode prepare-pilot-batch.mjs de novo.`);
    }
  }
  const paraAprovar = aprovar ? idsDe(aprovar) : new Set();
  const paraReprovar = reprovar ? idsDe(reprovar) : new Set();
  for (const lead of auditoria.leads) {
    const id = Number(lead.id);
    if (paraReprovar.has(id)) {
      lead.aprovado = false;
      lead.nota = arg("nota", lead.nota ?? "");
    } else if (paraAprovar.has(id)) {
      lead.aprovado = true;
      for (const criterio of lead.pendentesManuais ?? []) lead.confirmacoes[criterio] = true;
    }
  }
  auditoria.auditadoPor = por;
  auditoria.auditadoEm = new Date().toISOString();
  fs.writeFileSync(auditFile, JSON.stringify(auditoria, null, 2) + "\n");
}

const registro = new Map(auditoria.leads.map((lead) => [Number(lead.id), lead]));
for (const manifesto of manifestos) {
  console.log(`\n=== ${date} ${manifesto.slot}: ${manifesto.leads.length} leads (hash ${manifestHash(manifesto).slice(0, 12)}) ===`);
  for (const lead of manifesto.leads) {
    const r = registro.get(Number(lead.id));
    const status = r?.aprovado === true ? "APROVADO" : r?.aprovado === false ? `REPROVADO (${r.nota || "sem nota"})` : "pendente";
    console.log(`\n#${lead.id} ${lead.company} [${lead.tier === "governante" ? "Tier A" : "Tier B"}] ${status}`);
    console.log(`  oferta: ${lead.offer.name} (${lead.offer.priceInMessage ? "preco na conversa" : "preco so na proposta"})`);
    console.log(`  acesso: ${lead.decisionAccess}${lead.decisor ? ` (${lead.decisor})` : ""} | evidencia: ${lead.evidence.join("; ") || "-"}`);
    const w = lead.gates.willian;
    console.log(`  Willian: ${w.criterios.map((c) => `${c.id}=${c.status}`).join(" ")}`);
    console.log(`  Finch: ${lead.gates.finch.criterios.map((c) => `${c.id}=${c.ok ? "ok" : "nao"}`).join(" ")}`);
    console.log(lead.copy.split("\n").map((linha) => `    ${linha}`).join("\n"));
  }
  const problemas = pilotAuditIssues(manifesto, auditoria);
  console.log(`\n${manifesto.slot}: ${problemas.length ? `${problemas.length} pendencia(s) antes do OK` : "pronto para approve-prospecting-day"}`);
  problemas.slice(0, 10).forEach((problema) => console.log(`   ${problema}`));
}
