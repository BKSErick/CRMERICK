/**
 * enrich-existing-crm-leads.mjs
 * Passa todos os leads JÁ EXISTENTES no banco do CRM pelo novo filtro de CNPJ, Porte e Situação Cadastral.
 *
 * USO:
 *   node scripts/enrich-existing-crm-leads.mjs                  (dry-run: mostra o que mudaria)
 *   node scripts/enrich-existing-crm-leads.mjs --go             (grava os CNPJs e novos scores no Supabase)
 *   node scripts/enrich-existing-crm-leads.mjs --cidade="Monlevade" --go
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ingest = require(path.join(RAIZ, "scripts/lib/leadIngest.js"));
const cnpjEnrich = require(path.join(RAIZ, "scripts/lib/cnpjEnrich.js"));
const { diagnoseLead, normalize } = require(path.join(RAIZ, "src/lib/leadScoring.js"));

function carregarEnv(arquivo, alvo = process.env, sobrescrever = false) {
  if (!fs.existsSync(arquivo)) return false;
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && (sobrescrever || !alvo[m[1]])) alvo[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return true;
}
carregarEnv(path.join(RAIZ, ".env"));

const GO = process.argv.includes("--go");
const CIDADE_FILTRO = process.argv.find((x) => x.startsWith("--cidade="))?.split("=")[1] || "";

const CRM_URL = process.env.SUPABASE_URL;
const CRM_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!CRM_URL || !CRM_KEY) {
  console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env do CRM.");
  process.exit(1);
}
const crm = ingest.crmClient(CRM_URL, CRM_KEY);

const GARIMPO_ENV = process.env.GARIMPO_ENV_PATH || "D:/001Gravity/Garimpo SAAS NOVO/.env.local";
const g = {};
carregarEnv(GARIMPO_ENV, g, true);
const CHAVES = String(process.env.SERPER_API_KEYS || process.env.SERPER_API_KEY || g.SERPER_API_KEYS || g.SERPER_API_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

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

(async () => {
  console.log(`Re-analisando e enriquecendo leads JÁ EXISTENTES no CRM...`);
  console.log(`Modo: ${GO ? "GRAVA NO SUPABASE" : "dry-run (apenas exibição)"}\n`);

  // Busca contatos e deals ativos no CRM
  const [contatos, deals] = await Promise.all([
    ingest.buscarTudo(crm, "contacts?select=id,name,company,phone,city,uf,site_url,maps_cid,rating,reviews_count,cnpj,status"),
    ingest.buscarTudo(crm, "deals?select=id,name,company,segment,stage,points,site_url,phone"),
  ]);

  const dealsMap = new Map(deals.map((d) => [d.id, d]));
  let alvos = contatos.filter((c) => c.status !== "client" && c.status !== "lost");

  if (CIDADE_FILTRO) {
    const cf = normalize(CIDADE_FILTRO);
    alvos = alvos.filter((c) => normalize(c.city || "").includes(cf));
  }

  console.log(`Total de leads em fila no CRM: ${alvos.length}`);

  let comCnpjNovos = 0;
  let inativas = 0;
  let meCount = 0;
  let eppCount = 0;
  let meiCount = 0;
  const perfil = ingest.perfilVencedor();

  const atualizados = [];

  for (let i = 0; i < alvos.length; i++) {
    const contact = alvos[i];
    const deal = dealsMap.get(contact.id) || {};
    const nome = contact.company || contact.name;
    process.stdout.write(`[${i + 1}/${alvos.length}] ${nome.slice(0, 35).padEnd(35)} ... `);

    let dadosCnpj = null;
    if (contact.cnpj) {
      dadosCnpj = await cnpjEnrich.fetchCnpjMinhaReceita(contact.cnpj);
    }

    if (!dadosCnpj && contact.site_url) {
      const html = await require(path.join(RAIZ, "scripts/lib/leadEnrich.js")).fetchLeadHtml(contact.site_url).catch(() => null);
      if (html) {
        const cnpjs = cnpjEnrich.extractCnpjsFromText(html);
        if (cnpjs.length > 0) {
          dadosCnpj = await cnpjEnrich.fetchCnpjMinhaReceita(cnpjs[0]);
        }
      }
    }

    if (!dadosCnpj && CHAVES.length > 0) {
      const clientSerper = { search: (body) => serperSearch(body) };
      dadosCnpj = await cnpjEnrich.searchCnpjViaSerper(nome, contact.city, contact.uf, clientSerper);
    }

    const leadMock = {
      name: nome,
      phone: contact.phone || deal.phone,
      website: contact.site_url || deal.site_url,
      rating: contact.rating,
      reviews_count: contact.reviews_count,
      city: contact.city,
      uf: contact.uf,
      ...(dadosCnpj || {}),
    };

    const diag = diagnoseLead(leadMock, perfil);
    const oldScore = deal.points || 0;
    const newScore = diag.priority_score;

    if (dadosCnpj) {
      comCnpjNovos++;
      if (dadosCnpj.porte === "ME") meCount++;
      if (dadosCnpj.porte === "EPP" || dadosCnpj.porte === "DEMAIS") eppCount++;
      if (dadosCnpj.porte === "MEI") meiCount++;
      if (dadosCnpj.situacao_cadastral !== "ATIVA") inativas++;
    }

    console.log(
      `${dadosCnpj ? `CNPJ: ${dadosCnpj.porte}` : "Sem CNPJ"} | Score: ${oldScore} -> ${newScore} ${diag.excluded ? "[INATIVA/EXCLUIDA]" : ""}`,
    );

    atualizados.push({ contact, deal, dadosCnpj, diag, newScore });
  }

  console.log(`\n=== RESUMO DA ANÁLISE DA BASE EXISTENTE ===`);
  console.log(`Leads analisados: ${alvos.length}`);
  console.log(`Enriquecidos com CNPJ: ${comCnpjNovos}/${alvos.length}`);
  console.log(`Porte: ME=${meCount} | EPP/Demais=${eppCount} | MEI=${meiCount}`);
  console.log(`Inativas/Inaptas (Sugerido descartar): ${inativas}`);

  if (!GO) {
    console.log("\nModo dry-run finalizado. Nenhuma alteração foi salva no banco.");
    console.log("Para atualizar os CNPJs e recalcular as notas dos leads atuais no CRM, rode:");
    console.log("node scripts/enrich-existing-crm-leads.mjs --go");
    return;
  }

  console.log("\nSalvando novos scores e CNPJs no Supabase...");
  let salvas = 0;
  for (const { contact, deal, dadosCnpj, diag, newScore } of atualizados) {
    const payloadContact = {
      last_scraped_at: new Date().toISOString(),
      ...(dadosCnpj
        ? {
            cnpj: dadosCnpj.cnpj,
            capital_social: dadosCnpj.capital_social,
            porte: dadosCnpj.porte,
            situacao_cadastral: dadosCnpj.situacao_cadastral,
            cnae_principal: dadosCnpj.cnae_principal,
            cnae_descricao: dadosCnpj.cnae_descricao,
            receita_phones: dadosCnpj.receita_phones,
          }
        : {}),
    };

    const payloadDeal = {
      points: newScore,
      last_scraped_at: new Date().toISOString(),
      ...(dadosCnpj
        ? {
            cnpj: dadosCnpj.cnpj,
            capital_social: dadosCnpj.capital_social,
            porte: dadosCnpj.porte,
            situacao_cadastral: dadosCnpj.situacao_cadastral,
            cnae_principal: dadosCnae(dadosCnpj.cnae_principal),
            cnae_descricao: dadosCnpj.cnae_descricao,
          }
        : {}),
    };

    if (diag.excluded) {
      payloadDeal.stage = "lost";
      payloadDeal.status = "lost";
      payloadDeal.loss_reason_code = "no_fit";
      payloadDeal.loss_reason_note = "Empresa inativa/inapta na Receita Federal (filtro CNPJ)";
    }

    await crm(`contacts?id=eq.${contact.id}`, { method: "PATCH", body: JSON.stringify(payloadContact) });
    await crm(`deals?id=eq.${contact.id}`, { method: "PATCH", body: JSON.stringify(payloadDeal) });
    salvas++;
  }

  function dadosCnae(v) { return v ? String(v) : null; }

  console.log(`Concluído! ${salvas} leads atualizados no Supabase.`);
})();
