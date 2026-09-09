// Leitor de eventos de entrega do Brevo (API transacional /v3/smtp/statistics/events).
// Responde, por destinatario: entregou? abriu? clicou? quicou? caiu em spam?
//
// Existe porque webhook de evento transacional exigiria plano pago. Aqui o mesmo dado
// vem por polling: roda quando quiser, nao depende de endpoint publico nem de deploy.
//
// USO:
//   node brevo-events.mjs                     # todos do sent_log.json
//   node brevo-events.mjs --days=7            # so os ultimos 7 dias de envio
//   node brevo-events.mjs --email=alguem@x.br # um destinatario
//   node brevo-events.mjs --json              # saida JSON (para script/automacao)
//   node brevo-events.mjs --bloquear          # manda bounce/spam para o blocklist.json
//
// LEIA ANTES DE CONFIAR NA ABERTURA: "aberto" vem de pixel de imagem. Quem bloqueia
// imagem nunca conta como aberto, e o proxy do Gmail as vezes conta abertura que nao
// houve (esses aparecem separados como "proxy"). Bounce e spam, ao contrario, sao
// exatos — e sao os numeros que decidem se a rampa do dominio pode subir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bloquear, lerBlocklist, salvarBlocklist } from './blocklist.mjs';
import { sentAtFromLogEntry } from './brevo-support.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : def; };
const has = k => args.includes(`--${k}`);

const DAYS = parseInt(arg('days', '0')) || 0;
const SO_ESTE = arg('email', '').trim().toLowerCase();
const JSON_OUT = has('json');
const BLOQUEAR = has('bloquear');

