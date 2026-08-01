// Motor de disparo cold email via Brevo (API transacional /v3/smtp/email).
// Personalizado 1:1, throttled, test-first, dedup, registra email_sent no CRM.
//
// USO:
//   node brevo_send.mjs --check                 # so valida conta/sender/limite, envia 0
//   node brevo_send.mjs --test=voce@email.com   # manda 1 email de teste pra voce
//   node brevo_send.mjs --limit=40              # dispara os 40 primeiros da fila (dedup)
//   node brevo_send.mjs --limit=40 --from="Erick Sena <erick@dominio.com>"
//
// Defaults conservadores de propósito (proteger reputação de domínio + ToS Brevo).
import fs from 'node:fs';

const args = process.argv.slice(2);
const arg = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : def; };
const has = k => args.includes(`--${k}`);

const LIMIT = parseInt(arg('limit', '0')) || 0;
const TEST = arg('test', '');
const CHECK = has('check');
const FROM_OVERRIDE = arg('from', '');
const THROTTLE_MS = parseInt(arg('throttle', '8000'));   // 8s entre envios
const DAILY_CAP = parseInt(arg('cap', '250'));           // teto duro de seguranca

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

const sentLogPath = 'sent_log.json';
const sentLog = fs.existsSync(sentLogPath) ? JSON.parse(fs.readFileSync(sentLogPath, 'utf8')) : {};
const saveLog = () => fs.writeFileSync(sentLogPath, JSON.stringify(sentLog, null, 1), 'utf8');
const sentToday = Object.values(sentLog).filter(t => t.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

async function pickSender() {
  if (FROM_OVERRIDE) {
    const m = FROM_OVERRIDE.match(/^(.*?)<(.+?)>$/);
    return m ? { name: m[1].trim() || 'Erick Sena', email: m[2].trim() } : { name: 'Erick Sena', email: FROM_OVERRIDE.trim() };
  }
  const r = await fetch('https://api.brevo.com/v3/senders', { headers: BH });
  if (!r.ok) throw new Error(`senders ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const s = (await r.json()).senders || [];
  const active = s.find(x => x.active) || s[0];
  if (!active) throw new Error('Nenhum sender cadastrado no Brevo. Cadastre e verifique um remetente antes.');
  return { name: active.name || 'Erick Sena', email: active.email };
}

async function validate() {
  const acc = await fetch('https://api.brevo.com/v3/account', { headers: BH });
  if (!acc.ok) throw new Error(`account ${acc.status}: ${(await acc.text()).slice(0, 200)}`);
  const a = await acc.json();
  const sender = await pickSender();
  console.log('CONTA:', a.email, '| plano:', JSON.stringify(a.plan?.[0] || a.plan));
  console.log('SENDER:', `${sender.name} <${sender.email}>`);
  console.log('ENVIADOS HOJE (log local):', sentToday, '/ cap', DAILY_CAP);
  return { a, sender };
}

async function sendOne(sender, item) {
  const body = {
    sender,
    to: [{ email: item.email, name: item.company }],
    subject: item.subject,
    htmlContent: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">${item.html}
<p style="font-size:11px;color:#999;margin-top:20px">Se não quiser receber mais contato, responda com "sair" que eu removo.</p></div>`,
    replyTo: sender,
    tags: ['diagnostico-industrial', item.semSite ? 'sem-site' : 'com-site'],
    headers: { 'List-Unsubscribe': `<mailto:${sender.email}?subject=unsubscribe>` },
  };
  const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: BH, body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${txt.slice(0, 200)}`);
  return JSON.parse(txt).messageId;
}

async function logActivity(item, messageId) {
  try {
    await fetch(`${SB_URL}/rest/v1/activities`, {
      method: 'POST', headers: { ...SBH, Prefer: 'return=minimal' },
      body: JSON.stringify({ type: 'email_sent', description: item.company,
        created_at: new Date().toISOString() }),
    });
  } catch { /* nao bloqueia envio */ }
}

// ---- MAIN ----
const { sender } = await validate();
if (CHECK) { console.log('CHECK ok — nada enviado.'); process.exit(0); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

if (TEST) {
  const queue = JSON.parse(fs.readFileSync('email_queue.json', 'utf8'));
  const sample = queue[0];
  const id = await sendOne(sender, { ...sample, email: TEST, subject: '[TESTE] ' + sample.subject });
  console.log(`TESTE enviado pra ${TEST} (messageId ${id}). Confira inbox E spam.`);
  process.exit(0);
}

if (!LIMIT) { console.log('Sem --limit, --test ou --check: nada a fazer.'); process.exit(0); }

const queue = JSON.parse(fs.readFileSync('email_queue.json', 'utf8'));
const pending = queue.filter(q => !sentLog[q.email]);
const budget = Math.min(LIMIT, DAILY_CAP - sentToday);
if (budget <= 0) { console.log(`Cap diário atingido (${sentToday}/${DAILY_CAP}). Pare por hoje.`); process.exit(0); }
const batch = pending.slice(0, budget);
console.log(`Fila pendente: ${pending.length} | vou enviar: ${batch.length} (throttle ${THROTTLE_MS}ms)`);

let ok = 0, err = 0;
for (const item of batch) {
  try {
    const id = await sendOne(sender, item);
    sentLog[item.email] = new Date().toISOString();
    saveLog();
    await logActivity(item, id);
    ok++;
    console.log(`✓ ${ok}/${batch.length} ${item.company} <${item.email}>`);
  } catch (e) {
    err++;
    console.log(`✗ ${item.company} <${item.email}>: ${e.message}`);
    if (/401|403|ip_not/i.test(e.message)) { console.log('ABORTANDO: erro de auth/IP.'); break; }
  }
  if (item !== batch[batch.length - 1]) await sleep(THROTTLE_MS);
}
console.log(`\nFim: ${ok} enviados, ${err} erros. Total hoje: ${sentToday + ok}/${DAILY_CAP}.`);
