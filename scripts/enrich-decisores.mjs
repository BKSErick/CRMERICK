/**
 * enrich-decisores.mjs
 * Extrai o DECISOR (sócio-administrador), o e-mail cadastrado na Receita e os telefones
 * oficiais dos leads que já têm CNPJ no CRM, e classifica o setor pelo CNAE.
 *
 * Por que existe: o `cnpjEnrich.js` já consultava a Receita e jogava o QSA fora. A prospecção
 * falava com o telefone da recepção do Maps sem nunca saber o nome do dono. Este script
 * recupera isso da base que já está enriquecida, sem gastar consulta nova de descoberta.
 *
 * NÃO mexe em `contacts.phone` / `contacts.whatsapp` / `deals.whatsapp` de propósito.
 * Telefone canônico é assunto do `uazapi-check-numbers.mjs`, e escrever aqui recriaria o
 * problema de contato-sombra. Os números da Receita ficam em `receita_phones`, para o
 * check de WhatsApp rodar depois em cima deles.
 *
 * USO:
 *   node scripts/enrich-decisores.mjs                                  (dry-run, toda a base)
 *   node scripts/enrich-decisores.mjs --setor=saude,industria          (filtra por CNAE)
 *   node scripts/enrich-decisores.mjs --porte=DEMAIS,EPP --limit=50
 *   node scripts/enrich-decisores.mjs --go                             (grava no Supabase)
 *   node scripts/enrich-decisores.mjs --com-email --limit=30 --go      (busca e-mail, ~21s/CNPJ)
 *
 * --com-email cai na ReceitaWS (3 consultas/min no plano gratuito). Use SEMPRE com --limit
 * e de preferência já filtrado por setor/porte: 924 CNPJs a 21s levariam mais de 5 horas.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ingest = require(path.join(RAIZ, "scripts/lib/leadIngest.js"));
const cnpjEnrich = require(path.join(RAIZ, "scripts/lib/cnpjEnrich.js"));
const { setorDeCnae, subsegmentoDeCnae, filtroDeSetores, SETORES } = require(path.join(RAIZ, "scripts/lib/setoresCnae.js"));

function carregarEnv(arquivo, alvo = process.env, sobrescrever = false) {
  if (!fs.existsSync(arquivo)) return false;
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && (sobrescrever || !alvo[m[1]])) alvo[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return true;
}
carregarEnv(path.join(RAIZ, ".env"));

const arg = (nome) => process.argv.find((x) => x.startsWith(`--${nome}=`))?.split("=").slice(1).join("=") || "";
const GO = process.argv.includes("--go");
const COM_EMAIL = process.argv.includes("--com-email");
const SO_SEM_DECISOR = process.argv.includes("--so-sem-decisor");
const CIDADE = arg("cidade");
const SETOR = arg("setor");
const PORTE = arg("porte");
const LIMITE = Number(arg("limit") || 0);

const CRM_URL = process.env.SUPABASE_URL;
const CRM_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!CRM_URL || !CRM_KEY) {
  console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env do CRM.");
  process.exit(1);
}
const crm = ingest.crmClient(CRM_URL, CRM_KEY);

let passaSetor;
try {
  passaSetor = filtroDeSetores(SETOR);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const PORTES = PORTE.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean);

function semAcento(v) {
  return String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

(async () => {
  console.log(`Camada de decisor: lendo QSA, e-mail e telefones da Receita.`);
  console.log(`Modo: ${GO ? "GRAVA NO SUPABASE" : "dry-run"} | e-mail: ${COM_EMAIL ? "SIM (ReceitaWS, ~21s/CNPJ)" : "não"}`);
  if (SETOR) console.log(`Setor: ${SETOR}`);
  if (PORTES.length) console.log(`Porte: ${PORTES.join(", ")}`);
  console.log("");

  const [contatos, deals] = await Promise.all([
    ingest.buscarTudo(crm, "contacts?select=id,name,company,city,uf,cnpj,status,decisor_nome"),
    ingest.buscarTudo(crm, "deals?select=id,name,company,segment,stage,cnpj,decisor_nome,is_prospect"),
  ]);
  const dealsMap = new Map(deals.map((d) => [d.id, d]));

  let alvos = contatos.filter((c) => c.status !== "client" && c.status !== "lost");
  alvos = alvos.filter((c) => {
    const deal = dealsMap.get(c.id);
    return !deal || deal.is_prospect !== false; // conversa pessoal sincronizada não é lead
  });

  const semCnpj = alvos.filter((c) => !c.cnpj && !dealsMap.get(c.id)?.cnpj).length;
  alvos = alvos.filter((c) => c.cnpj || dealsMap.get(c.id)?.cnpj);

  if (CIDADE) {
    const cf = semAcento(CIDADE);
    alvos = alvos.filter((c) => semAcento(c.city).includes(cf));
  }
  if (SO_SEM_DECISOR) {
    alvos = alvos.filter((c) => !c.decisor_nome && !dealsMap.get(c.id)?.decisor_nome);
  }

  console.log(`Leads com CNPJ na fila: ${alvos.length} (sem CNPJ, ignorados: ${semCnpj})`);
  if (COM_EMAIL && !LIMITE) {
    const teto = Math.round((alvos.length * 21) / 60);
    console.log(`\nAVISO: --com-email sem --limit. Teto de ${alvos.length} leads = ate ~${teto} min,`);
    console.log(`mas a consulta de e-mail so roda em quem passa nos filtros de setor/porte.\n`);
  }

  const resultados = [];
  const total = LIMITE ? Math.min(LIMITE, alvos.length) : alvos.length;
  let gravados = 0;

  async function gravar({ contact, deal, dados, setor }) {
    const comum = {
      decisor_nome: dados.decisor_nome,
      decisor_qualificacao: dados.decisor_qualificacao,
      socios: dados.socios,
      email_receita: dados.email_receita,
      receita_phones: dados.receita_phones,
      last_scraped_at: new Date().toISOString(),
    };
    await crm(`contacts?id=eq.${contact.id}`, { method: "PATCH", body: JSON.stringify(comum) });
    if (deal.id !== undefined) {
      await crm(`deals?id=eq.${contact.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...comum, setor, porte: dados.porte }),
      });
    }
    gravados++;
  }

  for (let i = 0; i < alvos.length && resultados.length < (LIMITE || alvos.length); i++) {
    const contact = alvos[i];
    const deal = dealsMap.get(contact.id) || {};
    const cnpj = contact.cnpj || deal.cnpj;
    const nome = contact.company || contact.name || `#${contact.id}`;

    // Passo 1, barato: sem e-mail. Vem do cache em disco, entao e instantaneo depois do
    // primeiro run. Serve so para saber setor e porte.
    let dados = await cnpjEnrich.fetchCnpjMinhaReceita(cnpj);
    if (!dados) {
      console.log(`[${resultados.length + 1}/${total}] ${nome.slice(0, 32).padEnd(32)} SEM RETORNO da Receita`);
      continue;
    }

    const setor = setorDeCnae(dados.cnae_principal);
    if (!passaSetor(dados.cnae_principal)) continue;
    if (PORTES.length && !PORTES.includes(dados.porte)) continue;

    // Passo 2, caro (~21s na ReceitaWS): SO para quem passou nos filtros. Buscar antes de
    // filtrar fazia o run gastar 330 min nos 944 em vez de ~100 min nos 282 que interessam.
    if (COM_EMAIL && !dados.email_receita) {
      dados = (await cnpjEnrich.fetchCnpjMinhaReceita(cnpj, { comEmail: true })) || dados;
    }

    resultados.push({ contact, deal, dados, setor });
    // Grava JA, e nao no fim: com --com-email o run passa de 1h30 (ReceitaWS faz 3/min),
    // e acumular tudo para salvar no final significa perder o lote inteiro se o processo
    // morrer no meio. Assim o run e retomavel: o que ja gravou, gravou.
    if (GO) await gravar({ contact, deal, dados, setor });
    console.log(
      `[${resultados.length}/${total}] ${nome.slice(0, 32).padEnd(32)} ` +
        `${(setor || "-").padEnd(12)} ${dados.porte.padEnd(6)} ` +
        `dec: ${(dados.decisor_nome || "NAO ACHOU").slice(0, 28).padEnd(28)} ` +
        `${dados.email_receita || ""}`,
    );
  }

  const comDecisor = resultados.filter((r) => r.dados.decisor_nome).length;
  const comEmail = resultados.filter((r) => r.dados.email_receita).length;
  const comFone = resultados.filter((r) => r.dados.receita_phones.length > 0).length;
  const porSetor = {};
  for (const r of resultados) porSetor[r.setor || "sem setor"] = (porSetor[r.setor || "sem setor"] || 0) + 1;

  console.log(`\n=== RESUMO ===`);
  console.log(`Analisados (após filtros): ${resultados.length}`);
  console.log(`Com decisor identificado:  ${comDecisor} (${resultados.length ? Math.round((comDecisor / resultados.length) * 100) : 0}%)`);
  console.log(`Com e-mail da Receita:     ${comEmail}${COM_EMAIL ? "" : " (rode com --com-email para buscar)"}`);
  console.log(`Com telefone da Receita:   ${comFone}`);
  console.log(`Por setor: ${Object.entries(porSetor).map(([k, v]) => `${k}=${v}`).join(" | ") || "-"}`);
  console.log(`Setores válidos: ${Object.keys(SETORES).join(", ")}`);

  if (!GO) {
    console.log(`\nDry-run. Nada gravado. Para gravar: repita o comando com --go`);
    return;
  }
  console.log(`Gravados no Supabase durante o run: ${gravados}`);
  console.log(`Próximo passo para virar WhatsApp do dono: node scripts/uazapi-check-numbers.mjs`);
})();
