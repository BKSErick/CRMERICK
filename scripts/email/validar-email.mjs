/**
 * validar-email.mjs
 * Pre-qualificacao de e-mail ANTES de entrar na fila do Brevo.
 *
 * Nasceu da leitura dos 280 disparos de 08-18/09/2026: 11 hard bounces (4,2%) + 12 soft,
 * e cada um tinha um motivo que dava pra pegar ANTES de mandar:
 *   - steelmanufacture.com.brmailto  -> artefato do extrator (dois "mailto:" colados no HTML)
 *   - www.inoxmaia.com.br            -> "www." no dominio do e-mail
 *   - @gamil.com (Strey)             -> typo de dominio; gamil.com TEM MX, entao o checador de
 *                                       MX deixou passar. So lista de typo pega.
 *   - vanmar.usinagem@yahoo.com.br, metalurgicasolinox@hotmail.com -> freemail abandonado
 *   - nfe@kaldecind.com, rh@         -> caixa de departamento errado (ninguem le)
 *   - guiafixbr@gmail.com (MKM)      -> e-mail de quem ABRIU o CNPJ (despachante), nao do dono
 *   - Cafe Monlevade (soft)          -> fora do ICP; aqui nao e problema do e-mail
 *
 * SMTP nao e possivel desta maquina (porta 25 fechada), entao o validador e heuristico:
 * sintaxe -> artefato -> placeholder -> typo -> caixa errada -> blocklist -> MX -> qualificar
 * (decisor/empresa/terceiro/incerto) -> score 0-100 pra ordenar a fila.
 *
 * Modulo (import) e CLI:
 *   node validar-email.mjs contato@empresa.com.br
 *   node validar-email.mjs --fila            # valida o email_queue.json atual e lista quem cairia
 *   node validar-email.mjs --fila --go       # e grava os motivos permanentes na blocklist
 */

import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import { fileURLToPath } from "node:url";
import { qualificar } from "./qualificar-destinatario.mjs";
import { lerBlocklist, salvarBlocklist, bloquear, estaBloqueado } from "./blocklist.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const CACHE_MX = path.join(RAIZ, ".cache", "mx-dominios.json");
const CACHE_MX_TTL_DIAS = 30;

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------

export const FREEMAIL = new Set([
  "gmail.com", "hotmail.com", "hotmail.com.br", "outlook.com", "outlook.com.br", "live.com",
  "yahoo.com", "yahoo.com.br", "icloud.com", "me.com", "aol.com", "msn.com", "bol.com.br",
  "uol.com.br", "terra.com.br", "ig.com.br", "globo.com", "globomail.com", "zipmail.com.br",
  "r7.com", "oi.com.br", "protonmail.com", "proton.me",
]);

// Freemail que a operacao ja viu morto: caixa criada nos anos 2000 e abandonada. Nao barra
// (a Lorentech vive no hotmail), mas cai no score.
const FREEMAIL_VELHO = new Set(["yahoo.com.br", "yahoo.com", "bol.com.br", "ig.com.br", "terra.com.br", "uol.com.br", "msn.com", "zipmail.com.br", "globo.com", "oi.com.br", "r7.com"]);

