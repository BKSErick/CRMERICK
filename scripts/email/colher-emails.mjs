/**
 * colher-emails.mjs
 * Colhe e-mail de decisor/empresa para os leads do CRM que ainda nao tem um utilizavel,
 * valida ANTES de gravar e grava no Supabase (contacts.email, deals.email_receita,
 * decisor, CNPJ, porte, setor, cidade).
 *
 * Por que existe (18/09/2026): a fila fria zerou com 280 enviados e 4,2% de hard bounce.
 * O pull do Maps achava e-mail no site e o leadIngest jogava fora; o CNPJ so virava e-mail
 * pela ReceitaWS a 21s cada; e ninguem validava o endereco antes do Brevo (foram pro ar
 * "x@y.com.brmailto", "@www.dominio", "@gamil.com", nfe@, contador). Este script fecha os
 * quatro buracos de uma vez.
 *
 * FONTES, na ordem de custo:
 *   1. Site do lead: home + paginas de contato (mailto, texto, JSON-LD, Cloudflare cfemail).
 *      Gratis, e o endereco publicado hoje e mais fresco que o do cadastro do CNPJ.
 *   2. CNPJ -> OpenCNPJ (e-mail da Receita, QSA, CNAE, porte, cidade) em ~500ms.
 *      CNPJ vem do deal, do HTML do site, ou (--descobrir-cnpj) de uma busca no Serper.
 *   3. --receitaws liga o fallback lento (21s/CNPJ) so pra quem a OpenCNPJ nao tem e-mail.
 *
 * Cada candidato passa por validar-email.mjs (sintaxe, artefato, typo, caixa errada,
 * blocklist, MX, decisor/empresa/terceiro/incerto, score). So o APROVADO e gravado.
 * E-mail existente que reprova no validador conta como "sem e-mail" e o lead entra na
 * colheita; se a colheita achar um melhor, o velho vai pra notes e o novo pro campo.
 *
 * NAO mexe em contacts.phone/whatsapp nem em deals.setor quando ja preenchido
 * (enrich-decisores sobrescrevia setor com null; aqui setor so e gravado se estiver vazio).
 *
 * USO (rodar da RAIZ do CRM, por causa do .cache/):
 *   node scripts/email/colher-emails.mjs                            # dry-run, base viva sem e-mail
 *   node scripts/email/colher-emails.mjs --go                       # grava
 *   node scripts/email/colher-emails.mjs --cidade="Betim" --go
 *   node scripts/email/colher-emails.mjs --desde=2026-09-18 --go    # so leads criados a partir da data
 *   node scripts/email/colher-emails.mjs --ids=12,34,56 --go
 *   node scripts/email/colher-emails.mjs --descobrir-cnpj --max-serper=300 --go
 *   node scripts/email/colher-emails.mjs --receitaws --limit=100 --go
 *   node scripts/email/colher-emails.mjs --recolher --setor=industria   # tambem quem JA tem e-mail bom (procura um melhor)
 *
 * Saida: scripts/email/colheita/colheita-<data>.json (todos os pareceres, gitignorado) +
 * resumo no console. Dry-run nao grava nada no Supabase, mas usa e alimenta os caches.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { lerBlocklist } from "./blocklist.mjs";
import { escolherMelhor, indiceBlocklistPorDominio, normalizarEmail, salvarCacheMx, validarEmail } from "./validar-email.mjs";

const require = createRequire(import.meta.url);
const cnpjEnrich = require("../lib/cnpjEnrich.js");
const { fetchLeadHtml } = require("../lib/leadEnrich.js");
const { setorDeCnae } = require("../lib/setoresCnae.js");

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const GARIMPO = "D:/001Gravity/Garimpo SAAS NOVO";

if (path.resolve(process.cwd()) !== path.resolve(RAIZ)) {
  console.error(`Rode da raiz do CRM (${RAIZ}): os caches .cache/cnpj-json e .cache/lead-html sao relativos ao cwd.`);
  process.exit(1);
}

function carregarEnv(arquivo) {
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
carregarEnv(path.join(RAIZ, ".env"));
carregarEnv(path.join(GARIMPO, ".env.local"));

const arg = (n, d = "") => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const GO = process.argv.includes("--go");
const RECOLHER = process.argv.includes("--recolher");
const SEM_SITE = process.argv.includes("--sem-site");
const SEM_CNPJ = process.argv.includes("--sem-cnpj");
const DESCOBRIR = process.argv.includes("--descobrir-cnpj");
const RECEITAWS = process.argv.includes("--receitaws");
const CIDADE = arg("cidade");
const UF = arg("uf");
const DESDE = arg("desde");
const IDS = new Set(arg("ids").split(",").map(Number).filter(Boolean));
const SETORES = arg("setor").split(",").map((s) => s.trim()).filter(Boolean);
const LIMITE = Number(arg("limit") || 0);
const PARALELO = Number(arg("paralelo") || 6);
let orcamentoSerper = Number(arg("max-serper") || 200);

const URL_CRM = process.env.SUPABASE_URL;
const KEY_CRM = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_CRM || !KEY_CRM) {
  console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env do CRM.");
  process.exit(1);
}
const H = { apikey: KEY_CRM, Authorization: `Bearer ${KEY_CRM}`, "Content-Type": "application/json" };

async function todas(tabela, select, extra = "") {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${URL_CRM}/rest/v1/${tabela}?select=${select}${extra}&limit=1000&offset=${off}`, { headers: H });
    const linhas = await r.json();
    if (!Array.isArray(linhas)) throw new Error(`${tabela}: ${JSON.stringify(linhas).slice(0, 200)}`);
    out.push(...linhas);
    if (linhas.length < 1000) break;
  }
  return out;
}

async function patch(tabela, id, corpo) {
  const r = await fetch(`${URL_CRM}/rest/v1/${tabela}?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`${tabela}#${id}: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

// ---------------------------------------------------------------------------
// Serper /search (descoberta de CNPJ). Chaves do Garimpo, rotacao em falha.
// ---------------------------------------------------------------------------

const CHAVES = String(process.env.SERPER_API_KEYS || "").split(",").map((s) => s.trim()).filter(Boolean);
let chaveAtual = 0;
async function serperSearch(q) {
  for (let t = 0; t < CHAVES.length; t++) {
    const chave = CHAVES[(chaveAtual + t) % CHAVES.length];
    try {
      const r = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": chave, "Content-Type": "application/json" },
        body: JSON.stringify({ q, gl: "br", hl: "pt-br", num: 5 }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && !j.error && j.message !== "Unauthorized.") {
        chaveAtual = (chaveAtual + t) % CHAVES.length;
        return j;
      }
    } catch {
      /* tenta a proxima */
    }
  }
  return null;
}

