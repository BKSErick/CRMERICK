/**
 * import-acimon-leads.mjs
 * Lista de associados da ACIMON -> CRM ERICK.
 *
 * Terceira fonte de lead, ao lado do Serper (pull-city-serper.mjs) e do Garimpo
 * (import-garimpo-leads.mjs). A diferenca e a origem: aqui o lead vem do quadro de
 * associados da Associacao Comercial e Empresarial de Joao Monlevade, digitado a mao
 * em data/acimon-industrias.json. Nao tem cid do Maps nem nota, entao o dedupe cai
 * para nome, telefone e dominio.
 *
 * Vale medir separado: lead de associacao tem ponte institucional possivel, o que o
 * lead de Google Maps nao tem. Por isso source = "acimon_associados".
 *
 * Toda a regra de entrada continua em scripts/lib/leadIngest.js.
 *
 * USO:
 *   node scripts/import-acimon-leads.mjs            # dry-run
 *   node scripts/import-acimon-leads.mjs --go       # grava
 *   node scripts/import-acimon-leads.mjs --go --sem-enrich
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ingest = require(path.join(RAIZ, "scripts/lib/leadIngest.js"));
const { isExcluded } = require(path.join(RAIZ, "src/lib/leadScoring.js"));

function carregarEnv(arquivo) {
  if (!fs.existsSync(arquivo)) return false;
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return true;
}
carregarEnv(path.join(RAIZ, ".env"));

const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const GO = process.argv.includes("--go");
const SEM_ENRICH = process.argv.includes("--sem-enrich");
const ARQUIVO = arg("arquivo", path.join(RAIZ, "data", "acimon-industrias.json"));

const CRM_URL = process.env.SUPABASE_URL;
const CRM_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!CRM_URL || !CRM_KEY) {
  console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env do CRM.");
  process.exit(1);
}
const crm = ingest.crmClient(CRM_URL, CRM_KEY);

(async () => {
  const brutos = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));

  const candidatos = brutos
    .map((l) => ({
      name: l.name,
      website: l.website || null,
      phone: l.phone || null,
      address: l.address || null,
      rating: null,
      reviews_count: 0,
      maps_cid: null,
      lat: null,
      lng: null,
      categoria: l.categoria || null,
      city: "João Monlevade",
      uf: "MG",
      source: "acimon_associados",
    }))
    .filter((l) => l.name)
    .filter((l) => !isExcluded(l));

  console.log(`ACIMON: ${brutos.length} no arquivo | candidatos validos: ${candidatos.length}`);

  const indice = await ingest.montarIndiceDedupe(crm);
  const { novos, motivos } = ingest.filtrarNovos(candidatos, indice);
  console.log(
    `Novos: ${novos.length} | descartados: nome ${motivos.nome}, telefone ${motivos.fone},` +
      ` dominio ${motivos.dominio}, cliente ${motivos.cliente}, lista-negra ${motivos.proibido}\n`,
  );
  if (!novos.length) return;

  if (!SEM_ENRICH) {
    const r = await ingest.enriquecer(novos);
    console.log(`Sites visitados: ${r.visitados} | com WhatsApp publicado: ${r.comWhatsapp}\n`);
  }

  const { itens, temPerfil } = ingest.pontuar(novos);
  const comCanal = itens.filter((i) => i.diag.phone_e164).length;
  const comSeg = itens.filter((i) => ingest.segmentoCanonico(i.lead.name, i.lead.categoria)).length;
  console.log(`Com canal utilizavel: ${comCanal}/${itens.length} | com segmento canonico: ${comSeg}/${itens.length}\n`);

  console.log(`Fila${temPerfil ? " (lookalike ligado)" : ""}:`);
  for (const { lead, diag } of itens) {
    console.log(
      `  ${String(diag.priority_score).padStart(3)} ${String(lead.name).slice(0, 30).padEnd(30)}` +
        ` ${diag.channel.padEnd(19)} ${ingest.segmentoCanonico(lead.name, lead.categoria) || "-"}`,
    );
  }

  if (!GO) {
    console.log("\nDry-run: nada gravado no CRM. Rode com --go para importar.");
    return;
  }

  const { gravados, falhas } = await ingest.gravar(crm, itens, indice.proximoId);
  console.log(`\nImportados: ${gravados}/${itens.length}`);
  for (const f of falhas.slice(0, 8)) console.log(`  FALHA ${f}`);
  console.log("\nProximo passo: node scripts/uazapi-check-numbers.mjs --go   (ve quais fixos atendem no WhatsApp)");
  console.log("Depois:        node scripts/generate-copies-db.mjs --cidade=\"Joao Monlevade\" --go");
})();