const lerEnv = p => {
  try {
    return Object.fromEntries(
      fs.readFileSync(p, 'utf8')
        .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
  } catch { return {}; }
};
const envCRM = lerEnv('D:/001Gravity/CRM ERICK/.env');
const envAIOS = lerEnv('D:/001Gravity/aios-core/.env');

const BREVO = envCRM.BREVO_API_KEY || envAIOS.BREVO_API_KEY;
if (!BREVO) { console.error('BREVO_API_KEY ausente no .env do CRM e do aios-core.'); process.exit(1); }
const BH = { 'api-key': BREVO, accept: 'application/json' };
const SB_URL = envCRM.SUPABASE_URL, SB_KEY = envCRM.SUPABASE_SERVICE_ROLE_KEY;

// ---- quem foi enviado ----
const sentLogPath = path.join(AQUI, 'sent_log.json');
const sentLog = fs.existsSync(sentLogPath) ? JSON.parse(fs.readFileSync(sentLogPath, 'utf8')) : {};

const corte = DAYS ? new Date(Date.now() - DAYS * 864e5).toISOString() : '';
const enviados = Object.entries(sentLog)
  .map(([email, entry]) => ({
    email: email.toLowerCase(),
    sentAt: sentAtFromLogEntry(entry),
    // Os 9 primeiros disparos (08/09) foram gravados no formato antigo (so a data em
    // string), entao nao tem messageId. Por isso o casamento aqui e por DESTINATARIO,
    // nao por messageId: assim o lote antigo tambem aparece.
    messageId: typeof entry === 'object' ? entry?.messageId ?? null : null,
    dealId: typeof entry === 'object' ? entry?.dealId ?? null : null,
  }))
  .filter(x => x.sentAt && (!corte || x.sentAt >= corte))
  .filter(x => !SO_ESTE || x.email === SO_ESTE)
  .sort((a, b) => a.sentAt.localeCompare(b.sentAt));

if (!enviados.length) { console.log('Nada no sent_log.json dentro do filtro.'); process.exit(0); }

const dia = iso => iso.slice(0, 10);
const startDate = dia(enviados[0].sentAt);
const endDate = dia(new Date().toISOString()); // a API recusa data futura, entao o teto e hoje

// ---- eventos do Brevo ----
// A janela inteira de uma vez, paginada. Uma chamada por destinatario tambem
// funcionaria, mas gastaria 29 requisicoes para pegar o mesmo conjunto.
async function puxarEventos() {
  const todos = [];
  const limit = 100;
  for (let offset = 0; offset < 5000; offset += limit) {
    const url = `https://api.brevo.com/v3/smtp/statistics/events?limit=${limit}&offset=${offset}`
      + `&startDate=${startDate}&endDate=${endDate}&sort=asc`
      + (SO_ESTE ? `&email=${encodeURIComponent(SO_ESTE)}` : '');
    const r = await fetch(url, { headers: BH });
    const txt = await r.text();
    if (!r.ok) {
      // 401 aqui costuma ser Authorized-IPs ligado na conta, nao chave errada.
      throw new Error(`statistics/events ${r.status}: ${txt.slice(0, 200)}`);
    }
    const lote = JSON.parse(txt).events || [];
    todos.push(...lote);
    if (lote.length < limit) break;
  }
  return todos;
}

// ---- nome da empresa (best-effort, so para a saida ficar legivel) ----
async function nomesPorEmail() {
  const mapa = new Map();
  try {
    const fila = JSON.parse(fs.readFileSync(path.join(AQUI, 'email_queue.json'), 'utf8'));
    for (const q of fila) if (q?.email && q?.company) mapa.set(String(q.email).toLowerCase(), q.company);
  } catch { /* fila e reconstruida a cada lote; pode nao ter o envio antigo */ }

  const faltando = enviados.filter(x => !mapa.has(x.email) && x.dealId);
  if (!faltando.length || !SB_URL || !SB_KEY) return mapa;
  try {
    const ids = [...new Set(faltando.map(x => x.dealId))].join(',');
    const r = await fetch(`${SB_URL.replace(/\/+$/, '')}/rest/v1/deals?id=in.(${ids})&select=id,company`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    if (r.ok) {
      const porId = new Map((await r.json()).map(d => [d.id, d.company]));
      for (const x of faltando) if (porId.has(x.dealId)) mapa.set(x.email, porId.get(x.dealId));
    }
  } catch { /* nome e enfeite; a resposta vale sem ele */ }
  return mapa;
}

// ---- classificacao ----
// Prioridade proposital: problema de entrega vence engajamento. Se um endereco
// quicou E abriu, o que importa para a rampa do dominio e que ele quicou.
const RUINS = {
  spam: 'SPAM', hardBounces: 'HARD BOUNCE', hard_bounce: 'HARD BOUNCE',
  blocked: 'BLOQUEADO', invalid: 'INVALIDO', error: 'ERRO',
  softBounces: 'soft bounce', soft_bounce: 'soft bounce', deferred: 'adiado',
  unsubscribed: 'DESCADASTROU',
};
const norm = e => String(e || '').trim();

function classificar(eventos) {
  const tipos = new Set(eventos.map(e => norm(e.event)));
  const ruim = ['spam', 'hardBounces', 'hard_bounce', 'blocked', 'invalid', 'error', 'unsubscribed', 'softBounces', 'soft_bounce', 'deferred']
    .find(k => tipos.has(k));
  return {
    entregue: tipos.has('delivered'),
    aberto: tipos.has('opened') || tipos.has('uniqueOpened'),
    proxy: tipos.has('loadedByProxy'),
    clicou: tipos.has('click') || tipos.has('clicks'),
    problema: ruim ? RUINS[ruim] : null,
    // chave crua (nao o rotulo de tela) porque o blocklist decide permanente x
    // quarentena por ela: hardBounces morre, softBounces so descansa.
    motivo: ruim ? ruim.replace('Bounces', '_bounce').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase() : null,
    tipos: [...tipos],
    // Qual link foi tocado muda a acao: "Falar no WhatsApp" e lead quente pedindo
    // contato; "Conheca a Mydrion" e curiosidade. Sem isso o clique vira numero solto.
    links: [...new Set(eventos.filter(e => /click/i.test(norm(e.event))).map(e => e.link).filter(Boolean))],
    motivos: [...new Set(eventos.map(e => e.reason).filter(Boolean))],
  };
}

const eventos = await puxarEventos();
const nomes = await nomesPorEmail();
const porEmail = new Map();
for (const ev of eventos) {
  const k = String(ev.email || '').toLowerCase();
  if (!porEmail.has(k)) porEmail.set(k, []);
  porEmail.get(k).push(ev);
}

const linhas = enviados.map(x => {
  const evs = porEmail.get(x.email) || [];
  const c = classificar(evs);
  const status = c.problema ? c.problema
    : c.clicou ? 'CLICOU'
      : c.aberto ? 'abriu'
        : c.proxy ? 'abriu? (proxy)'
          : c.entregue ? 'entregue'
            : evs.length ? 'em transito'
              : 'sem evento';
  return {
    empresa: nomes.get(x.email) || '-',
    email: x.email,
    enviadoEm: x.sentAt.slice(0, 16).replace('T', ' '),
    entregue: c.entregue,
    aberto: c.aberto || c.proxy,
    clicou: c.clicou,
    problema: c.problema,
    motivo: c.motivo,
    status,
    eventos: c.tipos,
    links: c.links,
    motivos: c.motivos,
  };
});

if (JSON_OUT) {
  console.log(JSON.stringify({ startDate, endDate, total: linhas.length, linhas }, null, 2));
  process.exit(0);
}

const n = f => linhas.filter(f).length;
const semEvento = n(l => l.status === 'sem evento');

console.log(`\nEVENTOS BREVO — ${startDate} a ${endDate} — ${linhas.length} destinatarios\n`);
const w = (s, k) => String(s).slice(0, k).padEnd(k);
console.log(w('EMPRESA', 26), w('E-MAIL', 34), w('ENVIADO', 17), 'STATUS');
console.log('-'.repeat(96));
for (const l of linhas) console.log(w(l.empresa, 26), w(l.email, 34), w(l.enviadoEm, 17), l.status);

console.log(`\nRESUMO`);
console.log(`  enviados ............ ${linhas.length}`);
console.log(`  entregues ........... ${n(l => l.entregue)}`);
console.log(`  abertos ............. ${n(l => l.aberto)}   (pixel: piso, nao verdade)`);
console.log(`  clicaram ............ ${n(l => l.clicou)}`);
console.log(`  com problema ........ ${n(l => l.problema)}`);
if (semEvento) console.log(`  sem evento nenhum ... ${semEvento}   (log do Brevo tem retencao limitada no plano free)`);

// O clique e o unico sinal forte que sai daqui: quem clicou levantou a mao.
const quentes = linhas.filter(l => l.clicou);
if (quentes.length) {
  console.log(`\nQUEM CLICOU (agir hoje)`);
  for (const q of quentes) {
    console.log(`    ${q.empresa} <${q.email}>`);
    for (const link of q.links) {
      const alvo = /wa\.me|whatsapp/i.test(link) ? 'WHATSAPP — pediu contato' : link;
      console.log(`      -> ${alvo}`);
    }
  }
}

const graves = linhas.filter(l => ['SPAM', 'HARD BOUNCE', 'BLOQUEADO', 'INVALIDO'].includes(l.problema));
if (graves.length) {
  console.log(`\n*** ${graves.length} PROBLEMA(S) GRAVE(S) — NAO SUBIR A RAMPA ATE LIMPAR ***`);
  for (const g of graves) console.log(`    ${g.problema.padEnd(13)} ${g.email}  ${g.empresa}`);
  console.log('    Hard bounce e spam em dominio novo queimam a reputacao do mydrion.com.br inteiro.');
  if (!BLOQUEAR) console.log('    Rode com --bloquear para tirar esses enderecos de todos os lotes futuros.');
} else {
  console.log('\nSem hard bounce, spam ou bloqueio. Reputacao limpa ate aqui.');
}

if (BLOQUEAR) {
  const lista = lerBlocklist();
  const antes = Object.keys(lista).length;
  for (const l of linhas.filter(x => x.motivo)) bloquear(lista, l.email, l.motivo, { origem: 'brevo-events' });
  salvarBlocklist(lista);
  const novos = Object.keys(lista).length - antes;
  console.log(`\nBLOCKLIST: ${novos} novo(s), ${Object.keys(lista).length} no total.`);
  console.log('  Permanentes saem de toda fila futura. Soft bounce volta sozinho apos a quarentena.');
}
console.log('');