const STOP = new Set(["ltda", "me", "epp", "eireli", "sa", "s/a", "cia", "de", "da", "do", "das", "dos", "e", "em", "com", "ind", "industria", "comercio", "servicos", "servico", "empresa"]);
const tokensNome = (s) =>
  String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !STOP.has(t));

async function descobrirCnpj(company, city) {
  if (!DESCOBRIR || orcamentoSerper <= 0 || !CHAVES.length) return null;
  orcamentoSerper--;
  const j = await serperSearch(`"${company}" ${city || ""} CNPJ`);
  if (!j) return null;
  const chaves = tokensNome(company);
  for (const item of j.organic || []) {
    const texto = `${item.title || ""} ${item.snippet || ""} ${item.link || ""}`;
    const bate = !chaves.length || chaves.some((t) => texto.toLowerCase().includes(t));
    if (!bate) continue;
    const cnpjs = cnpjEnrich.extractCnpjsFromText(texto);
    if (cnpjs.length) return cnpjs[0];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Site: home + paginas de contato, todos os e-mails
// ---------------------------------------------------------------------------

const RE_EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
const RE_OFUSCADO = /([a-z0-9._+-]{2,})\s*(?:\[\s*(?:at|arroba)\s*\]|\(\s*(?:at|arroba)\s*\)|\s+arroba\s+)\s*([a-z0-9-]+(?:\s*(?:\[\s*(?:dot|ponto)\s*\]|\(\s*(?:dot|ponto)\s*\)|\s+ponto\s+|\.)\s*[a-z0-9-]+)+)/gi;

function decodificarCfEmail(hex) {
  try {
    const k = parseInt(hex.slice(0, 2), 16);
    let s = "";
    for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k);
    return s;
  } catch {
    return null;
  }
}

function extrairEmails(html) {
  const achados = new Set();
  const add = (e) => {
    const n = normalizarEmail(e);
    if (n) achados.add(n);
  };
  for (const m of html.matchAll(/href\s*=\s*["']\s*mailto:([^"'?]+)/gi)) add(decodeURIComponent(m[1]));
  for (const m of html.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)) add(decodificarCfEmail(m[1]));
  for (const m of html.matchAll(/"email"\s*:\s*"([^"]+)"/gi)) add(m[1]);
  const texto = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  for (const m of texto.matchAll(RE_EMAIL)) add(m[0]);
  for (const m of texto.matchAll(RE_OFUSCADO)) add(`${m[1]}@${m[2].replace(/\s*(?:\[\s*(?:dot|ponto)\s*\]|\(\s*(?:dot|ponto)\s*\)|\s+ponto\s+)\s*/gi, ".")}`);
  return [...achados].slice(0, 15);
}

const RE_LINK_CONTATO = /contat|fale|contact|sobre|quem-?somos|empresa|about|atendimento/i;

function urlBase(site) {
  let s = String(site || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

async function rastrearSite(site) {
  const base = urlBase(site);
  if (!base) return { paginas: [], emails: [] };
  const paginas = [];
  const emails = [];
  const visitar = async (url) => {
    const html = await fetchLeadHtml(url, { timeoutMs: 8000 }).catch(() => null);
    if (!html) return;
    paginas.push({ url, html });
    for (const e of extrairEmails(html)) emails.push({ email: e, origem: "site", pagina: url });
  };
  await visitar(base.href);
  const home = paginas[0]?.html || "";
  const links = new Set();
  for (const m of home.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1];
    const rotulo = m[2].replace(/<[^>]+>/g, "");
    if (!RE_LINK_CONTATO.test(href) && !RE_LINK_CONTATO.test(rotulo)) continue;
    try {
      const u = new URL(href, base.href);
      if (u.host.replace(/^www\./, "") !== base.host.replace(/^www\./, "")) continue;
      if (/\.(pdf|jpg|png|zip|docx?)$/i.test(u.pathname)) continue;
      u.hash = "";
      if (u.href !== base.href) links.add(u.href);
    } catch {
      /* href invalido */
    }
    if (links.size >= 3) break;
  }
  for (const l of links) await visitar(l);
  if (!emails.length) {
    // Site sem link de contato na home (menu em JS): tenta os caminhos classicos.
    for (const p of ["/contato", "/contato/", "/fale-conosco", "/contact"]) {
      await visitar(new URL(p, base.href).href);
      if (emails.length) break;
    }
  }
  return { paginas, emails };
}

// ---------------------------------------------------------------------------
// Setor quando o CNAE nao decide
// ---------------------------------------------------------------------------

const SEGMENTO_PARA_SETOR = { usinagem: "industria", caldeiraria: "industria", manutencao: "industria", automacao: "industria", climatizacao: "climatizacao" };
const RE_INDUSTRIA = /usinagem|torn[eo]|caldeirari|metal[uú]rgic|serralheri|solda|estampari|fundi[cç]|ferramentari|industrial|ind[uú]stria|automa[cç]|el[eé]trica industrial|manuten[cç][aã]o industrial|m[aá]quinas|equipamentos|hidr[aá]ulic|pneum[aá]tic|corte a laser|jateament|pintura industrial/i;
const RE_CONSTRUCAO = /construtora|constru[cç][aã]o civil|engenharia civil|empreiteira|edifica[cç]|obras|terraplen|pavimenta/i;
// Engenharia sem qualificador (projetos, agrimensura, consultoria) cai em construcao, como
// o tier B "ecossistema industrial" da base ICP de Monlevade. Agro fica sem setor de
// proposito: a copy nao tem vocabulario pra isso.
const RE_ENGENHARIA = /engenharia|agrimensura|topografia|projetos industriais/i;

// Deixados SEM setor de proposito na triagem manual de 11 e 15/09/2026 (fora do ICP:
// arco e flecha, loja afiliada, placeholder, oficina, autonomo). Etiquetar por palavra
// desfaria a decisao e eles voltariam pra fila.
const NUNCA_ETIQUETAR = new Set([90, 216, 313, 1082, 608, 314, 68, 115, 113]);

function setorPorPalavra(deal) {
  if (NUNCA_ETIQUETAR.has(deal.id)) return null;
  const seg = String(deal.segment || "").toLowerCase().trim();
  if (SEGMENTO_PARA_SETOR[seg]) return SEGMENTO_PARA_SETOR[seg];
  const nome = `${deal.company || ""} ${deal.segment || ""}`;
  if (RE_CONSTRUCAO.test(nome)) return "construcao";
  if (RE_INDUSTRIA.test(nome)) return "industria";
  if (RE_ENGENHARIA.test(nome)) return "construcao";
  return null;
}

const titulo = (s) => String(s || "").toLowerCase().replace(/(^|\s)([a-zà-ú])/g, (m) => m.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());

// ---------------------------------------------------------------------------
// Selecao
// ---------------------------------------------------------------------------

const blocklist = lerBlocklist();
const indiceDominios = indiceBlocklistPorDominio(blocklist);
const lixo = (e) => {
  const v = String(e || "").trim().toLowerCase();
  return !v.includes("@") || v.length < 6;
};

const [deals, contacts] = await Promise.all([
  todas("deals", "id,contact_id,company,stage,setor,segment,porte,cnpj,decisor_nome,email_receita,site_url,is_prospect,cnae_principal,created_at,blocker,loss_reason_code"),
  todas("contacts", "id,name,company,email,email_receita,city,uf,cnpj,status,decisor_nome,site_url,notes,created_at,source"),
]);
const contatoPorId = new Map(contacts.map((c) => [c.id, c]));

// Mesma regra do build-queue-institucional: lost SO por falta de WhatsApp (triagem do
// pull-city-serper) e publico de e-mail, nao descarte. Recusa explicita segue lost.
const LOST_SEM_WHATSAPP = !process.argv.includes("--sem-lost-whatsapp");
const lostSoPorCanal = (d) => d.stage === "lost" && ["sem_whatsapp", "sem_telefone"].includes(d.blocker) && !d.loss_reason_code;

let alvos = [];
let jaBons = 0;
let lostIncluidos = 0;
for (const d of deals) {
  if (d.is_prospect === false) continue;
  if (d.stage === "lost") {
    if (!(LOST_SEM_WHATSAPP && lostSoPorCanal(d))) continue;
    lostIncluidos++;
  }
  const c = contatoPorId.get(d.contact_id) || contatoPorId.get(d.id) || null;
  if (c && (c.status === "client" || c.status === "lost")) continue;
  if (!String(d.company || "").trim()) continue;
  if (IDS.size && !IDS.has(d.id)) continue;
  if (SETORES.length && !SETORES.includes(d.setor || "")) continue;
  if (CIDADE && String(c?.city || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() !== CIDADE.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()) continue;
  if (UF && String(c?.uf || "").toUpperCase() !== UF.toUpperCase()) continue;
  if (DESDE && String(c?.created_at || d.created_at || "").slice(0, 10) < DESDE) continue;
  alvos.push({ d, c });
}

// E-mail que ja existe e passa no validador = lead pronto, fica de fora (salvo --recolher).
const prontos = [];
const pendentes = [];
for (const a of alvos) {
  const existentes = [a.d.email_receita, a.c?.email].filter((e) => !lixo(e));
  let bom = null;
  for (const e of existentes) {
    const r = await validarEmail(e, { decisorNome: a.d.decisor_nome || a.c?.decisor_nome, empresa: a.d.company, siteUrl: a.d.site_url || a.c?.site_url, blocklist, indiceDominios });
    if (r.ok) { bom = r; break; }
  }
  a.emailAtual = bom;
  a.existentes = existentes;
  if (bom && !RECOLHER) { prontos.push(a); jaBons++; continue; }
  pendentes.push(a);
}
alvos = LIMITE ? pendentes.slice(0, LIMITE) : pendentes;

console.log(`Colheita de e-mails | modo: ${GO ? "GRAVA NO SUPABASE" : "dry-run"}`);
console.log(`Vivos: ${prontos.length + pendentes.length} (inclui ${lostIncluidos} lost so por falta de WhatsApp) | ja com e-mail aprovado: ${jaBons} | a colher: ${alvos.length}${LIMITE ? ` (limit ${LIMITE})` : ""}`);
console.log(`Fontes: site=${!SEM_SITE} cnpj=${!SEM_CNPJ} descobrir-cnpj=${DESCOBRIR ? `sim (orcamento ${orcamentoSerper} buscas, ${CHAVES.length} chaves)` : "nao"} receitaws=${RECEITAWS}\n`);

// ---------------------------------------------------------------------------
// Processamento
// ---------------------------------------------------------------------------

const resultados = [];
const contagem = { comEmailNovo: 0, semNada: 0, inativa: 0, soRejeitados: 0, cnpjNovo: 0, decisorNovo: 0, setorNovo: 0, cidadeNova: 0, erro: 0 };
const motivosRejeicao = {};
const porOrigem = { site: 0, receita: 0, crm: 0 };
let processados = 0;

async function processar({ d, c, existentes }) {
  const site = d.site_url || c?.site_url || null;
  const candidatos = [];
  let paginas = [];
  if (site && !SEM_SITE) {
    const r = await rastrearSite(site);
    paginas = r.paginas;
    candidatos.push(...r.emails);
  }

  let cnpj = cnpjEnrich.validarCnpj(d.cnpj) ? d.cnpj : cnpjEnrich.validarCnpj(c?.cnpj) ? c.cnpj : null;
  let cnpjOrigem = cnpj ? "crm" : null;
  if (!cnpj && paginas.length) {
    const achados = cnpjEnrich.extractCnpjsFromText(paginas.map((p) => p.html).join("\n"));
    if (achados.length) { cnpj = achados[0]; cnpjOrigem = "site"; }
  }
  // Busca no Google so pra quem vai entrar na fila (industria/construcao): agro e sem setor
  // nao passam no filtro do build, entao gastar credito neles e jogar fora.
  const setorPrevisto = d.setor || setorPorPalavra(d);
  if (!cnpj && ["industria", "construcao"].includes(setorPrevisto)) {
    const desc = await descobrirCnpj(d.company, c?.city);
    if (desc) { cnpj = desc; cnpjOrigem = "serper"; }
  }

  let dados = null;
  if (cnpj && !SEM_CNPJ) {
    dados = await cnpjEnrich.fetchCnpjMinhaReceita(cnpj, { comEmail: true, receitaWs: RECEITAWS, timeoutMs: 8000 });
    if (dados?.email_receita) candidatos.push({ email: dados.email_receita, origem: "receita" });
  }
  // E-mail ja gravado tambem concorre (pode ter sido rejeitado so por typo corrigivel).
  for (const e of existentes) candidatos.push({ email: e, origem: "crm" });

  const decisorNome = d.decisor_nome || c?.decisor_nome || dados?.decisor_nome || null;
  const { melhor, aprovados, pareceres } = await escolherMelhor(candidatos, { decisorNome, empresa: d.company, siteUrl: site, blocklist, indiceDominios });

  let inativa = dados && dados.situacao_cadastral && dados.situacao_cadastral !== "ATIVA";
  // CNPJ que NAO veio do CRM e esta inativo tem cheiro de homonimo (busca no Google achou
  // outra empresa com o mesmo nome). Nao grava nada da Receita nesse caso, so registra.
  if (inativa && cnpjOrigem !== "crm") {
    dados = null;
    cnpj = null;
  }
  const setorCnae = NUNCA_ETIQUETAR.has(d.id) ? null : setorDeCnae(dados?.cnae_principal || d.cnae_principal || "");
  const setorNovo = d.setor ? null : setorCnae || setorPorPalavra(d);

  const linha = {
    dealId: d.id,
    contactId: c?.id ?? null,
    company: d.company,
    cidade: c?.city || dados?.municipio || null,
    uf: c?.uf || dados?.uf || null,
    setor: d.setor || setorNovo || null,
    setorNovo,
    cnpj: cnpj ? cnpjEnrich.formatarCnpj(cnpj) : null,
    cnpjOrigem: cnpj ? cnpjOrigem : inativa ? `${cnpjOrigem} (inativa, descartado)` : null,
    situacao: dados?.situacao_cadastral || (inativa ? "INATIVA" : null),
    porte: d.porte || dados?.porte || null,
    decisor: decisorNome,
    site,
    paginasLidas: paginas.map((p) => p.url),
    melhor: melhor ? { email: melhor.email, origem: melhor.origem, classe: melhor.classe, score: melhor.score, motivo: melhor.motivo, corrigido: melhor.corrigido || false } : null,
    aprovados: aprovados.map((a) => ({ email: a.email, origem: a.origem, score: a.score, classe: a.classe })),
    rejeitados: pareceres.filter((p) => !p.ok).map((p) => ({ email: p.email || p.bruto, origem: p.origem, classe: p.classe, motivo: p.motivo })),
    inativa: Boolean(inativa),
  };

  if (inativa) contagem.inativa++;
  else if (melhor) { contagem.comEmailNovo++; porOrigem[melhor.origem] = (porOrigem[melhor.origem] || 0) + 1; }
  else if (pareceres.length) contagem.soRejeitados++;
  else contagem.semNada++;
  for (const r of linha.rejeitados) motivosRejeicao[r.classe] = (motivosRejeicao[r.classe] || 0) + 1;

  // --- gravacao ---
  const patchDeal = {};
  const patchContato = {};
  if (!inativa && melhor) {
    const doReceita = aprovados.find((a) => a.origem === "receita");
    if (doReceita && lixo(d.email_receita)) patchDeal.email_receita = doReceita.email;
    if (doReceita && c && lixo(c.email_receita)) patchContato.email_receita = doReceita.email;
    // contacts.email guarda o MELHOR. Se ja havia um e ele reprovou, vai pras notes.
    if (c) {
      const atual = String(c.email || "").trim();
      const atualBom = atual && aprovados.some((a) => a.email === normalizarEmail(atual));
      if (!atual || lixo(atual)) patchContato.email = melhor.email;
      else if (!atualBom && melhor.email !== atual) {
        const parecer = pareceres.find((p) => normalizarEmail(p.bruto) === normalizarEmail(atual));
        patchContato.email = melhor.email;
        patchContato.notes = `${c.notes ? `${c.notes}\n` : ""}[colher-emails ${new Date().toISOString().slice(0, 10)}] e-mail anterior ${atual} descartado (${parecer?.classe || "reprovado"}: ${parecer?.motivo || ""}); novo ${melhor.email} (${melhor.origem}, ${melhor.motivo})`;
      } else if (atualBom && melhor.email !== normalizarEmail(atual) && melhor.score >= 90 && RECOLHER) {
        patchContato.email = melhor.email;
        patchContato.notes = `${c.notes ? `${c.notes}\n` : ""}[colher-emails ${new Date().toISOString().slice(0, 10)}] e-mail anterior ${atual} substituido por ${melhor.email} (${melhor.origem}, ${melhor.motivo}, score ${melhor.score})`;
      }
    }
  }
  if (cnpj && !cnpjEnrich.validarCnpj(d.cnpj)) { patchDeal.cnpj = cnpjEnrich.formatarCnpj(cnpj); contagem.cnpjNovo++; }
  if (cnpj && c && !cnpjEnrich.validarCnpj(c.cnpj)) patchContato.cnpj = cnpjEnrich.formatarCnpj(cnpj);
  if (dados) {
    if (!d.decisor_nome && dados.decisor_nome) { patchDeal.decisor_nome = dados.decisor_nome; patchDeal.decisor_qualificacao = dados.decisor_qualificacao; patchDeal.socios = dados.socios; contagem.decisorNovo++; }
    if (c && !c.decisor_nome && dados.decisor_nome) { patchContato.decisor_nome = dados.decisor_nome; patchContato.decisor_qualificacao = dados.decisor_qualificacao; patchContato.socios = dados.socios; }
    if (!d.porte && dados.porte) patchDeal.porte = dados.porte;
    if (dados.situacao_cadastral) patchDeal.situacao_cadastral = dados.situacao_cadastral;
    if (!d.cnae_principal && dados.cnae_principal) { patchDeal.cnae_principal = dados.cnae_principal; patchDeal.cnae_descricao = dados.cnae_descricao; }
    if (c && !c.city && dados.municipio) { patchContato.city = titulo(dados.municipio); patchContato.uf = dados.uf; contagem.cidadeNova++; }
  }
  if (setorNovo) { patchDeal.setor = setorNovo; contagem.setorNovo++; }
  if (Object.keys(patchDeal).length) patchDeal.last_scraped_at = new Date().toISOString();

  linha.patchDeal = patchDeal;
  linha.patchContato = patchContato;
  if (GO) {
    try {
      if (Object.keys(patchDeal).length) await patch("deals", d.id, patchDeal);
      if (c && Object.keys(patchContato).length) await patch("contacts", c.id, patchContato);
      linha.gravado = true;
    } catch (e) {
      linha.gravado = false;
      linha.erro = e.message;
      contagem.erro++;
    }
  }
  resultados.push(linha);
  processados++;
  if (processados % 25 === 0 || processados === alvos.length) {
    process.stdout.write(`  ${processados}/${alvos.length} | com e-mail: ${contagem.comEmailNovo} | inativa: ${contagem.inativa} | so rejeitados: ${contagem.soRejeitados} | sem nada: ${contagem.semNada}${DESCOBRIR ? ` | serper restante: ${orcamentoSerper}` : ""}\n`);
  }
}

// Pool simples: PARALELO leads ao mesmo tempo.
let cursor = 0;
async function trabalhador() {
  while (cursor < alvos.length) {
    const a = alvos[cursor++];
    try {
      await processar(a);
    } catch (e) {
      contagem.erro++;
      resultados.push({ dealId: a.d.id, company: a.d.company, erro: e.message });
    }
  }
}
await Promise.all(Array.from({ length: Math.min(PARALELO, alvos.length) }, trabalhador));
salvarCacheMx();

// ---------------------------------------------------------------------------
// Saida
// ---------------------------------------------------------------------------

const dir = path.join(AQUI, "colheita");
fs.mkdirSync(dir, { recursive: true });
const carimbo = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const arquivo = path.join(dir, `colheita-${carimbo}${GO ? "" : "-dry"}.json`);
fs.writeFileSync(arquivo, JSON.stringify({ geradoEm: new Date().toISOString(), go: GO, flags: process.argv.slice(2), contagem, motivosRejeicao, porOrigem, resultados }, null, 1), "utf8");

console.log(`\n== Resultado (${alvos.length} leads) ==`);
console.log(`Com e-mail aprovado: ${contagem.comEmailNovo} (site ${porOrigem.site || 0} | receita ${porOrigem.receita || 0} | ja estava no CRM ${porOrigem.crm || 0})`);
console.log(`Inativa na Receita: ${contagem.inativa} | so candidatos rejeitados: ${contagem.soRejeitados} | sem candidato nenhum: ${contagem.semNada} | erro: ${contagem.erro}`);
console.log(`Tambem preenchido: cnpj ${contagem.cnpjNovo} | decisor ${contagem.decisorNovo} | setor ${contagem.setorNovo} | cidade ${contagem.cidadeNova}`);
console.log(`Rejeicoes por classe: ${Object.entries(motivosRejeicao).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" ") || "-"}`);
const semSetor = resultados.filter((r) => r.melhor && !r.setor).length;
if (semSetor) console.log(`⚠ ${semSetor} com e-mail mas SEM setor: nao entram no build (filtra setor=in.(...)). Etiquetar na mao ou por CNAE.`);
const classes = resultados.filter((r) => r.melhor).reduce((m, r) => ((m[r.melhor.classe] = (m[r.melhor.classe] || 0) + 1), m), {});
console.log(`Classe do melhor: ${Object.entries(classes).map(([k, v]) => `${k}=${v}`).join(" | ") || "-"}`);
console.log(`Arquivo: ${arquivo}`);

const amostra = resultados.filter((r) => r.melhor && !r.inativa).sort((a, b) => b.melhor.score - a.melhor.score);
const inativas = resultados.filter((r) => r.inativa);
if (inativas.length) {
  console.log(`\nInativas na Receita (${inativas.length}, nada gravado de e-mail):`);
  for (const r of inativas.slice(0, 10)) console.log(`   #${r.dealId} ${String(r.company).slice(0, 40)} ${r.cnpj || ""} ${r.situacao || ""} ${r.melhor ? `(tinha ${r.melhor.email})` : ""}`);
}
if (amostra.length) {
  console.log(`\nTop ${Math.min(15, amostra.length)}:`);
  for (const r of amostra.slice(0, 15)) console.log(`  ${String(r.melhor.score).padStart(3)} #${String(r.dealId).padEnd(5)} ${String(r.company).slice(0, 34).padEnd(34)} ${r.melhor.email.padEnd(42)} ${r.melhor.origem.padEnd(7)} ${r.setor || "-"}`);
  const fracos = amostra.filter((r) => r.melhor.score < 55);
  if (fracos.length) {
    console.log(`\nMais fracos (score < 55, ${fracos.length}):`);
    for (const r of fracos.slice(0, 10)) console.log(`   ${String(r.melhor.score).padStart(3)} #${String(r.dealId).padEnd(5)} ${String(r.company).slice(0, 34).padEnd(34)} ${r.melhor.email.padEnd(42)} ${r.melhor.motivo}`);
  }
  const corrigidos = amostra.filter((r) => r.melhor.corrigido);
  if (corrigidos.length) {
    console.log(`\nTypo de dominio corrigido (${corrigidos.length}), conferir:`);
    for (const r of corrigidos) console.log(`   #${r.dealId} ${r.company}: ${r.melhor.email}`);
  }
}
if (!GO) console.log(`\nDry-run: nada gravado no Supabase. Rode com --go para gravar.`);
