/**
 * pull-city-serper.mjs
 * Puxa empresas de uma cidade no Google Maps (via Serper) direto para o CRM.
 *
 * Existe porque o Garimpo so tinha 7 leads de Joao Monlevade: a garimpagem original foi
 * feita em BH, Contagem e Ipatinga, e a cidade do Erick ficou descoberta.
 *
 * As chaves do Serper vivem no .env.local do Garimpo (SERPER_API_KEYS, separadas por
 * virgula). Nao duplicamos segredo aqui: chave rotacionada la vale para este script.
 *
 * USO:
 *   node scripts/pull-city-serper.mjs --cidade="Joao Monlevade" --uf=MG
 *   node scripts/pull-city-serper.mjs --cidade="Joao Monlevade" --uf=MG --go
 *   node scripts/pull-city-serper.mjs --cidade="Timoteo" --uf=MG --queries="usinagem,solda" --go
 *   node scripts/pull-city-serper.mjs --cidade="Ipatinga" --uf=MG --paginas=3 --go
 *
 * DEFAULT E DRY-RUN: sem --go ele mostra o que entraria e nao grava nada.
 * O lead entra ja com cidade, nota, avaliacoes, cid do Maps, WhatsApp do site (quando
 * publicado), segmento canonico e score com lookalike.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ingest = require(path.join(RAIZ, "scripts/lib/leadIngest.js"));
const { isExcluded, normalize } = require(path.join(RAIZ, "src/lib/leadScoring.js"));

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
const UF = arg("uf", "MG").toUpperCase();
const PAGINAS = Number(arg("paginas", 2));
const LIMITE = Number(arg("limit", 300));

if (!CIDADE) {
  console.error('Passe a cidade: --cidade="Joao Monlevade" --uf=MG');
  process.exit(1);
}

// Nichos que a operacao ja sabe atender e para os quais existe copy e case. Puxar
// alem disso enche a base de lead que nao vai ser abordado.
const QUERIES_PADRAO = [
  "usinagem",
  "tornearia mecanica",
  "caldeiraria",
  "serralheria",
  "metalurgica",
  "manutencao industrial",
  "manutencao de maquinas",
  "automacao industrial",
  "instalacoes eletricas industriais",
  "ar condicionado",
  "refrigeracao",
];
const QUERIES = arg("queries", "") ? arg("queries", "").split(",").map((q) => q.trim()).filter(Boolean) : QUERIES_PADRAO;

const GARIMPO_ENV = arg("garimpo-env", process.env.GARIMPO_ENV_PATH || "D:/001Gravity/Garimpo SAAS NOVO/.env.local");
const g = {};
carregarEnv(GARIMPO_ENV, g, true);
const CHAVES = String(process.env.SERPER_API_KEYS || process.env.SERPER_API_KEY || g.SERPER_API_KEYS || g.SERPER_API_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

if (!CHAVES.length) {
  console.error(`Nenhuma chave do Serper encontrada (procurei em .env e em ${GARIMPO_ENV}).`);
  process.exit(1);
}

const CRM_URL = process.env.SUPABASE_URL;
const CRM_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!CRM_URL || !CRM_KEY) {
  console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env do CRM.");
  process.exit(1);
}
const crm = ingest.crmClient(CRM_URL, CRM_KEY);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Rotaciona as chaves: quando uma estoura credito ou volta Unauthorized, tenta a proxima
// em vez de abortar a puxada inteira (mesma logica do Garimpo).
let chaveAtual = 0;
async function serperMaps(corpo) {
  for (let tentativa = 0; tentativa < CHAVES.length; tentativa++) {
    const chave = CHAVES[(chaveAtual + tentativa) % CHAVES.length];
    try {
      const r = await fetch("https://google.serper.dev/maps", {
        method: "POST",
        headers: { "X-API-KEY": chave, "Content-Type": "application/json" },
        body: JSON.stringify({ gl: "br", hl: "pt-br", ...corpo }),
      });
      const dados = await r.json();
      if (r.ok && !dados.error && dados.message !== "Unauthorized.") {
        chaveAtual = (chaveAtual + tentativa) % CHAVES.length;
        return dados;
      }
      console.warn(`  chave ${chave.slice(0, 6)} recusada: ${dados.error || dados.message || r.statusText}`);
    } catch (e) {
      console.warn(`  chave ${chave.slice(0, 6)} falhou: ${e.message}`);
    }
  }
  return null;
}

(async () => {
  const alvoCidade = normalize(CIDADE);
  const local = `${CIDADE} ${UF}`;
  console.log(`Puxando "${local}" | ${QUERIES.length} nichos | ${PAGINAS} pagina(s) | ${CHAVES.length} chave(s) do Serper`);
  console.log(`Modo: ${GO ? "GRAVA NO CRM" : "dry-run"}\n`);

  const porCid = new Map();
  for (const q of QUERIES) {
    const consulta = `${q} em ${local}`;
    let ll = null;
    let achadosNaQuery = 0;

    for (let pagina = 1; pagina <= PAGINAS; pagina++) {
      const dados = await serperMaps({ q: consulta, num: 20, ...(pagina > 1 ? { page: pagina, ll } : {}) });
      if (!dados) {
        console.error("Todas as chaves do Serper falharam. Abortado.");
        process.exit(1);
      }
      ll = ll || dados.ll;
      const lugares = dados.places || dados.maps || [];
      if (!lugares.length) break;

      for (const p of lugares) {
        const { city, uf } = ingest.cidadeUf(p.address);
        // O Maps devolve vizinhanca: filtramos pela cidade pedida, senao a base enche de
        // empresa de outra cidade e medir por cidade perde o sentido. Compara SEM acento:
        // o Maps devolve "Joao Monlevade" acentuado e a comparacao crua descartava tudo.
        if (alvoCidade && city && !normalize(city).includes(alvoCidade)) continue;
        const chave = p.cid || `${p.title}|${p.phoneNumber || ""}`;
        if (porCid.has(chave)) continue;
        porCid.set(chave, {
          name: p.title,
          website: p.website || null,
          phone: p.phoneNumber || null,
          address: p.address || null,
          rating: p.rating ?? null,
          reviews_count: p.ratingCount ?? 0,
          maps_cid: p.cid || null,
          lat: p.latitude ?? null,
          lng: p.longitude ?? null,
          categoria: p.type || null,
          city: city || CIDADE,
          uf: uf || UF,
          source: "serper_maps",
          nicho: q,
        });
        achadosNaQuery++;
      }
      await dormir(300);
    }
    console.log(`  ${q.padEnd(34)} +${achadosNaQuery}`);
  }

  // Uma cidade, uma grafia. Quando o Maps nao traz cidade caimos no argumento da linha
  // de comando, que costuma vir sem acento: gravar "Joao Monlevade" e "Joao Monlevade"
  // como coisas diferentes racharia a medicao por cidade em duas linhas.
  const grafias = {};
  for (const l of porCid.values()) {
    if (!l.city) continue;
    const k = normalize(l.city);
    grafias[k] = grafias[k] || {};
    grafias[k][l.city] = (grafias[k][l.city] || 0) + 1;
  }
  for (const l of porCid.values()) {
    const contagem = grafias[normalize(l.city || "")];
    if (contagem) l.city = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0][0];
  }

  const candidatos = [...porCid.values()].filter((l) => l.name).filter((l) => !isExcluded(l));
  console.log(`\nLugares unicos em ${CIDADE}: ${candidatos.length}`);

  const indice = await ingest.montarIndiceDedupe(crm);
  const { novos, motivos } = ingest.filtrarNovos(candidatos, indice, LIMITE);
  console.log(
    `Novos: ${novos.length} | descartados: cid ${motivos.cid}, nome ${motivos.nome}, telefone ${motivos.fone},` +
      ` dominio ${motivos.dominio}, cliente ${motivos.cliente}, lista-negra ${motivos.proibido}`,
  );
  if (!novos.length) return;

  if (!SEM_ENRICH) {
    const r = await ingest.enriquecer(novos);
    console.log(`Sites visitados: ${r.visitados} | com WhatsApp publicado: ${r.comWhatsapp}`);
  }

  const { itens, temPerfil } = ingest.pontuar(novos);
  const comCanal = itens.filter((i) => i.diag.phone_e164).length;
  const comSeg = itens.filter((i) => ingest.segmentoCanonico(i.lead.name, i.lead.categoria, i.lead.nicho)).length;
  console.log(`Com canal utilizavel: ${comCanal}/${itens.length} | com segmento canonico: ${comSeg}/${itens.length}\n`);

  console.log(`Top ${Math.min(15, itens.length)}${temPerfil ? " (lookalike ligado)" : ""}:`);
  for (const { lead, diag } of itens.slice(0, 15)) {
    console.log(
      `  ${String(diag.priority_score).padStart(3)} ${String(lead.name).slice(0, 36).padEnd(36)}` +
        ` ${String(lead.rating ?? "-").padStart(3)}* ${String(lead.reviews_count).padStart(4)}av` +
        ` ${diag.channel.padEnd(19)} ${ingest.segmentoCanonico(lead.name, lead.categoria, lead.nicho) || "-"}`,
    );
  }

  if (!GO) {
    console.log("\nDry-run: nada gravado. Rode com --go para importar.");
    return;
  }

  // O nicho da query e um sinal de segmento tao bom quanto o nome (quem aparece na
  // busca de "caldeiraria" faz caldeiraria, mesmo que o nome nao diga).
  for (const { lead } of itens) lead.categoria = [lead.categoria, lead.nicho].filter(Boolean).join(" ");

  const { gravados, falhas } = await ingest.gravar(crm, itens, indice.proximoId);
  console.log(`\nImportados: ${gravados}/${itens.length}`);
  for (const f of falhas.slice(0, 8)) console.log(`  FALHA ${f}`);
  console.log("\nProximo passo: node scripts/uazapi-check-numbers.mjs --go   (ve quais fixos atendem no WhatsApp)");
  console.log("Depois:        node scripts/regenerate-copies.js             (gera a copy dos novos)");
})();