// Typo de dominio -> correcao. So entra o que e inequivoco; "bol.com" e "terra.com" existem
// como sites mas NAO recebem e-mail de pessoa (a caixa e .com.br).
export const TYPO_DOMINIO = new Map([
  ["gamil.com", "gmail.com"], ["gmial.com", "gmail.com"], ["gmai.com", "gmail.com"], ["gmal.com", "gmail.com"],
  ["gmail.co", "gmail.com"], ["gmail.con", "gmail.com"], ["gmaill.com", "gmail.com"], ["gmail.com.br", "gmail.com"],
  ["gmail.cm", "gmail.com"], ["gnail.com", "gmail.com"], ["gimail.com", "gmail.com"], ["gmail.om", "gmail.com"],
  ["hotmial.com", "hotmail.com"], ["hotmal.com", "hotmail.com"], ["hotmai.com", "hotmail.com"], ["hotmail.co", "hotmail.com"],
  ["hotmail.con", "hotmail.com"], ["homail.com", "hotmail.com"], ["hotmaill.com", "hotmail.com"], ["hotimail.com", "hotmail.com"],
  ["outlok.com", "outlook.com"], ["outllok.com", "outlook.com"], ["outlook.con", "outlook.com"], ["outloock.com", "outlook.com"],
  ["yaho.com", "yahoo.com"], ["yahoo.con", "yahoo.com"], ["yahooo.com", "yahoo.com"], ["yahoo.com.b", "yahoo.com.br"],
  ["bol.com", "bol.com.br"], ["terra.com", "terra.com.br"], ["ig.com", "ig.com.br"], ["uol.com", "uol.com.br"],
]);

// Caixa que existe mas ninguem que decide le: NF-e, RH, curriculo, no-reply, robos.
// "financeiro@"/"controladoria@"/"compras@" ficam (regra do Erick, 14/09/2026: em empresa
// pequena e o dono que abre), so perdem ponto.
// Prefixo (sem $) onde o inicio ja entrega o departamento: "nfeletronica@" passou em 18/09
// porque a regra exigia "nfe" exato.
export const CAIXA_ERRADA = [
  /^nfs?-?e/, /^nf\d*$/, /^danfe/, /^xml/, /^notas?(fiscais)?$/, /^notafiscal/, /^faturamento/, /^fatura/,
  /^fiscal/, /^contab/, /^cobranca/, /^boleto/,
  /^rh$/, /^rh[-_.]/, /^recursos?humanos/, /^curricul/, /^cv$/, /^vagas?$/, /^trabalheconosco/, /^dp$/, /^pessoal$/, /^selecao/, /^recrutamento/,
  /^sac$/, /^ouvidoria/, /^lgpd/, /^dpo$/, /^privacidade/, /^juridico/, /^licitac/,
  /^no-?reply/, /^no_reply/, /^nao-?respond/, /^naoresponda/, /^donotreply/, /^postmaster/, /^webmaster/, /^hostmaster/,
  /^abuse/, /^mailer-?daemon/, /^bounce/, /^newsletter/, /^unsubscribe/,
  /^ti$/, /^suporte(ti)?$/, /^helpdesk/, /^sistemas$/, /^informatica$/,
  /^sesmt/, /^seguranca$/, /^almoxarifado/, /^expedicao/, /^portaria$/,
];

// Caixa institucional que serve (dominio proprio). Extende o GENERICO_EMPRESA do qualificar.
export const CAIXA_INSTITUCIONAL = /^(contato|contatos|comercial|atendimento|vendas|venda|adm|administracao|administrativo|faleconosco|fale-?conosco|secretaria|info|informacoes|geral|escritorio|empresa|diretoria|gerencia|marketing|financeiro|controladoria|compras|orcamento|orcamentos|engenharia|producao|projetos|servicos|assistencia|clinica|contact|sales|office|mail|email)$/;

// Caixa que serve mas nao e o dono e nao e o comercial: perde ponto.
const CAIXA_FRACA = /^(financeiro|controladoria|compras|producao|projetos|engenharia|marketing|assistencia|servicos|recepcao|secretaria)$/;

