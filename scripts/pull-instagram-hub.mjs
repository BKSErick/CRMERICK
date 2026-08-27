/**
 * pull-instagram-hub.mjs
 * Puxa leads B2B no Instagram a partir de contas hub, feiras, associações ou nichos locais de forma 100% GRATUITA.
 *
 * Usa a busca orgânica do Serper (site:instagram.com) com as chaves já existentes no Garimpo (.env.local),
 * descobre o site oficial da empresa, extrai o WhatsApp, consulta o CNPJ na MinhaReceita API e grava no CRM.
 *
 * USO:
 *   node scripts/pull-instagram-hub.mjs --hub="acimon_oficial" --cidade="Joao Monlevade" --uf=MG
 *   node scripts/pull-instagram-hub.mjs --nicho="engenharia industrial" --cidade="Ipatinga" --uf=MG --go
 *   node scripts/pull-instagram-hub.mjs --nicho="agronegocio" --cidade="Uberlandia" --uf=MG --go
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ingest = require(path.join(RAIZ, "scripts/lib/leadIngest.js"));
const cnpjEnrich = require(path.join(RAIZ, "scripts/lib/cnpjEnrich.js"));
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
const HUB = arg("hub", "");
const NICHO = arg("nicho", "engenharia industrial");
const CIDADE = arg("cidade", "");
const UF = arg("uf", "MG").toUpperCase();
const LIMITE = Number(arg("limit", 50));

const GARIMPO_ENV = arg("garimpo-env", process.env.GARIMPO_ENV_PATH || "D:/001Gravity/Garimpo SAAS NOVO/.env.local");
const g = {};
carregarEnv(GARIMPO_ENV, g, true);
const CHAVES = String(process.env.SERPER_API_KEYS || process.env.SERPER_API_KEY || g.SERPER_API_KEYS || g.SERPER_API_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

if (!CHAVES.length) {
  console.error("Nenhuma chave do Serper encontrada em .env ou Garimpo.");
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

let chaveAtual = 0;
async function serperSearch(corpo) {
  for (let tentativa = 0; tentativa < CHAVES.length; tentativa++) {
    const chave = CHAVES[(chaveAtual + tentativa) % CHAVES.length];
    try {
      const r = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": chave, "Content-Type": "application/json" },
        body: JSON.stringify({ gl: "br", hl: "pt-br", ...corpo }),
      });
      const dados = await r.json();
      if (r.ok && !dados.error && dados.message !== "Unauthorized.") {
        chaveAtual = (chaveAtual + tentativa) % CHAVES.length;
        return dados;
      }
    } catch {
      /* proxima chave */
    }
  }
  return null;
}

function extrairHandleInstagram(link) {
  if (!link) return null;
  const m = String(link).match(/instagram\.com\/([a-z0-9._-]+)/i);
  if (!m) return null;
  const handle = m[1].toLowerCase();
  if (["p", "reel", "reels", "stories", "explore", "direct", "accounts"].includes(handle)) return null;
  return handle;
}

(async () => {
  const alvoBusca = HUB ? `@${HUB.replace(/^@/, "")}` : NICHO;
  const local = CIDADE ? `${CIDADE} ${UF}` : UF;
  console.log(`Puxando Instagram: "${alvoBusca}" em "${local}" (Gratuito)`);
  console.log(`Modo: ${GO ? "GRAVA NO CRM" : "dry-run"}\n`);

  const consultas = HUB
    ? [`site:instagram.com ${HUB} ${local}`, `site:instagram.com ${HUB}`]
    : [`site:instagram.com ${NICHO} ${CIDADE || ""} ${UF}`, `${NICHO} ${CIDADE || ""} instagram.com`];

  const achados = new Map();
  for (const q of consultas) {
    const res = await serperSearch({ q, num: 20 });
    if (!res || !res.organic) continue;
    for (const item of res.organic) {
      const handle = extrairHandleInstagram(item.link);
      if (!handle || achados.has(handle)) continue;

      const titulo = item.title ? item.title.replace(/\s*\(.*?\)/g, "").replace(/\s*•\s*Instagram.*/i, "").trim() : handle;
      const snippet = item.snippet || "";
      const text = `${titulo} ${snippet}`;

      achados.set(handle, {
        name: titulo || handle,
        instagram: `https://www.instagram.com/${handle}/`,
        instagram_handle: handle,
        website: item.link,
        city: CIDADE,
        uf: UF,
        source: "serper_instagram",
        nicho: NICHO,
        snippet,
        categoria: NICHO,
      });
    }
    await dormir(300);
  }

  const candidatos = [...achados.values()].filter((l) => !isExcluded(l));
  console.log(`Perfis únicos encontrados no Instagram: ${candidatos.length}`);

  const indice = await ingest.montarIndiceDedupe(crm);
  const { novos, motivos } = ingest.filtrarNovos(candidatos, indice, LIMITE);
  console.log(
    `Novos: ${novos.length} | descartados: cid ${motivos.cid}, nome ${motivos.nome}, fone ${motivos.fone}, dominio ${motivos.dominio}`,
  );
  if (!novos.length) return;

  // Enriquecimento de site e busca de CNPJ via MinhaReceita
  process.stdout.write("\nBuscando dados de CNPJ e Porte (MinhaReceita)... ");
  let cnpjsAchados = 0;
  let meCount = 0;
  let eppCount = 0;

  for (const lead of novos) {
    const clientSerper = { search: (body) => serperSearch(body) };
    const dadosCnpj = await cnpjEnrich.searchCnpjViaSerper(lead.name, lead.city, lead.uf, clientSerper);
    if (dadosCnpj) {
      cnpjsAchados++;
      Object.assign(lead, {
        cnpj: dadosCnpj.cnpj,
        capital_social: dadosCnpj.capital_social,
        porte: dadosCnpj.porte,
        situacao_cadastral: dadosCnpj.situacao_cadastral,
        cnae_principal: dadosCnpj.cnae_principal,
        cnae_descricao: dadosCnpj.cnae_descricao,
        receita_phones: dadosCnpj.receita_phones,
        email: lead.email || dadosCnpj.email_receita,
      });
      if (dadosCnpj.porte === "ME") meCount++;
      if (dadosCnpj.porte === "EPP" || dadosCnpj.porte === "DEMAIS") eppCount++;
    }
  }
  console.log(`OK (${cnpjsAchados}/${novos.length} com CNPJ | ME: ${meCount}, EPP/Demais: ${eppCount})`);

  const { itens } = ingest.pontuar(novos);
  console.log(`\nTop ${Math.min(10, itens.length)} leads do Instagram:`);
  for (const { lead, diag } of itens.slice(0, 10)) {
    console.log(
      `  ${String(diag.priority_score).padStart(3)} ${String(lead.name).slice(0, 32).padEnd(32)}` +
        ` @${String(lead.instagram_handle).padEnd(18)} Porte: ${(lead.porte || "N/I").padEnd(6)} Fone: ${diag.phone_e164 || "—"}`,
    );
  }

  if (!GO) {
    console.log("\nDry-run: nada gravado. Rode com --go para importar.");
    return;
  }

  const { gravados, falhas } = await ingest.gravar(crm, itens, indice.proximoId);
  console.log(`\nImportados do Instagram: ${gravados}/${itens.length}`);
  for (const f of falhas.slice(0, 5)) console.log(`  FALHA ${f}`);
})();
