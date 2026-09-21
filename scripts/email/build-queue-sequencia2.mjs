/**
 * build-queue-sequencia2.mjs
 * Monta a fila do SEGUNDO e-mail da sequencia fria: so quem abriu ou clicou no e-mail 1
 * (eventos do Brevo) e nao respondeu em canal nenhum. Dry-run por padrao; --go grava.
 *
 *   node build-queue-sequencia2.mjs --days=11 --dias=2026-09-22,2026-09-23 --corte=2026-09-16
 *   node build-queue-sequencia2.mjs ... --go
 *
 * --days    janela do brevo-events (quantos dias de envio do e-mail 1 olhar)
 * --dias    dias de disparo. Quem clicou e quem recebeu o e-mail 1 ANTES de --corte vai no
 *           primeiro dia; o resto vai no segundo (o e-mail 2 sai 3 a 5 dias depois do 1).
 * --liberar ids de deal que "responderam" no WhatsApp mas era so bot (saudacao automatica);
 *           quem respondeu de verdade fica de fora, igual ao build do frio.
 * --excluir ids de deal fora por decisao (ja em negociacao, handoff, recusa).
 *
 * Saida: email_queue_seq2_<dia>.json por dia. O brevo_send.mjs le com --queue= e --log=sent_log_seq2.json.
 * Assunto A/B alternado por posicao entre quem so abriu; quem clicou tem assunto proprio.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { montarEmail2, violacoes2 } from "./copy-sequencia2.mjs";
import { estaBloqueado, lerBlocklist } from "./blocklist.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k, def) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=").slice(1).join("=") : def; };
const GO = args.includes("--go");
const DAYS = parseInt(arg("days", "11"), 10) || 11;
const DIAS = arg("dias", "").split(",").map((s) => s.trim()).filter(Boolean);
const CORTE = arg("corte", "");
const LIBERAR = new Set(arg("liberar", "").split(",").map((s) => Number(s.trim())).filter(Boolean));
const EXCLUIR = new Set(arg("excluir", "").split(",").map((s) => Number(s.trim())).filter(Boolean));
if (DIAS.length < 1 || DIAS.length > 2) throw new Error("Use --dias=AAAA-MM-DD[,AAAA-MM-DD] (um ou dois dias).");
if (DIAS.length === 2 && !/^\d{4}-\d{2}-\d{2}$/.test(CORTE)) throw new Error("Com dois dias, --corte=AAAA-MM-DD separa quem vai em cada um.");

const env = Object.fromEntries(
  fs.readFileSync("D:/001Gravity/CRM ERICK/.env", "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const SB_URL = env.SUPABASE_URL;
const SBH = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
async function sb(query) {
  const r = await fetch(`${SB_URL}/rest/v1/${query}`, { headers: SBH });
  if (!r.ok) throw new Error(`${r.status} ${query}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
// PostgREST corta em 1000 sem avisar: paginar sempre.
async function sbTodos(query) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = await sb(`${query}${query.includes("?") ? "&" : "?"}offset=${from}&limit=1000`);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

// 1) Eventos do Brevo: quem abriu ou clicou, sem bounce.
const ev = spawnSync(process.execPath, [path.join(AQUI, "brevo-events.mjs"), `--days=${DAYS}`, "--json"], { cwd: AQUI, encoding: "utf8" });
if (ev.status !== 0) throw new Error(`brevo-events falhou: ${ev.stderr.slice(0, 300)}`);
const evJson = JSON.parse(ev.stdout.slice(ev.stdout.indexOf("{")));
const engajados = evJson.linhas.filter((l) => (l.aberto || l.clicou || /abriu|CLICOU/.test(l.status)) && !/bounce|adiado/i.test(l.status));

// 2) CRM: o e-mail 1 de cada endereco (deal, contato, classe) e quem respondeu.
const enviosCrm = await sbTodos("activities?type=eq.email_sent&created_at=gte.2026-09-08&select=deal_id,contact_id,description,metadata,created_at&order=created_at.asc");
const envioPorEmail = {};
for (const a of enviosCrm) {
  const m = String(a.description || "").match(/[\w.+-]+@[\w.-]+\.\w+/);
  if (!m) continue;
  const email = m[0].toLowerCase();
  envioPorEmail[email] ??= { dealId: a.deal_id, contactId: a.contact_id, classe: a.metadata?.classe || null, enviadoEm: a.created_at };
}
const dealIds = [...new Set(engajados.map((l) => envioPorEmail[l.email.toLowerCase()]?.dealId).filter(Boolean))];
const deals = dealIds.length ? await sbTodos(`deals?id=in.(${dealIds.join(",")})&select=id,company,stage,setor,segment,decisor_nome,site_url`) : [];
const dealPorId = Object.fromEntries(deals.map((d) => [d.id, d]));
const respostas = dealIds.length
  ? await sbTodos(`activities?type=in.(whatsapp_received,email_received)&deal_id=in.(${dealIds.join(",")})&select=deal_id,type`)
  : [];
const respondeu = new Map();
for (const a of respostas) respondeu.set(a.deal_id, (respondeu.get(a.deal_id) || new Set()).add(a.type));

// 3) Filtros.
const blocklist = lerBlocklist();
const logSeq2Path = path.join(AQUI, "sent_log_seq2.json");
const jaLevouSeq2 = fs.existsSync(logSeq2Path) ? JSON.parse(fs.readFileSync(logSeq2Path, "utf8")) : {};
const ESTAGIOS_FORA = new Set(["lost", "qualified", "negotiation", "proposal", "won"]);
const descartes = { semDeal: 0, handoff: 0, estagio: 0, excluido: 0, respondeuHumano: 0, bloqueado: 0, jaLevouSeq2: 0 };
const publico = [];
for (const l of engajados) {
  const email = l.email.toLowerCase();
  const envio = envioPorEmail[email];
  if (!envio) { descartes.semDeal++; continue; }
  if (envio.classe === "handoff_whatsapp") { descartes.handoff++; continue; }
  const d = dealPorId[envio.dealId];
  if (!d) { descartes.semDeal++; continue; }
  if (EXCLUIR.has(d.id)) { descartes.excluido++; continue; }
  if (ESTAGIOS_FORA.has(d.stage)) { descartes.estagio++; continue; }
  const tipos = respondeu.get(d.id);
  if (tipos && (tipos.has("email_received") || !LIBERAR.has(d.id))) { descartes.respondeuHumano++; continue; }
  if (estaBloqueado(email, blocklist)) { descartes.bloqueado++; continue; }
  if (jaLevouSeq2[email]) { descartes.jaLevouSeq2++; continue; }
  publico.push({ email, deal: d, contactId: envio.contactId, enviadoEm: envio.enviadoEm, clicou: !!l.clicou });
}

// 4) Dia de envio: quem clicou e quem recebeu o e-mail 1 antes do corte vao no primeiro dia.
const diaDe = (p) => (DIAS.length === 1 || p.clicou || p.enviadoEm.slice(0, 10) < CORTE ? DIAS[0] : DIAS[1]);
publico.sort((a, b) => Number(b.clicou) - Number(a.clicou) || a.email.localeCompare(b.email));

// 5) Copy, A/B e guarda.
const filas = Object.fromEntries(DIAS.map((d) => [d, []]));
const contadorAB = Object.fromEntries(DIAS.map((d) => [d, 0]));
const problemas = [];
for (const p of publico) {
  const dia = diaDe(p);
  const variante = p.clicou ? "A" : contadorAB[dia]++ % 2 === 0 ? "A" : "B";
  const e = montarEmail2({ empresa: p.deal.company, decisorNome: p.deal.decisor_nome, segment: p.deal.segment, email: p.email, clicou: p.clicou, variante });
  const v = violacoes2(`${e.subject}\n${e.text}`);
  if (v.length) problemas.push(`${p.deal.company} <${p.email}>: ${v.join(", ")}`);
  filas[dia].push({
    dealId: p.deal.id,
    contactId: p.contactId ?? null,
    email: p.email,
    company: p.deal.company,
    setor: p.deal.setor,
    classe: `sequencia_2_${e.variante}`,
    sequencia: 2,
    dia,
    semSite: !p.deal.site_url,
    subject: e.subject,
    html: e.html,
    text: e.text,
  });
}
if (problemas.length) {
  console.error("ABORTADO: copy violou o playbook em:\n  " + problemas.join("\n  "));
  process.exit(1);
}

// 6) Relatorio e gravacao.
console.log(`Engajados no Brevo (abriu ou clicou, sem bounce): ${engajados.length}`);
console.log(`Descartes: ${Object.entries(descartes).map(([k, v]) => `${k}=${v}`).join(" | ")}`);
console.log(`Publico: ${publico.length} (clicaram ${publico.filter((p) => p.clicou).length})`);
for (const dia of DIAS) {
  const f = filas[dia];
  const porClasse = f.reduce((a, i) => { a[i.classe] = (a[i.classe] || 0) + 1; return a; }, {});
  console.log(`\n${dia}: ${f.length} e-mails | ${Object.entries(porClasse).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  for (const i of f) console.log(`  #${String(i.dealId).padEnd(5)} ${i.classe.padEnd(16)} ${i.company.slice(0, 38).padEnd(38)} <${i.email}>  "${i.subject}"`);
}
const amostra = [publico.find((p) => p.clicou), publico.find((p) => !p.clicou)].filter(Boolean);
for (const p of amostra) {
  const item = filas[diaDe(p)].find((i) => i.email === p.email);
  console.log(`\n--- AMOSTRA ${item.classe} (${item.company}) ---\nASSUNTO: ${item.subject}\n\n${item.text}`);
}
if (!GO) { console.log("\nDry-run. Nada gravado. Rode com --go para gravar as filas."); process.exit(0); }
for (const dia of DIAS) {
  const out = path.join(AQUI, `email_queue_seq2_${dia}.json`);
  fs.writeFileSync(out, JSON.stringify(filas[dia], null, 2), "utf8");
  console.log(`Gravado ${out} (${filas[dia].length})`);
}