// Plataforma onde o lead so tem PERFIL: e-mail nesse dominio e da plataforma, nao da empresa
// (press@linktr.ee passou como "dominio da empresa" em 18/09 porque o site_url era um
// Linktree). Tambem anula o site_url pra regra de dominio proprio.
export const DOMINIO_PLATAFORMA = new Set([
  "linktr.ee", "linktree.com", "instagram.com", "facebook.com", "fb.com", "m.me", "wa.me", "whatsapp.com", "api.whatsapp.com",
  "google.com", "business.site", "sites.google.com", "youtube.com", "twitter.com", "x.com", "tiktok.com", "linkedin.com",
  "wix.com", "wixsite.com", "wixstatic.com", "wordpress.com", "blogspot.com", "godaddy.com", "hostinger.com", "hostgator.com.br",
  "localo.site", "bit.ly", "linkin.bio", "beacons.ai", "taplink.cc", "shopify.com", "lojaintegrada.com.br", "mercadolivre.com.br",
  "vercel.app", "netlify.app", "github.io", "webnode.com", "webnode.page", "site123.me", "negocio.site",
  "jusbrasil.com.br", "econodata.com.br", "cnpj.biz", "casadosdados.com.br", "solutudo.com.br", "apontador.com.br",
  "guiamais.com.br", "telelistas.net", "kekanto.com.br", "hotfrog.com.br", "cylex.com.br", "empresasdobrasil.com",
  "ifood.com.br", "olx.com.br", "getninjas.com.br", "habitissimo.com.br",
]);

