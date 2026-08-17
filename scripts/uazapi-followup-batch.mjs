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
import salesPlaybookModule from "../src/lib/salesPlaybook.mjs";
import { fetchAllPages } from "./lib/supabaseRest.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { renderFollowupMessage } = salesPlaybookModule;
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
const IDS = new Set(arg("ids", "").split(",").map(Number).filter(Boolean));
const EXCLUDE_IDS = new Set(arg("exclude-ids", "").split(",").map(Number).filter(Boolean));
const JSON_OUT = arg("json-out", "");

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
function followupMessage(tier, company, ehBot, segment, city) {
  return renderFollowupMessage({
    tier,
    company,
    segment,
    city,
    responseType: ehBot ? "bot" : "sem_resposta",
  });
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
    fetchAllPages(supa, "deals?stage=in.(abordado,followup)&select=id,company,segment"),
    fetchAllPages(supa, "contacts?select=id,phone,whatsapp_site,whatsapp_jid,city"),
    fetchAllPages(supa,
      "activities?type=in.(whatsapp_sent,whatsapp_sent_sync,whatsapp_received)&select=deal_id,type,description,created_at&order=created_at.asc",
    ),
  ]);

  const porId = Object.fromEntries(contatos.map((c) => [c.id, c]));
  // Mesma barreira do primeiro disparo: jid confirmado ou numero publicado no site.
  // Celular vindo apenas do Maps nao e suficiente para automacao; precisa passar
  // primeiro pelo check da Uazapi ou ser encontrado no canal oficial da empresa.
  const canal = (c) => {
    if (c?.whatsapp_jid) return String(c.whatsapp_jid).split("@")[0];
    if (c?.whatsapp_site) return String(c.whatsapp_site).replace(/\D/g, "");
    return null;
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
      return { ...d, fone: celular, dias, tier, ehBot: h.bots > 0, toques: h.saidas, cidade: porId[d.id]?.city };
    })
    .filter(Boolean)
    .filter((d) => !TIER_FILTRO || d.tier === TIER_FILTRO)
    .filter((d) => IDS.size === 0 || IDS.has(d.id))
    .filter((d) => !EXCLUDE_IDS.has(d.id))
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
  const activity = await supa("activities", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ deal_id: dealId, type: "whatsapp_sent", description: `Follow-up ${tier} para ${empresa}` }),
  });
  const stage = await supa(`deals?id=eq.${dealId}&stage=eq.abordado`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ stage: "followup" }),
  });
  return activity.ok && stage.ok;
}

(async () => {
  if (GO && JSON_OUT) {
    console.error("--json-out e exclusivo da preparacao em dry-run; remova --go.");
    process.exit(1);
  }
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
  // So whatsapp_sent: whatsapp_sent_sync e conversa vinda do aparelho, nao prospeccao
  // fria, e costuma nem ter deal (em 17/08/2026 uma conversa de 14 mensagens com
  // deal_id NULL levou o contador a 38/40 e matou o lote da tarde). Espelha
  // uazapi-send-batch.mjs -- mudar aqui obriga a mudar la.
  const hoje = await fetchAllPages(
    supa,
    `activities?type=eq.whatsapp_sent&created_at=gte.${inicio.toISOString()}&select=id,deal_id`,
  );
  // Deal com is_prospect=false tambem nao gasta teto (achado de 07/08/2026).
  // Filtro em JS e nao com deal_id=not.in.(...) no PostgREST: la a atividade sem deal
  // sairia da conta junto, porque NOT IN com NULL da NULL.
  const naoProspect = await fetchAllPages(supa, "deals?is_prospect=is.false&select=id");
  const fora = new Set(Array.isArray(naoProspect) ? naoProspect.map((d) => d.id) : []);
  const jaHoje = Array.isArray(hoje) ? hoje.filter((a) => !fora.has(a.deal_id)).length : 0;
  const restaHoje = Math.max(0, TETO_DIA - jaHoje);
  if (GO && restaHoje === 0) {
    console.log(`\nTeto do dia atingido (${jaHoje}/${TETO_DIA}), somando disparo e follow-up. Nada a enviar.`);
    return;
  }

  const fila = await carregarFila();
  const porTier = fila.reduce((a, d) => ({ ...a, [d.tier]: (a[d.tier] || 0) + 1 }), {});
  const lote = fila.slice(0, Math.min(LIMITE, JSON_OUT ? LIMITE : restaHoje));
  console.log(`Enviados hoje (disparo + follow-up): ${jaHoje}/${TETO_DIA}`);

  console.log(`\nFila de follow-up: ${fila.length} ${JSON.stringify(porTier)} | lote: ${lote.length} | modo: ${GO ? "ENVIO REAL" : "dry-run"}\n`);
  lote.forEach((l, i) => {
    const texto = followupMessage(l.tier, l.company, l.ehBot, l.segment, l.cidade);
    console.log(`[${i + 1}] ${l.tier}${l.ehBot ? "/bot" : ""} D+${l.dias} #${l.id} ${l.company} -> ${l.fone}`);
    if (!GO) console.log("    " + texto + "\n");
  });

  if (JSON_OUT) {
    const destino = path.resolve(RAIZ, JSON_OUT);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, JSON.stringify({
      kind: "followup",
      generatedAt: new Date().toISOString(),
      ids: lote.map((lead) => lead.id),
      candidates: lote.map((lead) => ({ id: lead.id, company: lead.company, tier: lead.tier })),
    }, null, 2) + "\n");
    console.log(`Candidatos gravados em ${destino}.`);
  }

  if (!GO) {
    console.log("\nDry-run. Nada foi enviado. Rode de novo com --go para disparar.");
    return;
  }

  let falhas = 0;
  let enviados = 0;
  for (let i = 0; i < lote.length; i++) {
    const l = lote[i];
    const r = await enviar(l.fone, followupMessage(l.tier, l.company, l.ehBot, l.segment, l.cidade));
    if (r.ok) {
      falhas = 0;
      const logou = await registrar(l.id, l.company, l.tier);
      console.log(`${hhmm()} OK   ${l.tier} #${l.id} ${l.company}`);
      if (!logou) {
        console.error("Envio confirmado, mas o CRM nao registrou a atividade. Parando para nao ultrapassar o teto real.");
        process.exitCode = 2;
        break;
      }
      enviados++;
    } else {
      falhas++;
      console.log(`${hhmm()} FALHA #${l.id} ${l.company} -> ${r.status} ${JSON.stringify(r.corpo).slice(0, 110)}`);
      if (falhas >= 2) {
        console.error("\nDuas falhas seguidas. Parando: e o primeiro sinal de bloqueio.");
        process.exitCode = 2;
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
