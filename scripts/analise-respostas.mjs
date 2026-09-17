/**
 * analise-respostas.mjs
 * Leitura do TODO: o que os leads estao respondendo a msg 1, por versao de copy.
 *
 * Diferente do analise-conversas.mjs (por segmento, com rubrica Schwartz), este
 * relatorio e cru e literal: lista cada thread que teve resposta humana, mostra
 * qual msg 1 foi enviada, o que o lead respondeu (texto integral, truncado) e o
 * que o Erick mandou depois. Serve pra ler o padrao das respostas antes de mexer
 * no playbook (ex.: existe degrau pro "nao"?).
 *
 * Classificacao da PRIMEIRA resposta humana (heuristica, pra contar, nao pra decidir):
 *   encaminhamento  vCard / "fala com fulano" / "responsavel"
 *   negativa        "nao precisamos", "cliente vem pessoalmente", "ja temos"...
 *   pergunta        "?", "quanto", "valor", "exemplo", "portfolio"...
 *   positiva        "sim", "acontece", "pode mandar", "tenho interesse"...
 *   outro           nao casou nada
 *
 * USO:
 *   node scripts/analise-respostas.mjs           # resumo no terminal + data/analise-respostas.md
 *   node scripts/analise-respostas.mjs --so-negativas
 *
 * O .md cita conversa de lead: fica em data/ e e gitignored de proposito.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { carregarEnv, clienteSupabase, ehProspect, ehOrfao, pct } from "./lib/analise-comum.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
carregarEnv(RAIZ);
const db = clienteSupabase();
const SO_NEGATIVAS = process.argv.includes("--so-negativas");

const AUTORESPONDER =
  /agradece|obrigado (por|pelo) (seu )?contato|seja bem-vind|responderemos|assistente virtual|em breve (um|nossa)|hor[aá]rio de atendimento|como podemos ajudar|mensagem autom[aá]tica|digite (o n[uú]mero|uma op)|menu/i;

const RE = {
  encaminhamento:
    /fala com|falar com|fale com|respons[aá]vel|entrar em contato com|contato d[oa]|passa (pro|pra)|encaminh|repass|s[oó]cio|dono [eé]|propriet/i,
  negativa:
    /\b(n[aã]o|nao)\b[^.!?]*\b(precis|interess|tem|temos|quer|obrigad|vem|procura|pessoal|momento|agora|trabalh|us|fa[zç])|sem interesse|j[aá] tem(os)?\b|j[aá] possu|pessoalmente|n[aã]o obrigad|desnecess|n[aã]o[, ]+obrigad|remov|parar de|n[aã]o mand|bloque|indica[çc][aã]o s[oó]|s[oó] (por )?indica/i,
  pergunta:
    /\?|quanto|valor|pre[çc]o|custo|como funciona|o que (é|e|voc[eê]|vc)|faz (esse|isso)|exemplo|portf[oó]lio|mostra|me explica|qual|como (seria|fica)/i,
  positiva:
    /\bsim\b|acontece|verdade|isso mesmo|com certeza|pode (mandar|enviar)|\bmanda\b|me envia|me manda|tenho interesse|\bquero\b|vamos|bora|\bclaro\b|beleza|\bok\b|gostaria|interessante|legal|bacana|top\b|show/i,
};

function classifica(msg) {
  if (!msg) return "outro";
  if (/contact/i.test(msg.message_type || "")) return "encaminhamento";
  const t = msg.content || "";
  if (RE.encaminhamento.test(t)) return "encaminhamento";
  if (RE.negativa.test(t)) return "negativa";
  if (RE.pergunta.test(t)) return "pergunta";
  if (RE.positiva.test(t)) return "positiva";
  return "outro";
}

function versaoMsg1(texto) {
  const t = texto || "";
  if (/trabalho com presen[çc]a digital/i.test(t)) return "v4 presenca-digital";
  if (/fa[çc]o p[aá]gina de vendas pra ind[uú]stria/i.test(t)) return "v3 pagina-de-vendas";
  if (/pedido do cliente chegar|servi[çc]o, medida e prazo/i.test(t)) return "v2 promessa-fechada";
  if (/Separei um exemplo|Quer ver\?/i.test(t)) return "v1 quer-ver";
  if (/An[aá]lise r[aá]pida|Fiz uma an[aá]lise/i.test(t)) return "v0 analise-rapida";
  return "outra";
}

const dt = (iso) => {
  if (!iso) return "??/??";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const corta = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

// A msg 1 NAO esta na tabela messages: o disparo automatico vira uma activity
// whatsapp_sent ("Disparo automatico para X [copy/variante]") com copy_version no
// metadata desde o experimento v1 (10/08/2026). Follow-ups M2/M3 tambem sao
// activities. A tabela messages so tem o que o webhook sincronizou: resposta do
// lead e o que o Erick digitou depois. Entao: universo = deals com activity de
// disparo; conversa = messages.
const [deals, mensagens, disparos] = await Promise.all([
  db.get(
    "deals?select=id,name,company,segment,stage,status,response_type,copy_variant,experiment_id,site_url,is_prospect,origin_detail,value,next_action_type,next_action_at,copy_text",
  ),
  db.get(
    "messages?deal_id=not.is.null&select=deal_id,direction,content,message_type,occurred_at,created_at&order=occurred_at.asc",
  ),
  db.get("activities?type=eq.whatsapp_sent&select=deal_id,description,created_at,metadata&order=created_at.asc"),
]);

const porDeal = new Map();
for (const m of mensagens) {
  if (!porDeal.has(m.deal_id)) porDeal.set(m.deal_id, []);
  porDeal.get(m.deal_id).push(m);
}
const disparosPorDeal = new Map();
for (const a of disparos) {
  if (!disparosPorDeal.has(a.deal_id)) disparosPorDeal.set(a.deal_id, []);
  disparosPorDeal.get(a.deal_id).push(a);
}
const ehMsg1 = (a) => /^Disparo/i.test(a.description || "");
const ehFollowup = (a) => /^Follow-up/i.test(a.description || "");
const INICIO_EXPERIMENTO = "2026-08-10";

function versaoDoDisparo(a, deal) {
  const meta = a.metadata || {};
  if (meta.copy_version) return `${meta.copy_version} (${(meta.experiment_id || "").replace("wa-opening-", "")})`;
  if (String(a.created_at) < INICIO_EXPERIMENTO) return "pre-experimento (jul/ago)";
  // Sem metadata depois do experimento: cai no regex da copy congelada do deal.
  return `sem-metadata ~${versaoMsg1(deal.copy_text)}`;
}

const threads = [];
for (const d of deals) {
  if (d.is_prospect === false) continue;
  if (!ehProspect(d.company, d.name) || ehOrfao(d.company, d.name)) continue;
  const acts = disparosPorDeal.get(d.id) || [];
  const msg1 = acts.find(ehMsg1) || acts.find((a) => !ehFollowup(a));
  if (!msg1) continue;
  const followups = acts.filter(ehFollowup).map((a) => (a.description.match(/Follow-up (M\d)/i) || [])[1] || "M?");
  const msgs = (porDeal.get(d.id) || []).slice().sort((a, b) =>
    String(a.occurred_at || a.created_at).localeCompare(String(b.occurred_at || b.created_at)),
  );
  const enviadas = msgs.filter((m) => m.direction === "sent");
  const recebidas = msgs.filter((m) => m.direction === "received");
  const humanas = recebidas.filter(
    (m) => (m.content && m.content.trim() && !AUTORESPONDER.test(m.content)) || /contact/i.test(m.message_type || ""),
  );
  const primeiraResposta = humanas[0] || null;
  const ultima = msgs[msgs.length - 1];
  threads.push({
    deal: d,
    msgs,
    enviadas,
    humanas,
    msg1,
    followups,
    soBot: recebidas.length > 0 && humanas.length === 0,
    versao: versaoDoDisparo(msg1, d),
    categoria: primeiraResposta ? classifica(primeiraResposta) : null,
    aguardandoErick: !!primeiraResposta && ultima && ultima.direction === "received",
    respondeuDepois:
      !!primeiraResposta && enviadas.some((e) => String(e.occurred_at) > String(primeiraResposta.occurred_at)),
  });
}

// ---------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------
const responderam = threads.filter((t) => t.humanas.length);
const cont = (arr, fn) => arr.reduce((acc, x) => ((acc[fn(x)] = (acc[fn(x)] || 0) + 1), acc), {});
const CATS = ["positiva", "pergunta", "encaminhamento", "negativa", "outro"];

const L = [];
L.push(`# Analise de respostas — ${new Date().toLocaleDateString("pt-BR")}`);
L.push("");
L.push(`Deals com msg 1 disparada (prospect real): **${threads.length}**`);
L.push(`Responderam (humano, sem bot): **${responderam.length}** (${pct(responderam.length / Math.max(1, threads.length))})`);
L.push(`So bot respondeu: ${threads.filter((t) => t.soBot).length}`);
L.push(
  `Receberam follow-up: M2 ${threads.filter((t) => t.followups.includes("M2")).length}, M3 ${threads.filter((t) => t.followups.includes("M3")).length}; responderam DEPOIS de um follow-up: ${
    responderam.filter((t) => {
      const fu = (disparosPorDeal.get(t.deal.id) || []).filter(ehFollowup)[0];
      return fu && String(t.humanas[0].occurred_at) > String(fu.created_at);
    }).length
  }`,
);
L.push(`Aguardando resposta do Erick (ultima msg e do lead): **${responderam.filter((t) => t.aguardandoErick).length}**`);
L.push(`Erick respondeu depois da 1a resposta: ${responderam.filter((t) => t.respondeuDepois).length} de ${responderam.length}`);
L.push("");

L.push("## Por versao da msg 1");
L.push("");
L.push("| versao msg 1 | enviadas | responderam | taxa | positiva | pergunta | encaminh. | negativa | outro |");
L.push("|---|---|---|---|---|---|---|---|---|");
const versoes = [...new Set(threads.map((t) => t.versao))].sort();
for (const v of versoes) {
  const tv = threads.filter((t) => t.versao === v);
  const rv = tv.filter((t) => t.humanas.length);
  const c = cont(rv, (t) => t.categoria);
  L.push(
    `| ${v} | ${tv.length} | ${rv.length} | ${pct(rv.length / Math.max(1, tv.length))} | ${CATS.map((k) => c[k] || 0).join(" | ")} |`,
  );
}
L.push("");

L.push("## Estagio de quem respondeu");
L.push("");
const est = cont(responderam, (t) => `${t.deal.stage}/${t.deal.status}`);
for (const [k, v] of Object.entries(est).sort((a, b) => b[1] - a[1])) L.push(`- ${k}: ${v}`);
L.push("");

L.push("## response_type (campo do CRM) de quem respondeu");
L.push("");
const rt = cont(responderam, (t) => t.deal.response_type || "?");
for (const [k, v] of Object.entries(rt).sort((a, b) => b[1] - a[1])) L.push(`- ${k}: ${v}`);
L.push("");

// ---------------------------------------------------------------------------
// Threads na integra
// ---------------------------------------------------------------------------
function blocoThread(t) {
  const d = t.deal;
  const B = [];
  B.push(
    `### #${d.id} ${d.company || d.name} · ${d.segment || "?"} · site: ${d.site_url ? "sim" : "nao"} · ${t.versao} · ${d.stage}/${d.status} · rt=${d.response_type} · cat=**${t.categoria}**${t.aguardandoErick ? " · ⏳ AGUARDANDO ERICK" : ""}${d.value ? ` · R$${d.value}` : ""}`,
  );
  B.push(`- ⇒ ${dt(t.msg1.created_at)} msg 1 (${t.versao})${t.followups.length ? " · follow-ups: " + t.followups.join(", ") : ""}`);
  for (const m of t.msgs) {
    const bot = m.direction === "received" && m.content && AUTORESPONDER.test(m.content) && !/contact/i.test(m.message_type || "");
    const tipo = /contact/i.test(m.message_type || "") ? " [vCard]" : "";
    const seta = m.direction === "sent" ? "→" : bot ? "🤖" : "←";
    const texto = m.direction === "sent" ? corta(m.content, 110) : corta(m.content, 260);
    B.push(`- ${seta} ${dt(m.occurred_at || m.created_at)}${tipo} ${texto}`);
  }
  B.push("");
  return B.join("\n");
}

const ordem = (a, b) => {
  const ia = CATS.indexOf(a.categoria);
  const ib = CATS.indexOf(b.categoria);
  if (ia !== ib) return ia - ib;
  return String(b.humanas[0].occurred_at).localeCompare(String(a.humanas[0].occurred_at));
};

if (SO_NEGATIVAS) {
  L.push("## Negativas na integra");
  L.push("");
  for (const t of responderam.filter((t) => t.categoria === "negativa").sort(ordem)) L.push(blocoThread(t));
} else {
  for (const cat of CATS) {
    const lista = responderam.filter((t) => t.categoria === cat).sort(ordem);
    if (!lista.length) continue;
    L.push(`## ${cat.toUpperCase()} (${lista.length})`);
    L.push("");
    for (const t of lista) L.push(blocoThread(t));
  }
}

const saida = path.join(RAIZ, "data", "analise-respostas.md");
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, L.join("\n"), "utf8");

// Terminal: so o resumo (o .md tem as conversas)
const fimResumo = L.findIndex((l) => l.startsWith("## POSITIVA") || l.startsWith("## Negativas"));
console.log(L.slice(0, fimResumo > 0 ? fimResumo : L.length).join("\n"));
console.log(`\nConversas na integra: ${saida}`);
