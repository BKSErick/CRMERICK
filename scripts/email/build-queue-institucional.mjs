/**
 * build-queue-institucional.mjs
 * Monta `email_queue.json` com a copy institucional (playbook da objeção) e SÓ com
 * destinatários que passam no classificador. Não envia nada.
 *
 * Substitui o `build_email_queue.mjs`, cuja copy era a de landing page de julho/2026
 * (apontava falha no material do lead, comparava com concorrente e dependia de uma
 * página de diagnóstico sob medida).
 *
 * USO:
 *   cd scripts/email
 *   node build-queue-institucional.mjs --setor=industria
 *   node build-queue-institucional.mjs --setor=industria,saude --limit=40
 *   node build-queue-institucional.mjs --setor=industria --primeiro-toque   # inclui quem nunca recebeu WhatsApp
 *   node build-queue-institucional.mjs --setor=industria --liberar=273,755  # deals cuja "resposta" era bot
 */
import fs from "node:fs";
import { lerBlocklist } from "./blocklist.mjs";
import { contactForDeal, recipientFromActivityDescription } from "./brevo-support.mjs";
import { montarEmail, violacoes } from "./copy-institucional.mjs";
import { indiceBlocklistPorDominio, salvarCacheMx, validarEmail } from "./validar-email.mjs";

const arg = (n) => process.argv.find((x) => x.startsWith(`--${n}=`))?.split("=")[1] || "";
const SETORES = (arg("setor") || "industria").split(",").map((s) => s.trim()).filter(Boolean);
const LIMITE = Number(arg("limit") || 0);

