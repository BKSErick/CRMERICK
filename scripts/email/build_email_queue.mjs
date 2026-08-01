// Monta a fila de cold email a partir do Supabase do CRM (contacts com email + deal)
// Nao envia nada. Gera email_queue.json + preview_emails.html pra eyeball.
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('D:/001Gravity/CRM ERICK/.env', 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const URL_ = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function all(table, select) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${table}?select=${select}&limit=1000&offset=${off}`, { headers: H });
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
const norm = s => (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

const [deals, contacts] = await Promise.all([
  all('deals', 'company,site_url,analysis_url,points'),
  all('contacts', 'name,company,email'),
]);
const dealByCompany = new Map(deals.map(d => [norm(d.company), d]));

const BAD_RECIPIENT = /(sac|atendimento|contato|comercial|vendas|financeiro)@.*(gov|edu)|abuse@|postmaster@/i;
const BASE = 'https://crmerick.vercel.app/';

function buildEmail(company, semSite, link) {
  if (semSite) {
    return {
      subject: `${company}: um ponto na presença digital que pode estar custando orçamentos`,
      html:
`<p>Olá,</p>
<p>Encontrei a <b>${company}</b> pesquisando o segmento de vocês e a reputação de operação real ficou clara.</p>
<p>O que eu notei: hoje o comprador industrial valida a empresa no Google antes de pedir orçamento. Quando ele não encontra uma página com serviços, prova de capacidade e um caminho direto de contato, a conversa esfria antes do primeiro contato. Não é nada que vocês tenham feito de errado, é o comportamento do comprador que mudou e a maioria do setor ainda não acompanhou.</p>
<p>Montei uma análise rápida da presença digital de vocês, com o que eu ajustaria. Dá uma olhada, leva 2 minutos:<br>
<a href="${link}">${link}</a></p>
<p>Se fizer sentido, é só me responder por aqui ou no WhatsApp <b>(31) 99107-2407</b>.</p>
<p>Erick Sena</p>`,
    };
  }
  return {
    subject: `Uma observação rápida sobre o site da ${company}`,
    html:
`<p>Olá,</p>
<p>Analisei a presença digital da <b>${company}</b> e o site de vocês já cobre o básico.</p>
<p>O ponto que eu ajustaria é um só: o comprador industrial que abre o site pra validar antes de ligar precisa encontrar prova de capacidade e um caminho direto de orçamento nos primeiros segundos. Esse detalhe costuma decidir se ele fala com vocês ou com o concorrente. Não é sobre o site em si, é sobre o que ele encontra (ou não) em 10 segundos.</p>
<p>Montei um diagnóstico visual rápido com o que eu mudaria. Dá uma olhada, leva 2 minutos:<br>
<a href="${link}">${link}</a></p>
<p>Se fizer sentido, é só me responder por aqui ou no WhatsApp <b>(31) 99107-2407</b>.</p>
<p>Erick Sena</p>`,
  };
}

const queue = [];
for (const c of contacts) {
  const email = (c.email || '').trim().toLowerCase();
  if (!email.includes('@') || BAD_RECIPIENT.test(email)) continue;
  const d = dealByCompany.get(norm(c.company)) || dealByCompany.get(norm(c.name)) || {};
  if (!d.analysis_url) continue;
  const company = c.company || c.name;
  const semSite = !d.site_url;
  const link = BASE + d.analysis_url + '?utm_source=email&utm_medium=cold&utm_campaign=diagnostico';
  const { subject, html } = buildEmail(company, semSite, link);
  queue.push({ email, company, semSite, score: (Number(d.points) || 0), subject, html });
}
// dedup por email
const seen = new Set(); const uniq = [];
for (const q of queue) { if (seen.has(q.email)) continue; seen.add(q.email); uniq.push(q); }
uniq.sort((a, b) => (b.semSite - a.semSite) || (b.score - a.score));

fs.writeFileSync('email_queue.json', JSON.stringify(uniq, null, 1), 'utf8');
console.log(`fila: ${uniq.length} emails unicos | sem-site: ${uniq.filter(q => q.semSite).length}`);

// preview dos 6 primeiros
const prev = uniq.slice(0, 6).map(q =>
  `<hr><p><b>PARA:</b> ${q.email} · ${q.company} ${q.semSite ? '[SEM SITE]' : '[tem site]'}</p><p><b>ASSUNTO:</b> ${q.subject}</p>${q.html}`
).join('\n');
fs.writeFileSync('D:/001Gravity/CRM ERICK/preview-emails.html',
  `<!doctype html><meta charset=utf-8><body style="font-family:system-ui;max-width:640px;margin:24px auto;padding:0 16px">
<h2>Preview cold email — ${uniq.length} na fila</h2>${prev}</body>`, 'utf8');
console.log('preview: D:/001Gravity/CRM ERICK/preview-emails.html');
console.log('amostra:', uniq.slice(0, 3).map(q => q.company).join(' | '));