function hostDe(url) {
  const m = String(url || "").match(/^(?:https?:\/\/)?(?:www\.)?([^/:?#]+)/i);
  return m ? m[1].toLowerCase() : "";
}
export function ehPlataforma(dominioOuUrl) {
  const h = hostDe(dominioOuUrl);
  if (!h) return false;
  return [...DOMINIO_PLATAFORMA].some((p) => h === p || h.endsWith(`.${p}`));
}

const PLACEHOLDER = [
  /^(seuemail|seu-email|seu_email|email|e-mail|exemplo|example|nome|seunome|contact|teste|test|user|usuario|admin|nome\.sobrenome|fulano|joao\.silva)@/,
  /@(mysite|example|dominio|seusite|seudominio|dominio\.com|email\.com|site\.com|empresa\.com|yourdomain|domain|sentry|wixpress|godaddy|localhost|2x|3x)(\.|$)/,
  /@.*\.(png|jpe?g|gif|webp|svg|css|js|woff2?)$/,
  /@[\d.]+$/, // "user@2.0.1"
  /^[a-f0-9]{16,}@/, // hash de tracking
  /@(sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|w3\.org|schema\.org|googlegroups\.com|github\.com)$/,
];

// TLDs que a base ja viu. Usado so pra rejeitar lixo tipo ".brmailto" e ".comwww".
const TLD_OK = /^(br|com|net|org|io|co|app|eng|ind|adv|arq|art|eco|emp|inf|srv|tec|info|biz|me|pt|us|uk|de|es|it|fr|ar|cl|mx|dev|site|online|store|shop|tech|digital|cloud|email|pro|vet|med|odo|psc|agr|bio|log|com\.br|net\.br|org\.br|ind\.br|eng\.br|adv\.br|arq\.br|art\.br|eco\.br|emp\.br|inf\.br|srv\.br|tec\.br|agr\.br|bio\.br|log\.br|vet\.br|med\.br|odo\.br|psc\.br|coop\.br|esp\.br|far\.br|imb\.br|jor\.br|ntr\.br|rec\.br|tur\.br|edu\.br|gov\.br|mus\.br|etc\.br|eti\.br|not\.br|ppg\.br|pro\.br|qsl\.br|slg\.br|tmp\.br|trd\.br|zlg\.br|wiki\.br|blog\.br|flog\.br|vlog\.br|nom\.br|cim\.br|cng\.br|cnt\.br|ecn\.br|fnd\.br|fot\.br|fst\.br|g12\.br|ggf\.br|lel\.br|mat\.br|ato\.br|bmd\.br|des\.br|det\.br|dpn\.br|enf\.br|fm\.br|fmh\.br|ggo\.br|tv\.br|radio\.br|taxi\.br|teo\.br|rio\.br|sp\.br|mg\.br)$/i;

// ---------------------------------------------------------------------------
// Normalizacao
// ---------------------------------------------------------------------------

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Limpa o que o extrator de HTML traz colado: "mailto:", "www." no dominio, um segundo
 * "mailto" grudado no TLD, entidades HTML, ofuscacao "(at)"/"[arroba]", pontuacao final.
 * Devolve null quando nao sobra nada com cara de e-mail.
 */
export function normalizarEmail(bruto) {
  let e = String(bruto || "").trim();
  if (!e) return null;
  e = e.replace(/&#64;|&commat;/gi, "@").replace(/&#46;|&period;/gi, ".").replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ");
  e = e.replace(/^\s*mailto:\s*/i, "");
  e = e.replace(/\s*[\[(]\s*(at|arroba)\s*[\])]\s*/gi, "@").replace(/\s+arroba\s+/gi, "@");
  e = e.replace(/\s*[\[(]\s*(dot|ponto)\s*[\])]\s*/gi, ".").replace(/\s+ponto\s+/gi, ".");
  e = e.split("?")[0]; // mailto:x@y.com?subject=
  e = e.replace(/\s+/g, "");
  e = semAcento(e).toLowerCase();
  // "x@y.com.brmailto:z@..." e "x@y.com.brwww" - corta no primeiro lixo depois do TLD
  e = e.replace(/(\.[a-z]{2,6})(mailto|www|http|tel|https?|\/|\\|\||;|,|"|'|<|>|\)|\(|\]|\[).*$/i, "$1");
  e = e.replace(/[.,;:!?"'<>)\]}]+$/g, "");
  e = e.replace(/^[.,;:!?"'<>(\[{]+/g, "");
  if (!e.includes("@")) return null;
  let [local, dominio] = e.split("@");
  if (!local || !dominio || e.split("@").length !== 2) return null;
  dominio = dominio.replace(/^www\d*\./, "").replace(/\.+$/, "").replace(/\.{2,}/g, ".");
  local = local.replace(/^\.+|\.+$/g, "");
  if (!local || !dominio) return null;
  return `${local}@${dominio}`;
}

export function validarSintaxe(email) {
  const e = String(email || "");
  if (e.length < 6 || e.length > 254) return { ok: false, motivo: "tamanho" };
  const m = e.match(/^([a-z0-9!#$%&'*+/=?^_`{|}~.-]+)@([a-z0-9.-]+)$/i);
  if (!m) return { ok: false, motivo: "caractere invalido" };
  const [, local, dominio] = m;
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return { ok: false, motivo: "parte local invalida" };
  const labels = dominio.split(".");
  if (labels.length < 2) return { ok: false, motivo: "dominio sem TLD" };
  if (labels.some((l) => !l || l.length > 63 || l.startsWith("-") || l.endsWith("-"))) return { ok: false, motivo: "label de dominio invalido" };
  const tld = labels.slice(-2).join(".").endsWith(".br") ? labels.slice(-2).join(".") : labels[labels.length - 1];
  if (!/^[a-z]{2,}(\.[a-z]{2,})?$/i.test(tld)) return { ok: false, motivo: `TLD invalido "${tld}"` };
  if (!TLD_OK.test(tld) && !/^[a-z]{2,6}$/i.test(labels[labels.length - 1])) return { ok: false, motivo: `TLD estranho "${tld}"` };
  if (/\d{5,}/.test(dominio.split(".")[0]) && !FREEMAIL.has(dominio)) return { ok: false, motivo: "dominio numerico" };
  return { ok: true };
}

export function ehPlaceholder(email) {
  return PLACEHOLDER.some((re) => re.test(email));
}

export function classificarCaixa(local) {
  const l = semAcento(local).toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (CAIXA_ERRADA.some((re) => re.test(l))) return "errada";
  if (CAIXA_INSTITUCIONAL.test(l)) return "institucional";
  return "nominal";
}

// ---------------------------------------------------------------------------
// MX (com cache em disco: 30 dias)
// ---------------------------------------------------------------------------

let cacheMx = null;
function lerCacheMx() {
  if (cacheMx) return cacheMx;
  try {
    cacheMx = JSON.parse(fs.readFileSync(CACHE_MX, "utf8"));
  } catch {
    cacheMx = {};
  }
  return cacheMx;
}
export function salvarCacheMx() {
  if (!cacheMx) return;
  try {
    fs.mkdirSync(path.dirname(CACHE_MX), { recursive: true });
    fs.writeFileSync(CACHE_MX, JSON.stringify(cacheMx), "utf8");
  } catch {
    /* cache opcional */
  }
}

/**
 * MX do dominio. "so_a" = sem MX mas com A (alguns dominios pequenos recebem pelo A; e mais
 * fraco e cai no score). Null MX (RFC 7505, exchange "." prioridade 0) = dominio declara que
 * NAO recebe e-mail.
 */
export async function checarMx(dominio) {
  const d = String(dominio || "").toLowerCase();
  if (!d) return { ok: false, motivo: "sem dominio", tipo: "vazio" };
  if (FREEMAIL.has(d)) return { ok: true, tipo: "freemail" };
  const cache = lerCacheMx();
  const hit = cache[d];
  if (hit && Date.now() - hit.em < CACHE_MX_TTL_DIAS * 86400000) return hit.r;

  let r;
  try {
    const mx = await dns.resolveMx(d);
    if (mx.length === 1 && mx[0].exchange === "" && mx[0].priority === 0) r = { ok: false, motivo: "null MX (dominio nao recebe e-mail)", tipo: "null_mx" };
    else if (mx.length === 1 && /^\.?$/.test(mx[0].exchange)) r = { ok: false, motivo: "null MX (dominio nao recebe e-mail)", tipo: "null_mx" };
    else if (mx.length) r = { ok: true, tipo: "mx", mx: mx.map((x) => x.exchange).slice(0, 3) };
  } catch (e) {
    if (e && (e.code === "ETIMEOUT" || e.code === "ECONNREFUSED" || e.code === "ESERVFAIL")) {
      return { ok: true, tipo: "indeterminado", motivo: `DNS ${e.code}` }; // rede, nao dominio: nao cacheia, nao barra
    }
  }
  if (!r) {
    try {
      const a = await dns.resolve4(d);
      r = a.length ? { ok: true, tipo: "so_a" } : { ok: false, motivo: "sem MX e sem A", tipo: "sem_mx" };
    } catch {
      r = { ok: false, motivo: "sem MX e sem A", tipo: "sem_mx" };
    }
  }
  cache[d] = { em: Date.now(), r };
  return r;
}

// ---------------------------------------------------------------------------
// Blocklist por dominio
// ---------------------------------------------------------------------------

/** Motivos permanentes na blocklist agrupados por dominio (freemail fica de fora). */
export function indiceBlocklistPorDominio(blocklist) {
  const idx = new Map();
  for (const [email, reg] of Object.entries(blocklist || {})) {
    const dom = String(email).split("@")[1]?.toLowerCase();
    if (!dom || FREEMAIL.has(dom)) continue;
    if (!idx.has(dom)) idx.set(dom, []);
    idx.get(dom).push(reg?.motivo || "?");
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Validacao completa
// ---------------------------------------------------------------------------

/**
 * @param {string} bruto e-mail como veio (site, Receita, planilha)
 * @param {object} ctx { decisorNome, empresa, siteUrl, blocklist, indiceDominios, origem, semMx }
 * @returns {{ ok:boolean, email:string|null, classe:string, motivo:string, score:number, corrigido?:boolean, mx?:string }}
 *   classe: decisor | empresa | invalido | placeholder | typo | caixa_errada | bloqueado | sem_mx | terceiro | incerto
 */
export async function validarEmail(bruto, ctx = {}) {
  const email = normalizarEmail(bruto);
  if (!email) return { ok: false, email: null, classe: "invalido", motivo: "sem cara de e-mail", score: 0 };

  const s = validarSintaxe(email);
  if (!s.ok) return { ok: false, email, classe: "invalido", motivo: s.motivo, score: 0 };
  if (ehPlaceholder(email)) return { ok: false, email, classe: "placeholder", motivo: "placeholder de template", score: 0 };
  if (ehPlataforma(email.split("@")[1])) return { ok: false, email, classe: "placeholder", motivo: `e-mail da plataforma ${email.split("@")[1]}, nao da empresa`, score: 0 };

  let [local, dominio] = email.split("@");
  let corrigido = false;
  if (TYPO_DOMINIO.has(dominio)) {
    dominio = TYPO_DOMINIO.get(dominio);
    corrigido = true;
  }
  const emailFinal = `${local}@${dominio}`;

  const caixa = classificarCaixa(local);
  if (caixa === "errada") return { ok: false, email: emailFinal, classe: "caixa_errada", motivo: `caixa "${local}@" ninguem que decide le`, score: 0, corrigido };

  const blocklist = ctx.blocklist || {};
  if (estaBloqueado(emailFinal, blocklist) || (corrigido && estaBloqueado(email, blocklist))) {
    const reg = blocklist[emailFinal] || blocklist[email];
    return { ok: false, email: emailFinal, classe: "bloqueado", motivo: `blocklist: ${reg?.motivo || "?"}`, score: 0, corrigido };
  }
  const idx = ctx.indiceDominios || indiceBlocklistPorDominio(blocklist);
  const historicoDominio = idx.get(dominio) || [];
  if (historicoDominio.includes("sem_mx")) return { ok: false, email: emailFinal, classe: "sem_mx", motivo: "dominio ja marcado sem_mx", score: 0, corrigido };

  let mx = { ok: true, tipo: "nao_checado" };
  if (!ctx.semMx) {
    mx = await checarMx(dominio);
    if (!mx.ok) return { ok: false, email: emailFinal, classe: "sem_mx", motivo: mx.motivo, score: 0, corrigido, mx: mx.tipo };
  }

  const siteUrl = ehPlataforma(ctx.siteUrl) ? "" : ctx.siteUrl;
  const q = qualificar({ email: emailFinal, decisorNome: ctx.decisorNome, empresa: ctx.empresa, siteUrl });
  if (!q.enviar) {
    // O qualificar nao conhece as caixas institucionais novas (info@, engenharia@...): em
    // dominio proprio elas servem. Freemail generico continua incerto.
    const freemail = FREEMAIL.has(dominio);
    if (q.classe === "incerto" && caixa === "institucional" && !freemail) {
      // segue pro score como empresa
    } else {
      return { ok: false, email: emailFinal, classe: q.classe, motivo: q.motivo, score: 0, corrigido, mx: mx.tipo };
    }
  }

  // Score 0-100: quanto mais perto do dono e mais vivo o dominio, mais alto.
  const freemail = FREEMAIL.has(dominio);
  const dominioProprio = /dominio da empresa/.test(q.motivo);
  let score;
  if (q.classe === "decisor") score = dominioProprio ? 95 : 70;
  else if (dominioProprio) score = /nome do decisor/.test(q.motivo) ? 95 : 78;
  else if (/nome da empresa/.test(q.motivo)) score = freemail ? 58 : 72;
  else score = freemail ? 45 : 64; // caixa institucional

  if (freemail) score -= FREEMAIL_VELHO.has(dominio) ? 15 : dominio === "hotmail.com" || dominio === "hotmail.com.br" ? 5 : 0;
  if (corrigido) score -= 10;
  if (CAIXA_FRACA.test(local)) score -= 8;
  if (mx.tipo === "so_a") score -= 15;
  if (historicoDominio.some((m) => m === "hard_bounce")) score -= 20;
  if (historicoDominio.some((m) => m === "soft_bounce" || m === "deferred")) score -= 8;
  if (/\d{4,}/.test(local)) score -= 5;
  if (ctx.origem === "site") score += 3; // e-mail publicado hoje no site e mais fresco que o do cadastro do CNPJ
  score = Math.max(1, Math.min(100, score));

  return {
    ok: true,
    email: emailFinal,
    classe: q.classe === "decisor" ? "decisor" : "empresa",
    motivo: q.motivo + (corrigido ? ` (dominio corrigido de ${email.split("@")[1]})` : ""),
    score,
    corrigido,
    mx: mx.tipo,
  };
}

/**
 * Valida varios candidatos do mesmo lead e devolve o melhor + todos os pareceres.
 * @param {Array<{email:string, origem:string, pagina?:string}>} candidatos
 */
export async function escolherMelhor(candidatos, ctx = {}) {
  const vistos = new Set();
  const pareceres = [];
  for (const c of candidatos) {
    const norm = normalizarEmail(c.email);
    if (!norm || vistos.has(norm)) continue;
    vistos.add(norm);
    const r = await validarEmail(c.email, { ...ctx, origem: c.origem });
    pareceres.push({ ...r, origem: c.origem, pagina: c.pagina || null, bruto: c.email });
  }
  const aprovados = pareceres.filter((p) => p.ok).sort((a, b) => b.score - a.score);
  return { melhor: aprovados[0] || null, aprovados, pareceres };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const ehMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (ehMain) {
  const GO = process.argv.includes("--go");
  const blocklist = lerBlocklist();
  const indiceDominios = indiceBlocklistPorDominio(blocklist);

  if (process.argv.includes("--fila")) {
    const FILA = path.join(AQUI, "email_queue.json");
    const fila = JSON.parse(fs.readFileSync(FILA, "utf8"));
    const cairiam = [];
    for (const item of fila) {
      const r = await validarEmail(item.email, { decisorNome: item.decisor_nome || item.decisorNome, empresa: item.company, siteUrl: item.site_url || item.siteUrl, blocklist, indiceDominios });
      if (!r.ok) cairiam.push({ item, r });
      else if (r.corrigido) console.log(`  ~ #${item.dealId} ${item.email} -> ${r.email} (typo corrigido; a fila NAO e alterada, corrija no CRM)`);
    }
    salvarCacheMx();
    console.log(`Fila: ${fila.length} | cairiam: ${cairiam.length}`);
    for (const { item, r } of cairiam) console.log(`  x #${item.dealId} ${String(item.company).slice(0, 34).padEnd(34)} ${item.email.padEnd(42)} ${r.classe}: ${r.motivo}`);
    if (GO) {
      let n = 0;
      for (const { item, r } of cairiam) {
        if (["sem_mx", "caixa_errada", "placeholder", "invalido", "typo"].includes(r.classe)) {
          bloquear(blocklist, item.email, r.classe, { origem: `validar-email --fila: ${r.motivo}` });
          n++;
        }
      }
      salvarBlocklist(blocklist);
      console.log(`Blocklist: +${n} (terceiro/incerto nao vao pra blocklist, o build ja descarta)`);
    } else if (cairiam.length) {
      console.log("\nDry-run. --go grava sem_mx/caixa_errada/placeholder/invalido na blocklist.");
    }
  } else {
    const alvos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
    if (!alvos.length) {
      console.log("Uso: node validar-email.mjs <email> [--empresa=Nome] [--decisor=Nome] [--site=url]  |  --fila [--go]");
      process.exit(1);
    }
    const arg = (n) => process.argv.find((x) => x.startsWith(`--${n}=`))?.split("=").slice(1).join("=") || "";
    for (const a of alvos) {
      const r = await validarEmail(a, { empresa: arg("empresa"), decisorNome: arg("decisor"), siteUrl: arg("site"), blocklist, indiceDominios });
      console.log(JSON.stringify(r));
    }
    salvarCacheMx();
  }
}
