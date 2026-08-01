/**
 * import-garimpo-leads.mjs
 * Ponte Garimpo -> CRM ERICK.
 *
 * O Garimpo (D:\001Gravity\Garimpo SAAS NOVO) ja puxa do Google Maps pelo Serper, com
 * rotacao de chaves, paginacao e dedupe proprio. O que faltava era a ENTRADA no CRM ser
 * inteligente: o lead chegava e perdia cidade, nota, avaliacoes, cid do Maps e o
 * WhatsApp que a empresa publica no proprio site.
 *
 * Toda a regra de entrada mora em scripts/lib/leadIngest.js, compartilhada com o
 * pull-city-serper.mjs. Aqui fica so a leitura do banco do Garimpo.
 *
 * USO:
 *   node scripts/import-garimpo-leads.mjs --cidade="Monlevade"        # dry-run
 *   node scripts/import-garimpo-leads.mjs --cidade="Monlevade" --go
 *   node scripts/import-garimpo-leads.mjs --uf=MG --limit=200 --go
 *   node scripts/import-garimpo-leads.mjs --go --sem-enrich           # pula visita ao site
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ingest = require(path.join(RAIZ, "scripts/lib/leadIngest.js"));
const { normalize, isExcluded } = require(path.join(RAIZ, "src/lib/leadScoring.js"));

function carregarEnv(arquivo, alvo = process.env, sobrescrever = false) {
  if (!fs.existsSync(arquivo)) return false;
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && (sobrescrever || !alvo[m[1]])) alvo[m[1]] = m[2].replace(/^["']|["']$/g, "");
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
const CIDADE = arg("cidade", "");
const UF = arg("uf", "");
const LIMITE = Number(arg("limit", 100));

// O Garimpo tem Supabase proprio. Lemos as credenciais do .env.local dele em vez de
// duplicar segredo aqui: uma chave rotacionada la continua valendo para este script.
const GARIMPO_ENV = arg("garimpo-env", process.env.GARIMPO_ENV_PATH || "D:/001Gravity/Garimpo SAAS NOVO/.env.local");
const g = {};
if (!carregarEnv(GARIMPO_ENV, g, true)) {
  console.error(`Nao achei o .env do Garimpo em ${GARIMPO_ENV}. Passe --garimpo-env=<caminho>.`);
  process.exit(1);
}

const CRM_URL = process.env.SUPABASE_URL;
const CRM_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!g.NEXT_PUBLIC_SUPABASE_URL || !g.SUPABASE_SERVICE_ROLE_KEY || !CRM_URL || !CRM_KEY) {
  console.error("Faltam credenciais do Garimpo ou do CRM.");
  process.exit(1);
}
const garimpo = ingest.crmClient(g.NEXT_PUBLIC_SUPABASE_URL, g.SUPABASE_SERVICE_ROLE_KEY);
const crm = ingest.crmClient(CRM_URL, CRM_KEY);

(async () => {
  // buscarTudo pagina de verdade: a primeira versao pediu Range 0-9999 e o PostgREST
  // devolveu so 1000 linhas, perdendo 214 leads em silencio.
  const brutos = await ingest.buscarTudo(garimpo, "leads?select=id,name,phone,website,address,rating,reviews_count,raw_data&order=id.desc");

  const alvoCidade = normalize(CIDADE);
  const candidatos = brutos
    .map((l) => {
      const raw = l.raw_data || {};
      const { city, uf } = ingest.cidadeUf(l.address);
      return {
        origem_garimpo: l.id,
        name: l.name,
        website: l.website || raw.website || null,
        phone: l.phone || raw.phoneNumber || null,
        address: l.address || raw.address || null,
        rating: l.rating ?? raw.rating ?? null,
        reviews_count: l.reviews_count ?? raw.ratingCount ?? 0,
        maps_cid: raw.cid || null,
        lat: raw.latitude ?? null,
        lng: raw.longitude ?? null,
        categoria: raw.type || null,
        city,
        uf,
        source: "garimpo_serper",
      };
    })
    .filter((l) => l.name)
    .filter((l) => !alvoCidade || normalize(l.city).includes(alvoCidade))
    .filter((l) => !UF || l.uf === UF.toUpperCase())
    .filter((l) => !isExcluded(l));

  console.log(`Garimpo: ${brutos.length} leads | filtro${CIDADE ? ` cidade=${CIDADE}` : ""}${UF ? ` uf=${UF}` : ""}: ${candidatos.length}`);

  const indice = await ingest.montarIndiceDedupe(crm);
  const { novos, motivos } = ingest.filtrarNovos(candidatos, indice, LIMITE);
  console.log(
    `Novos: ${novos.length} | descartados: cid ${motivos.cid}, nome ${motivos.nome}, telefone ${motivos.fone},` +
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

  console.log(`Top ${Math.min(15, itens.length)}${temPerfil ? " (lookalike ligado)" : ""}:`);
  for (const { lead, diag } of itens.slice(0, 15)) {
    console.log(
      `  ${String(diag.priority_score).padStart(3)} ${String(lead.name).slice(0, 36).padEnd(36)}` +
        ` ${String(lead.city || "?").slice(0, 16).padEnd(16)} ${diag.channel.padEnd(19)}` +
        ` ${ingest.segmentoCanonico(lead.name, lead.categoria) || "-"}`,
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
  console.log("Depois:        node scripts/regenerate-copies.js             (gera a copy dos novos)");
})();