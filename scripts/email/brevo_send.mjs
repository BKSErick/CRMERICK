// Motor de disparo cold email via Brevo (API transacional /v3/smtp/email).
// Personalizado 1:1, throttled, test-first, dedup, registra email_sent no CRM.
//
// USO:
//   node brevo_send.mjs --check                 # so valida conta/sender/limite, envia 0
//   node brevo_send.mjs --test=voce@email.com   # manda 1 email de teste pra voce
//   node brevo_send.mjs --limit=20              # dispara ate 20 da fila (dedup)
//   node brevo_send.mjs --limit=30 --cap=30     # sobe a rampa conscientemente
//   node brevo_send.mjs --limit=20 --from="Erick Sena <erick@dominio.com>"
//   node brevo_send.mjs --queue=email_queue_seq2_2026-09-22.json --log=sent_log_seq2.json --limit=39
//
// --queue/--log existem por causa do segundo e-mail da sequencia (18/09/2026): o dedup
// e por endereco dentro de UM log, entao mandar o e-mail 2 pra quem ja levou o 1 exige
// fila e log proprios. O sent_log.json principal continua sendo o que o build do frio
// le pra jaEnviado/mesmaCasa; nunca gravar sequencia nele.
//
// Defaults conservadores de propósito (proteger reputação de domínio + ToS Brevo).
import fs from 'node:fs';
import {
  buildActivityPayload,
  buildBrevoEmailPayload,
  countEmailSendsForDay,
  fetchCrmEmailSentToday,
  postActivity,
  resolveBatchLimit,
  resolveDailyCap,
  resolveEffectiveSentToday,
  sentAtFromLogEntry,
  validateMailbox,
} from './brevo-support.mjs';

const args = process.argv.slice(2);
const arg = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : def; };
const has = k => args.includes(`--${k}`);

const LIMIT = resolveBatchLimit(arg('limit', ''));
const TEST = arg('test', '');
const CHECK = has('check');
const FROM_OVERRIDE = arg('from', '');
const THROTTLE_MS = parseInt(arg('throttle', '8000'));   // 8s entre envios
// O dominio remetente pode nao ter MX (caso do mydrion.com.br em 08/09/2026): dai a resposta
// do lead volta com erro e some. --reply-to manda a resposta para uma caixa que existe.
const REPLY_TO = arg('reply-to', '');
const REPLY_TO_EMAIL = REPLY_TO ? validateMailbox(REPLY_TO) : '';
const DAILY_CAP = resolveDailyCap(arg('cap', ''));       // padrao 20; teto duro absoluto 250
const QUEUE_PATH = arg('queue', 'email_queue.json');
const LOG_PATH = arg('log', 'sent_log.json');

if (!LIMIT && !TEST && !CHECK) {
  console.log('Sem --limit, --test ou --check: nada a fazer.');
  process.exit(0);
}