const env = Object.fromEntries(
  fs.readFileSync("D:/001Gravity/CRM ERICK/.env", "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

async function todas(tabela, select, extra = "") {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${tabela}?select=${select}${extra}&limit=1000&offset=${off}`, { headers: H });
    const linhas = await r.json();
    if (!Array.isArray(linhas)) throw new Error(`${tabela}: ${JSON.stringify(linhas).slice(0, 200)}`);
    out.push(...linhas);
    if (linhas.length < 1000) break;
  }
  return out;
}

const [deals, contacts, activities, messages] = await Promise.all([
  todas("deals", "id,contact_id,company,stage,setor,porte,points,decisor_nome,email_receita,site_url,blocker,loss_reason_code", `&setor=in.(${SETORES.join(",")})`),
  todas("contacts", "id,email,city"),
  todas("activities", "deal_id,type,description"),
  todas("messages", "deal_id,direction"),
]);
const contatoPorId = new Map(contacts.map((c) => [c.id, c]));

// SEPARACAO DE CANAL (decisao do Erick, 08/09/2026): e-mail so vai para quem JA recebeu
// WhatsApp e NUNCA respondeu nada. Quem esta em conversa viva no WhatsApp nao recebe e-mail
// tambem, porque virar dois canais em cima da mesma pessoa aumenta a chance de ser marcado
// como spam, e marcacao de spam em dominio novo queima o dominio inteiro.
//
// "Abordado" NAO pode sair so de `messages`: disparo manual por wa.me gera activity e nao
// gera mensagem. Por isso os dois lados sao considerados nas duas checagens.
const ABORDOU = new Set(["whatsapp_sent", "whatsapp_sent_sync"]);
const abordados = new Set();
const responderam = new Set();
for (const a of activities) {
  if (a.deal_id == null) continue;
  if (ABORDOU.has(a.type)) abordados.add(a.deal_id);
  if (a.type === "whatsapp_received") responderam.add(a.deal_id);
}
for (const m of messages) {
  if (m.deal_id == null) continue;
  if (m.direction === "sent") abordados.add(m.deal_id);
  if (m.direction === "received") responderam.add(m.deal_id);
}
const TODOS = process.argv.includes("--todos");
// Liberado pelo Erick em 14/09/2026, quando a fila sob a regra de canal zerou: e-mail vira
// PRIMEIRO toque para quem nunca recebeu WhatsApp. Diferente de --todos, mantem a protecao
// de quem ja respondeu em qualquer canal.
const PRIMEIRO_TOQUE = process.argv.includes("--primeiro-toque");
// Deal que "respondeu" no WhatsApp mas era so saudacao automatica (bot). Erick, 14/09/2026:
// "se for bot, manda email". Ids passados a mao depois de ler as mensagens recebidas.
const LIBERAR = new Set((arg("liberar") || "").split(",").map(Number).filter(Boolean));

const lixo = (e) => {
  const v = String(e || "").trim().toLowerCase();
  if (!v.includes("@") || v.length < 6) return true;
  // placeholders de template de site: "seuemail@email.com.br", "contact@mysite.com"
  return /^(seuemail|seu-email|email|exemplo|example|nome|contact)@|@(mysite|example|dominio|seusite)\./.test(v);
};

// Hard bounce/spam nao pode voltar na fila do dia seguinte: o build nasce dos deals,
// entao sem esta lista o endereco morto reaparece a cada rebuild.
const blocklist = lerBlocklist();
const indiceDominios = indiceBlocklistPorDominio(blocklist);

// "Lost" so porque o numero nao tem WhatsApp NAO e lost pra e-mail (18/09/2026). O
// pull-city-serper encadeia descartar-sem-whatsapp.mjs, que marca stage=lost +
// blocker=sem_whatsapp|sem_telefone pra fila do WhatsApp nao entupir; isso escondia 1009
// deals (549 com site, 313 com CNPJ) do canal onde eles sao o publico ideal: nunca foram
// abordados, entao nao existe risco de dois canais na mesma pessoa. Recusa explicita
// (loss_reason_code) continua lost. --sem-lost-whatsapp volta ao comportamento antigo.
const LOST_SEM_WHATSAPP = !process.argv.includes("--sem-lost-whatsapp");
const lostSoPorCanal = (d) => d.stage === "lost" && ["sem_whatsapp", "sem_telefone"].includes(d.blocker) && !d.loss_reason_code;

const fila = [];
const descartes = { lost: 0, lostSemWhatsappIncluido: 0, naoAbordado: 0, jaRespondeu: 0, semEmail: 0, terceiro: 0, incerto: 0, bloqueado: 0, jaEnviado: 0, mesmaCasa: 0 };

for (const d of deals) {
  if (d.stage === "lost") {
    if (!(LOST_SEM_WHATSAPP && lostSoPorCanal(d))) { descartes.lost++; continue; }
    descartes.lostSemWhatsappIncluido++;
  }
  if (!TODOS) {
    if (!PRIMEIRO_TOQUE && !abordados.has(d.id)) { descartes.naoAbordado++; continue; }
    if (responderam.has(d.id) && !LIBERAR.has(d.id)) { descartes.jaRespondeu++; continue; }
  }
  const c = contactForDeal(d, contatoPorId) || {};
  // Os dois enderecos passam pelo validador e o PRIMEIRO aprovado vence. Antes o build
  // pegava o primeiro nao-vazio e, se ele fosse nfe@ ou contador, o lead caia inteiro
  // mesmo tendo um segundo e-mail bom (18/09/2026). O validador tambem pega typo de
  // dominio, artefato do extrator, caixa errada e dominio sem MX, que antes so o bounce
  // real revelava.
  const candidatos = [d.email_receita, c.email].filter((e) => !lixo(e));
  if (!candidatos.length) { descartes.semEmail++; continue; }
  let q = null;
  let ultimo = null;
  for (const cand of candidatos) {
    const r = await validarEmail(cand, { decisorNome: d.decisor_nome, empresa: d.company, siteUrl: d.site_url, blocklist, indiceDominios });
    ultimo = r;
    if (r.ok) { q = r; break; }
  }
  if (!q) { descartes[ultimo.classe] = (descartes[ultimo.classe] || 0) + 1; continue; }
  const destino = q.email;

  const email = montarEmail({ empresa: d.company, decisorNome: d.decisor_nome, setor: d.setor, cidade: c.city, dealId: d.id });
  const v = violacoes(`${email.subject}\n${email.text}`);
  if (v.length) {
    console.error(`ABORTADO: copy do deal #${d.id} viola o playbook: ${v.join(", ")}`);
    process.exit(1);
  }

  fila.push({
    dealId: d.id,
    contactId: c.id ?? null,
    email: String(destino).trim().toLowerCase(),
    company: d.company,
    setor: d.setor,
    classe: q.classe,
    motivo: q.motivo,
    semSite: !d.site_url,
    score: Number(d.points) || 0,
    scoreEmail: q.score,
    subject: email.subject,
    html: email.html,
  });
}

// dedup por e-mail: duas empresas do mesmo dono compartilham caixa.
const vistos = new Set();
const unicos = [];
for (const q of fila) {
  if (vistos.has(q.email)) continue;
  vistos.add(q.email);
  unicos.push(q);
}

// Duas limpezas contra o sent_log, e elas sao DIFERENTES:
//
// 1) jaEnviado  = mesmo endereco que ja recebeu. O brevo_send tambem pula, mas ai a
//    fila mente sobre o tamanho: mostrava 40 quando so 19 eram gente nova.
// 2) mesmaCasa  = endereco novo num dominio que ja recebeu. Foi o caso da INDAMETAL,
//    que levou atendimento@ num dia e compras@ no outro. Dois e-mails em 24h para a
//    mesma empresa e o tipo de coisa que faz marcarem spam.
//
// Freemail fica de fora da regra 2: gmail.com repetido nao e a mesma empresa.
const FREEMAIL = new Set(['gmail.com', 'hotmail.com', 'outlook.com', 'live.com', 'yahoo.com', 'yahoo.com.br',
  'icloud.com', 'aol.com', 'msn.com', 'bol.com.br', 'uol.com.br', 'terra.com.br', 'ig.com.br', 'globo.com']);
const dominioDe = (e) => String(e || '').split('@')[1]?.toLowerCase() || '';
const jaEnviados = (() => {
  try { return Object.keys(JSON.parse(fs.readFileSync('sent_log.json', 'utf8'))).map((e) => e.toLowerCase()); } catch { return []; }
})();
const jaEnviadosNoCrm = activities
  .filter((activity) => activity.type === "email_sent")
  .map((activity) => recipientFromActivityDescription(activity.description))
  .filter(Boolean);
const enderecosUsados = new Set([...jaEnviados, ...jaEnviadosNoCrm]);
const dominiosUsados = new Set(jaEnviados.map(dominioDe).filter((d) => d && !FREEMAIL.has(d)));
for (const email of jaEnviadosNoCrm) {
  const dominio = dominioDe(email);
  if (dominio && !FREEMAIL.has(dominio)) dominiosUsados.add(dominio);
}

const novos = [];
const casasRepetidas = [];
for (const q of unicos) {
  if (enderecosUsados.has(q.email)) { descartes.jaEnviado++; continue; }
  const dom = dominioDe(q.email);
  if (dom && !FREEMAIL.has(dom) && dominiosUsados.has(dom)) {
    descartes.mesmaCasa++;
    casasRepetidas.push(`${q.company} <${q.email}>`);
    continue;
  }
  if (dom && !FREEMAIL.has(dom)) dominiosUsados.add(dom);
  novos.push(q);
}
unicos.length = 0;
unicos.push(...novos);
// decisor nominal na frente, depois o score do e-mail (dominio proprio, caixa viva),
// depois o score do lead.
unicos.sort((a, b) => (a.classe === "decisor" ? -1 : 0) - (b.classe === "decisor" ? -1 : 0) || b.scoreEmail - a.scoreEmail || b.score - a.score);
const final = LIMITE ? unicos.slice(0, LIMITE) : unicos;

salvarCacheMx();
fs.writeFileSync("email_queue.json", JSON.stringify(final, null, 1), "utf8");
console.log(`Fila: ${final.length} e-mails únicos (setor: ${SETORES.join(", ")})`);
console.log(
  `Descartados -> lost=${descartes.lost} (lost so por falta de WhatsApp, INCLUIDOS: ${descartes.lostSemWhatsappIncluido}) naoAbordado=${descartes.naoAbordado} ` +
    `jaRespondeu=${descartes.jaRespondeu} semEmail=${descartes.semEmail} ` +
    `terceiro=${descartes.terceiro || 0} incerto=${descartes.incerto || 0} ` +
    `bloqueado=${descartes.bloqueado} jaEnviado=${descartes.jaEnviado} mesmaCasa=${descartes.mesmaCasa}`,
);
if (casasRepetidas.length) {
  console.log(`\nMesma casa (domínio já abordado, ficaram de fora):`);
  for (const c of casasRepetidas) console.log(`  - ${c}`);
  console.log('');
}
if (TODOS) console.log(`--todos: SEM regra de canal (inclui quem já respondeu no WhatsApp).`);
else if (PRIMEIRO_TOQUE) console.log(`--primeiro-toque: inclui quem nunca recebeu WhatsApp; quem JÁ respondeu segue protegido.`);
else console.log(`Regra de canal: só quem JÁ recebeu WhatsApp e NUNCA respondeu (--primeiro-toque libera os nunca abordados).`);
console.log(`Classes na fila: ${["decisor", "empresa"].map((k) => `${k}=${final.filter((f) => f.classe === k).length}`).join(" | ")}`);
console.log(`Arquivo: ${process.cwd()}/email_queue.json`);
console.log(`\nTeste:   node brevo_send.mjs --test=SEU@EMAIL`);
console.log(`Disparo: node brevo_send.mjs --limit=10`);
