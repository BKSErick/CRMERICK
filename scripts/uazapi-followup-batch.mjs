/**
 * uazapi-followup-batch.mjs
 * Segundo toque em quem ja foi abordado e NAO respondeu nada.
 *
 * DEFAULT E DRY-RUN: sem --go ele so mostra quem receberia, a janela e o texto.
 *
 * USO:
 *   node scripts/uazapi-followup-batch.mjs                    # dry-run, 10 leads
 *   node scripts/uazapi-followup-batch.mjs --go               # dispara de verdade
 *   node scripts/uazapi-followup-batch.mjs --tier=M3 --go     # so os de breakup
 *   node scripts/uazapi-followup-batch.mjs --limit=20 --go
 *
 * JANELAS (mesma engine da tela, src/lib/followup.ts):
 *   M1 D+2 a D+4  retomada leve
 *   M2 D+5 a D+9  prova (case do segmento)
 *   M3 D+10+      breakup, que e o que mais faz gente voltar
 *   bot           quem so respondeu autoresponder: pede o nome do responsavel
 *
 * REGRAS: identicas ao disparo de primeira mensagem (intervalo sorteado, pausa entre
 * blocos, janela comercial, parada em duas falhas seguidas). Quem RESPONDEU alguma
 * coisa humana nunca entra aqui: esse merece resposta escrita a mao, nao automacao.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const linha of fs.readFileSync(path.join(RAIZ, ".env"), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const arg = (nome, padrao) => {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`));
  return a ? a.split("=")[1] : padrao;
};
const GO = process.argv.includes("--go");
const FORCE_HORA = process.argv.includes("--force-hora");
const LIMITE = Number(arg("limit", 10));
const TIER_FILTRO = arg("tier", "");
const MIN_S = Number(arg("min", 90));
const MAX_S = Number(arg("max", 240));
const PAUSA_BLOCO_S = Number(arg("pausa", 420));
const TAM_BLOCO = Number(arg("bloco", 5));
const TETO_DIA = Number(arg("teto-dia", 40));

const BASE = process.env.UAZAPI_BASE_URL;
const TOKEN = process.env.UAZAPI_INSTANCE_TOKEN;
const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !TOKEN || !SUPA || !KEY) {
  console.error("Faltam variaveis de ambiente (UAZAPI_*, SUPABASE_*).");
  process.exit(1);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const sorteio = (min, max) => Math.floor(min + Math.random() * (max - min));
const hhmm = (d = new Date()) => d.toTimeString().slice(0, 5);

function janelaOk() {
  const agora = new Date();
  if (agora.getDay() === 0 || agora.getDay() === 6) return { ok: false, motivo: "fim de semana" };
  const min = agora.getHours() * 60 + agora.getMinutes();
  if (!((min >= 540 && min <= 690) || (min >= 840 && min <= 1020))) {
    return { ok: false, motivo: `fora da janela (9h-11h30 / 14h-17h), agora sao ${hhmm(agora)}` };
  }
  return { ok: true };
}

const supa = async (rota, init = {}) =>
  fetch(`${SUPA}/rest/v1/${rota}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });

// Espelha tierForDays de src/lib/followup.ts (o script e .mjs e nao importa TS).
const tierForDays = (dias) => (dias < 2 ? "aguardar" : dias <= 4 ? "M1" : dias <= 9 ? "M2" : "M3");
const casoDoSegmento = (seg) =>
  seg === "usinagem" || seg === "caldeiraria"
    ? "uma metalúrgica de usinagem de precisão"
    : "uma empresa de manutenção industrial";

// Regra unica em lib/nomeEmpresa: a copia local aqui cortava na conjuncao e mandava
// "olhar como a By Tico Usinagem e aparece pra quem procura" no breakup.
const { nomeCurto } = createRequire(import.meta.url)("./lib/nomeEmpresa.js");

function followupMessage(tier, companyRaw, ehBot, segment) {
  const company = nomeCurto(companyRaw);
  if (ehBot) {
    return `Oi! Imagino que minha mensagem tenha caído no atendimento automático. Quem cuida do site da ${company} aí? Prefiro falar direto com essa pessoa pra não gerar retrabalho pra vocês.`;
  }
  if (tier === "M1") {
    return `Oi, Erick de novo. Te escrevi sobre a ${company} esses dias e imagino que tenha passado batido na correria. Só retomando: separei um exemplo de página que faz o comprador chegar já com o pedido definido. Quer que eu mande?`;
  }
  if (tier === "M2") {
    return `Oi! Um contexto rápido: fiz isso pra ${casoDoSegmento(segment)}, que atende indústria como vocês. O ponto era o mesmo, serviço bom e o comprador sem achar prova disso na internet. Te mando como ficou?`;
  }
  return `Oi! Vou parar de te escrever pra não virar chateação. Fica o registro: se um dia fizer sentido olhar como a ${company} aparece pra quem procura antes de pedir orçamento, é só me chamar aqui. Sucesso aí!`;
}

// Saudacao automatica de WhatsApp Business. A lista comecou curta ("agradece",
// "seja bem-vindo") e deixava passar os dois casos que hoje sao maioria: a saudacao
// personalizada com o nome da empresa ("Bem-vindo ao atendimento comercial da EMC
// Sistemas. Como podemos ajudar?") e a resposta escrita por IA, que cumprimenta pelo
// nome e devolve pergunta ("Ola, Erick! Agradeco o contato e o elogio a nossa
// reputacao..."). As duas liam como resposta HUMANA, entao o lead saia da cadencia
// automatica e ficava esperando resposta escrita a mao que nunca vinha: 6 leads
// presos assim em 06/08/2026. Medido na base: 53% das respostas sao so saudacao
// automatica, e a taxa aparente de 22,8% vira 9,5% quando so conta gente.
const AUTORESPONDER = new RegExp(
  [
    // Janela curta entre o verbo e o substantivo: pega "agradece seu contato",
    // "Agradeço o contato" e "Agradecemos pelo seu contato" sem atravessar frase.
    "agradec\\w+[^.!?\\n]{0,24}(contato|mensagem|interesse)",
    "obrigado (por|pelo)",
    "bem-?vind",
    "responderemos|retornaremos|em breve|horário de atendimento",
    "assistente (virtual|digital)|atendimento (comercial|virtual|automátic)",
    "em instantes|um de nossos atendentes|nossa equipe (vai|irá|entrará)",
    "como (podemos|posso) (te )?ajudar|em que (posso|podemos)",
    "digite \\d|escolha (uma|a) opção|selecione (uma|a) opção|menu de atendimento",
    "faça seu cadastro",
  ].join("|"),
  "i",
);

async function carregarFila() {
  const [deals, contatos, acts] = await Promise.all([
    (await supa("deals?stage=in.(abordado,followup)&select=id,company,segment", { headers: { Range: "0-9999" } })).json(),
    (await supa("contacts?select=id,phone,whatsapp_site,whatsapp_jid", { headers: { Range: "0-9999" } })).json(),
    (await supa(
      "activities?type=in.(whatsapp_sent,whatsapp_sent_sync,whatsapp_received)&select=deal_id,type,description,created_at&order=created_at.asc",
      { headers: { Range: "0-9999" } },
    )).json(),
  ]);

  const porId = Object.fromEntries(contatos.map((c) => [c.id, c]));
  // Mesma ordem do disparo: jid confirmado > numero publicado no site > celular do Maps.
  const canal = (c) => {
    if (c?.whatsapp_jid) return String(c.whatsapp_jid).split("@")[0];
    if (c?.whatsapp_site) return String(c.whatsapp_site).replace(/\D/g, "");
    const d = String(c?.phone || "").replace(/\D/g, "");
    return d.length === 11 && d[2] === "9" ? `55${d}` : null;
  };
  const hist = {};
  for (const a of acts) {
    if (!a.deal_id) continue;
    const h = (hist[a.deal_id] = hist[a.deal_id] || { saidas: 0, humanas: 0, bots: 0, ultimaSaida: null });
    if (a.type === "whatsapp_received") {
      if (AUTORESPONDER.test(a.description || "")) h.bots++;
      else h.humanas++;
    } else {
      h.saidas++;
      h.ultimaSaida = a.created_at;
    }
  }

  const agora = Date.now();
  return deals
    .map((d) => {
      const h = hist[d.id];
      const celular = canal(porId[d.id]);
      if (!h || !h.ultimaSaida || !celular) return null;
      if (h.humanas > 0) return null; // conversa viva: responder na mao, nunca automatizar
      const dias = Math.floor((agora - Date.parse(h.ultimaSaida)) / 86400000);
      const tier = tierForDays(dias);
      if (tier === "aguardar") return null;
      if (h.saidas >= 3) return null; // ja levou 3 toques: parar por respeito e por seguranca
      return { ...d, fone: celular, dias, tier, ehBot: h.bots > 0, toques: h.saidas };
    })
    .filter(Boolean)
    .filter((d) => !TIER_FILTRO || d.tier === TIER_FILTRO)
    .sort((a, b) => b.dias - a.dias);
}

async function enviar(fone, texto) {
  const r = await fetch(`${BASE}/send/text`, {
    method: "POST",
    headers: { token: TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ number: fone, text: texto, linkPreview: false }),
  });
  return { ok: r.ok, status: r.status, corpo: await r.json().catch(() => ({})) };
}

async function registrar(dealId, empresa, tier) {
  await supa("activities", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ deal_id: dealId, type: "whatsapp_sent", description: `Follow-up ${tier} para ${empresa}` }),
  });
  await supa(`deals?id=eq.${dealId}&stage=eq.abordado`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ stage: "followup" }),
  });
}

(async () => {
  const status = await (await fetch(`${BASE}/instance/status`, { headers: { token: TOKEN } })).json().catch(() => ({}));
  console.log(`Instancia: ${status?.instance?.status ?? "desconhecida"} (${status?.instance?.owner ?? "-"})`);
  if (GO && status?.instance?.status !== "connected") {
    console.error("Instancia nao conectada. Abortado.");
    process.exit(1);
  }
  const janela = janelaOk();
  if (GO && !janela.ok && !FORCE_HORA) {
    console.error(`Fora da janela: ${janela.motivo}. Use --force-hora para ignorar.`);
    process.exit(1);
  }

  // O teto diario e do NUMERO, nao do script: primeira mensagem e follow-up saem do
  // mesmo WhatsApp, entao os dois contam no mesmo orcamento do dia.
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const hoje = await (await supa(
    `activities?type=in.(whatsapp_sent,whatsapp_sent_sync)&created_at=gte.${inicio.toISOString()}&select=id`,
    { headers: { Range: "0-9999" } },
  )).json();
  const jaHoje = Array.isArray(hoje) ? hoje.length : 0;
  const restaHoje = Math.max(0, TETO_DIA - jaHoje);
  if (GO && restaHoje === 0) {
    console.log(`\nTeto do dia atingido (${jaHoje}/${TETO_DIA}), somando disparo e follow-up. Nada a enviar.`);
    return;
  }

  const fila = await carregarFila();
  const porTier = fila.reduce((a, d) => ({ ...a, [d.tier]: (a[d.tier] || 0) + 1 }), {});
  const lote = fila.slice(0, Math.min(LIMITE, restaHoje));
  console.log(`Enviados hoje (disparo + follow-up): ${jaHoje}/${TETO_DIA}`);

  console.log(`\nFila de follow-up: ${fila.length} ${JSON.stringify(porTier)} | lote: ${lote.length} | modo: ${GO ? "ENVIO REAL" : "dry-run"}\n`);
  lote.forEach((l, i) => {
    const texto = followupMessage(l.tier, l.company, l.ehBot, l.segment);
    console.log(`[${i + 1}] ${l.tier}${l.ehBot ? "/bot" : ""} D+${l.dias} #${l.id} ${l.company} -> ${l.fone}`);
    if (!GO) console.log("    " + texto + "\n");
  });

  if (!GO) {
    console.log("\nDry-run. Nada foi enviado. Rode de novo com --go para disparar.");
    return;
  }

  let falhas = 0;
  let enviados = 0;
  for (let i = 0; i < lote.length; i++) {
    const l = lote[i];
    const r = await enviar(l.fone, followupMessage(l.tier, l.company, l.ehBot, l.segment));
    if (r.ok) {
      falhas = 0;
      enviados++;
      await registrar(l.id, l.company, l.tier);
      console.log(`${hhmm()} OK   ${l.tier} #${l.id} ${l.company}`);
    } else {
      falhas++;
      console.log(`${hhmm()} FALHA #${l.id} ${l.company} -> ${r.status} ${JSON.stringify(r.corpo).slice(0, 110)}`);
      if (falhas >= 2) {
        console.error("\nDuas falhas seguidas. Parando: e o primeiro sinal de bloqueio.");
        break;
      }
    }
    if (i < lote.length - 1) {
      const fimBloco = (i + 1) % TAM_BLOCO === 0;
      const espera = fimBloco ? PAUSA_BLOCO_S : sorteio(MIN_S, MAX_S);
      console.log(`     aguardando ${espera}s${fimBloco ? " (pausa entre blocos)" : ""}...`);
      await dormir(espera * 1000);
    }
  }
  console.log(`\nEnviados: ${enviados}/${lote.length}.`);
})();