const envCRM = Object.fromEntries(
  fs.readFileSync('D:/001Gravity/CRM ERICK/.env', 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const envAIOS = Object.fromEntries(
  fs.readFileSync('D:/001Gravity/aios-core/.env', 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));

const BREVO = envCRM.BREVO_API_KEY || envAIOS.BREVO_API_KEY;
const BH = { 'api-key': BREVO, accept: 'application/json', 'content-type': 'application/json' };
const SB_URL = envCRM.SUPABASE_URL, SB_KEY = envCRM.SUPABASE_SERVICE_ROLE_KEY;
const SBH = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json' };

const sentLogPath = LOG_PATH;
const sentLog = fs.existsSync(sentLogPath) ? JSON.parse(fs.readFileSync(sentLogPath, 'utf8')) : {};
const saveLog = () => fs.writeFileSync(sentLogPath, JSON.stringify(sentLog, null, 1), 'utf8');
const sentTodayLocal = countEmailSendsForDay(
  Object.values(sentLog).map((entry) => ({ created_at: sentAtFromLogEntry(entry) })),
);
const sentTodayLocalUnlogged = countEmailSendsForDay(
  Object.values(sentLog)
    .filter((entry) => entry && typeof entry === 'object' && entry.crmActivityLogged === false)
    .map((entry) => ({ created_at: sentAtFromLogEntry(entry) })),
);

async function pickSender() {
  if (FROM_OVERRIDE) {
    const m = FROM_OVERRIDE.match(/^(.*?)<(.+?)>$/);
    return m ? { name: m[1].trim() || 'Erick Sena', email: m[2].trim() } : { name: 'Erick Sena', email: FROM_OVERRIDE.trim() };
  }
  const r = await fetch('https://api.brevo.com/v3/senders', { headers: BH });
  if (!r.ok) throw new Error(`senders ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const s = (await r.json()).senders || [];
  const ativos = s.filter(x => x.active);
  if (ativos.length === 0 && s.length === 0) throw new Error('Nenhum sender cadastrado no Brevo. Cadastre e verifique um remetente antes.');

  // Escolher o PRIMEIRO ativo pegava o gmail so porque ele tem id menor, e sair de
  // freemail joga o disparo frio em spam mesmo com o dominio autenticado na conta:
  // o SPF/DKIM que vale e o do dominio do From. Entao a preferencia e, nesta ordem:
  // dominio autenticado no Brevo > qualquer dominio proprio > o que sobrar.
  let autenticados = [];
  try {
    const d = await fetch('https://api.brevo.com/v3/senders/domains', { headers: BH });
    if (d.ok) {
      autenticados = ((await d.json()).domains || [])
        .filter(x => x.authenticated && x.verified)
        .map(x => String(x.domain_name || x.domain || '').toLowerCase());
    }
  } catch { /* sem lista de dominios: cai na heuristica de freemail */ }

  const FREEMAIL = ['gmail.com', 'hotmail.com', 'outlook.com', 'live.com', 'yahoo.com', 'yahoo.com.br',
    'icloud.com', 'aol.com', 'msn.com', 'bol.com.br', 'uol.com.br', 'terra.com.br', 'ig.com.br', 'globo.com'];
  const dominioDe = e => String(e || '').split('@')[1]?.toLowerCase() || '';

  const candidatos = ativos.length ? ativos : s;
  const escolhido =
    candidatos.find(x => autenticados.includes(dominioDe(x.email))) ||
    candidatos.find(x => !FREEMAIL.includes(dominioDe(x.email))) ||
    candidatos[0];

  if (FREEMAIL.includes(dominioDe(escolhido.email))) {
    console.warn(`AVISO: remetente ${escolhido.email} e freemail. Entrega vai sofrer em disparo frio.`);
    console.warn('       Cadastre um remetente no dominio autenticado ou passe --from="Nome <voce@dominio>".');
  }
  return { name: escolhido.name || 'Erick Sena', email: escolhido.email };
}

async function validate() {
  const acc = await fetch('https://api.brevo.com/v3/account', { headers: BH });
  if (!acc.ok) throw new Error(`account ${acc.status}: ${(await acc.text()).slice(0, 200)}`);
  const a = await acc.json();
  const sender = await pickSender();
  const sentTodayCentral = await fetchCrmEmailSentToday({
    supabaseUrl: SB_URL,
    headers: SBH,
  });
  const sentToday = resolveEffectiveSentToday(sentTodayCentral, sentTodayLocalUnlogged);
  console.log('CONTA:', a.email, '| plano:', JSON.stringify(a.plan?.[0] || a.plan));
  console.log('SENDER:', `${sender.name} <${sender.email}>`);
  console.log('ENVIADOS HOJE (CRM central):', sentTodayCentral);
  console.log('ENVIADOS HOJE (log local complementar):', sentTodayLocal);
  console.log('ORCAMENTO EFETIVO DO DIA:', sentToday, '/ cap', DAILY_CAP);

  // Sem MX no dominio do Reply-To, a resposta do lead volta com erro e some.
  const alvoResposta = validateMailbox(REPLY_TO_EMAIL || sender.email);
  const dominioResposta = alvoResposta.split('@')[1];
  console.log('RESPOSTAS VAO PARA:', alvoResposta);
  try {
    const { promises: dns } = await import('node:dns');
    const mx = await dns.resolveMx(dominioResposta).catch(() => []);
    if (!mx.length) {
      console.warn(`\n*** ATENCAO: ${dominioResposta} NAO tem registro MX. ***`);
      console.warn('    Resposta de lead vai voltar com erro. Configure recebimento no dominio');
      console.warn('    ou rode com --reply-to=umendereco@quefunciona.com\n');
    } else {
      console.log('MX do dominio de resposta:', mx.map(m => m.exchange).join(', '));
    }
  } catch { /* checagem de DNS e best-effort */ }
  return { a, sender, sentToday };
}

async function sendOne(sender, item) {
  const body = buildBrevoEmailPayload(sender, item, REPLY_TO_EMAIL);
  const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: BH, body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${txt.slice(0, 200)}`);
  return JSON.parse(txt).messageId;
}

async function logActivity(item, messageId) {
  const payload = buildActivityPayload(item, messageId);
  await postActivity({ fetchFn: fetch, supabaseUrl: SB_URL, headers: SBH, payload });
}

// ---- MAIN ----
const { sender, sentToday } = await validate();
if (CHECK) { console.log('CHECK ok — nada enviado.'); process.exit(0); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

if (TEST) {
  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  const sample = queue[0];
  const id = await sendOne(sender, { ...sample, email: TEST, subject: '[TESTE] ' + sample.subject });
  console.log(`TESTE enviado pra ${TEST} (messageId ${id}). Confira inbox E spam.`);
  process.exit(0);
}

const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
const pending = queue.filter(q => !sentLog[q.email]);
const budget = Math.min(LIMIT, DAILY_CAP - sentToday);
if (budget <= 0) { console.log(`Cap diário atingido (${sentToday}/${DAILY_CAP}). Pare por hoje.`); process.exit(0); }
const batch = pending.slice(0, budget);
console.log(`Fila ${QUEUE_PATH} (log ${LOG_PATH}) pendente: ${pending.length} | vou enviar: ${batch.length} (throttle ${THROTTLE_MS}ms)`);

let ok = 0, err = 0, crmErr = 0;
for (const item of batch) {
  try {
    const id = await sendOne(sender, item);
    const sentAt = new Date().toISOString();
    sentLog[item.email] = {
      sentAt,
      messageId: id,
      dealId: item.dealId ?? null,
      contactId: item.contactId ?? null,
      crmActivityLogged: false,
    };
    saveLog();
    ok++;
    try {
      await logActivity(item, id);
      sentLog[item.email].crmActivityLogged = true;
      sentLog[item.email].crmActivityLoggedAt = new Date().toISOString();
      saveLog();
      console.log(`✓ ${ok}/${batch.length} ${item.company} <${item.email}>`);
    } catch (activityError) {
      crmErr++;
      console.error(`! EMAIL ENVIADO, mas o CRM nao registrou ${item.company}: ${activityError.message}`);
      console.error('  O destinatario ficou no sent_log e NAO sera reenviado. Interrompendo o lote para reconciliar.');
      break;
    }
  } catch (e) {
    err++;
    console.log(`✗ ${item.company} <${item.email}>: ${e.message}`);
    if (/401|403|ip_not/i.test(e.message)) { console.log('ABORTANDO: erro de auth/IP.'); break; }
  }
  if (item !== batch[batch.length - 1]) await sleep(THROTTLE_MS);
}
console.log(`\nFim: ${ok} enviados, ${err} erros de envio, ${crmErr} erros de CRM. Total hoje: ${sentToday + ok}/${DAILY_CAP}.`);
if (crmErr) process.exitCode = 2;
