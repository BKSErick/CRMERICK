/**
 * uazapi-send-batch.mjs
 * Dispara um lote pequeno de mensagens de prospeccao pelo WhatsApp (Uazapi)
 * usando a copy que ja esta gravada em deals.copy_text.
 *
 * DEFAULT E DRY-RUN: sem --go ele so mostra quem receberia e o texto.
 *
 * USO:
 *   node scripts/uazapi-send-batch.mjs                 # dry-run, 10 leads da fila curada
 *   node scripts/uazapi-send-batch.mjs --go            # dispara de verdade (10)
 *   node scripts/uazapi-send-batch.mjs --go --dia-inteiro  # espalha o dia todo (inst. paga)
 *   node scripts/uazapi-send-batch.mjs --ids=491,900   # escolhe os leads na mao
 *   node scripts/uazapi-send-batch.mjs --go --force-hora  # ignora a janela de horario
 *
 * REGRAS ANTI-BLOQUEIO (decididas com o Erick em 31/07/2026):
 * - intervalo sorteado entre 90 e 240s, nunca fixo (cadencia fixa e digital de robo)
 * - pausa maior entre sub-blocos (5 + 5), em vez de 10 mensagens seguidas
 * - so em horario comercial de dia util
 * - para na hora se duas mensagens seguidas falharem (primeiro sinal de bloqueio)
 * - texto ja e personalizado por lead na origem (copy_text)
 *
 * O webhook da Uazapi ignora o que sai pela API (excludeMessages: wasSentByApi),
 * entao este script grava a atividade whatsapp_sent no CRM. E essa atividade que
 * move o card de prospect para abordado.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { avaliarLead, carregarAprovados } = createRequire(import.meta.url)("./lib/triagemLead.js");
// Preenchido em carregarFila: o que a triagem de porte/tipo segurou fora da fila.
let retidos = [];
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
// 10 por leva: duas levas automaticas (manha e tarde) mais o que o Erick manda na
// mao fecham a meta de 30 a 35 por dia. Bloco de 5 = duas metades com pausa no meio.
const LIMITE = Number(arg("limit", 10));
const IDS = arg("ids", "").split(",").map(Number).filter(Boolean);
const MIN_S = Number(arg("min", 90));
const MAX_S = Number(arg("max", 240));
const PAUSA_BLOCO_S = Number(arg("pausa", 420));
const TAM_BLOCO = Number(arg("bloco", 5));

// --- Modo dia inteiro (instancia paga) --------------------------------------
// Com a instancia gratis o envio tinha que ser em rajada, porque a conexao caia em
// poucas horas. Pagando, da para diluir: 40 mensagens espalhadas por 7 horas parecem
// uso humano, 40 em duas rajadas de 20 parecem robo. O padrao de tempo pesa mais que
// o total do dia.
const DIA_INTEIRO = process.argv.includes("--dia-inteiro");
const TETO_DIA = Number(arg("teto-dia", 40));
const TETO_HORA = Number(arg("teto-hora", 7));
// Espacamento alvo no modo dia inteiro. Sorteado entre os dois a cada envio, e nao
// um valor fixo: cadencia regular e a assinatura mais obvia de automacao.
const DIA_MIN_S = Number(arg("dia-min", 240));
const DIA_MAX_S = Number(arg("dia-max", 900));

const BASE = process.env.UAZAPI_BASE_URL;
const TOKEN = process.env.UAZAPI_INSTANCE_TOKEN;
const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BASE || !TOKEN || !SUPA || !KEY) {
  console.error("Faltam variaveis: UAZAPI_BASE_URL, UAZAPI_INSTANCE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const sorteio = (min, max) => Math.floor(min + Math.random() * (max - min));
const hhmm = (d = new Date()) => d.toTimeString().slice(0, 5);

function janelaOk() {
  const agora = new Date();
  const dia = agora.getDay();
  if (dia === 0 || dia === 6) return { ok: false, motivo: "fim de semana" };
  const min = agora.getHours() * 60 + agora.getMinutes();
  const manha = min >= 9 * 60 && min <= 11 * 60 + 30;
  const tarde = min >= 14 * 60 && min <= 17 * 60;
  if (!manha && !tarde) return { ok: false, motivo: `fora da janela (9h-11h30 / 14h-17h), agora sao ${hhmm(agora)}` };
  return { ok: true };
}

const supa = async (rota, init = {}) =>
  fetch(`${SUPA}/rest/v1/${rota}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });

// So dispara para a fila CURADA: deals com segment preenchido (usinagem, caldeiraria,
// manutencao, automacao, climatizacao). Sem isso o script pegava qualquer prospect com
// copy, inclusive eletricista autonomo e MEI que o filtro tinha descartado, e ainda com
// a copy antiga. Marcar o segmento no card e o que separa quem entra do que nao entra.
const SEGMENTOS_VALIDOS = "usinagem,caldeiraria,manutencao,automacao,climatizacao";

// Ordem de confianca do canal:
//   1) whatsapp_jid  -> confirmado pela propria Uazapi
//   2) whatsapp_site -> numero que a empresa publica no site, ou seja, o que ela escolheu atender
//   3) phone celular -> veio do Google Maps, costuma ser o fixo do escritorio
// Exigir so o item 3 descartava 73% da base. O scraper de sites recuperou 169 numeros,
// 117 deles diferentes do que estava cadastrado.
export function canalDoContato(c) {
  if (c?.whatsapp_jid) return String(c.whatsapp_jid).split("@")[0];
  if (c?.whatsapp_site) return String(c.whatsapp_site).replace(/\D/g, "");
  const dig = String(c?.phone || "").replace(/\D/g, "");
  return dig.length === 11 && dig[2] === "9" ? `55${dig}` : null;
}

async function carregarFila() {
  const filtro = IDS.length
    ? `id=in.(${IDS.join(",")})`
    : `stage=eq.prospect&segment=in.(${SEGMENTOS_VALIDOS})`;
  const deals = await (await supa(`deals?${filtro}&select=id,company,stage,copy_text,site_url`, { headers: { Range: "0-9999" } })).json();
  const contatos = await (await supa("contacts?select=id,phone,whatsapp_site,whatsapp_jid,reviews_count,site_url", { headers: { Range: "0-9999" } })).json();
  const porId = Object.fromEntries(contatos.map((c) => [c.id, c]));

  const fora = await carregarOptOuts();

  // Triagem de porte e tipo: comercio e rede caem em segmento industrial pela
  // classificacao do Maps, e ja chegaram a disparar (Lojas Singer, 06/08/2026).
  const aprovados = carregarAprovados(RAIZ);
  return deals
    .filter((d) => d.copy_text)
    .filter((d) => !fora.has(d.id))
    .filter((d) => {
      const c = porId[d.id] || {};
      const v = avaliarLead(
        { id: d.id, company: d.company, reviews: c.reviews_count, siteUrl: d.site_url || c.site_url },
        aprovados,
      );
      if (!v.ok) retidos.push(`#${d.id} ${d.company} (${v.motivo})`);
      return v.ok;
    })
    .map((d) => {
      const c = porId[d.id];
      // Numero confirmado primeiro. Disparar para numero que NAO existe no WhatsApp e
      // um dos sinais mais fortes de spam para a plataforma, porque usuario de verdade
      // nao fica escrevendo para numero inexistente.
      const confianca = c?.whatsapp_jid ? 3 : c?.whatsapp_site ? 2 : 1;
      return { ...d, fone: canalDoContato(c), confianca };
    })
    .filter((d) => d.fone)
    .filter((d) => IDS.length === 0 || IDS.includes(d.id))
    .sort((a, b) => b.confianca - a.confianca);
}

async function jaDisparado(dealId) {
  const r = await supa(`activities?deal_id=eq.${dealId}&type=in.(whatsapp_sent,whatsapp_sent_sync)&select=id&limit=1`);
  const j = await r.json();
  return Array.isArray(j) && j.length > 0;
}

// Quem pediu para parar NUNCA mais recebe mensagem. Isso nao e cortesia: denuncia de
// usuario e o que mais derruba numero, muito mais que volume. Insistir com quem ja
// recusou e a forma mais rapida de virar "spam" no botao do WhatsApp.
const OPT_OUT = /\b(n[aã]o (quero|tenho interesse|me interessa|insista)|pare de|para de me|sai(r)? da lista|remove|remover|descadastr|me tira|nao perturbe|n[aã]o envie|bloquear|spam|denunc)/i;

async function carregarOptOuts() {
  const acts = await (await supa(
    "activities?type=eq.whatsapp_received&select=deal_id,description",
    { headers: { Range: "0-9999" } },
  )).json();
  const fora = new Set();
  for (const a of Array.isArray(acts) ? acts : []) {
    if (a.deal_id && OPT_OUT.test(a.description || "")) fora.add(a.deal_id);
  }
  return fora;
}

// Conta no BANCO, nao na memoria do processo: se o script cair e for rodado de novo,
// o teto do dia continua valendo e ele nao recomeca do zero.
async function enviadosHoje() {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const r = await supa(
    `activities?type=in.(whatsapp_sent,whatsapp_sent_sync)&created_at=gte.${inicio.toISOString()}&select=created_at`,
    { headers: { Range: "0-9999" } },
  );
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

function naUltimaHora(lista) {
  const limite = Date.now() - 3600000;
  return lista.filter((a) => Date.parse(a.created_at) >= limite).length;
}

async function enviar(fone, texto) {
  const r = await fetch(`${BASE}/send/text`, {
    method: "POST",
    headers: { token: TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ number: fone, text: texto, linkPreview: false }),
  });
  const corpo = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, corpo };
}

// Grava direto no banco, NAO via /api/activities: aquela rota normaliza qualquer tipo
// vindo do cliente para "whatsapp_opened" (o desenho antigo so aceitava confirmacao de
// envio pelo webhook, que ignora o que sai pela API). Com isso o card nunca saia de
// prospect. Aqui o envio ja foi confirmado pela resposta da Uazapi, entao vale sent.
async function registrar(dealId, empresa) {
  const a = await supa("activities", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      deal_id: dealId,
      type: "whatsapp_sent",
      description: `Disparo automatico para ${empresa}`,
    }),
  });
  // prospect -> abordado. O .eq no filtro impede rebaixar quem ja avancou.
  await supa(`deals?id=eq.${dealId}&stage=eq.prospect`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ stage: "abordado" }),
  });
  return a.ok;
}

(async () => {
  const status = await (await fetch(`${BASE}/instance/status`, { headers: { token: TOKEN } })).json().catch(() => ({}));
  const conectada = status?.instance?.status === "connected";
  console.log(`Instancia: ${status?.instance?.status ?? "desconhecida"} (${status?.instance?.owner ?? "-"})`);
  if (GO && !conectada) {
    console.error("Instancia nao esta conectada. Abortado.");
    process.exit(1);
  }

  const janela = janelaOk();
  if (GO && !janela.ok && !FORCE_HORA) {
    console.error(`Fora da janela de disparo: ${janela.motivo}. Use --force-hora para ignorar.`);
    process.exit(1);
  }

  const fila = await carregarFila();

  // Teto do dia: no modo dia inteiro ele manda; no modo lote ele so impede estourar.
  const hoje = await enviadosHoje();
  const restaHoje = Math.max(0, TETO_DIA - hoje.length);
  // No dry-run o teto so avisa: da para conferir a fila de amanha depois de ter batido
  // o teto de hoje. Com --go ele barra de verdade.
  if (restaHoje === 0) {
    console.log(`\nTeto do dia atingido (${hoje.length}/${TETO_DIA}).`);
    if (GO) return;
    console.log("Dry-run segue so para voce conferir a fila; com --go nada seria enviado.\n");
  }
  const disponivel = restaHoje || LIMITE;
  const alvo = DIA_INTEIRO ? disponivel : Math.min(LIMITE, disponivel);

  const lote = [];
  for (const lead of fila) {
    if (lote.length >= alvo) break;
    if (await jaDisparado(lead.id)) continue;
    lote.push(lead);
  }

  const confirmados = lote.filter((l) => l.confianca === 3).length;
  console.log(`\nFila elegivel: ${fila.length} | ja enviados hoje: ${hoje.length}/${TETO_DIA} | lote: ${lote.length}`);
  if (retidos.length) {
    console.log(`Retidos pela triagem de porte/tipo: ${retidos.length} (liberar em data/triagem-aprovados.json)`);
    retidos.slice(0, 8).forEach((r) => console.log(`   ${r}`));
    if (retidos.length > 8) console.log(`   ... e mais ${retidos.length - 8}`);
  }
  console.log(`Numeros confirmados no lote: ${confirmados}/${lote.length} | modo: ${DIA_INTEIRO ? "DIA INTEIRO" : "lote"} ${GO ? "(ENVIO REAL)" : "(dry-run)"}\n`);
  lote.forEach((l, i) => {
    console.log(`[${i + 1}] #${l.id} ${l.company} -> ${l.fone}`);
    if (!GO) console.log(l.copy_text.split("\n").map((x) => "    " + x).join("\n") + "\n");
  });

  if (!GO) {
    console.log("\nDry-run. Nada foi enviado. Rode de novo com --go para disparar.");
    return;
  }

  let falhasSeguidas = 0;
  let enviados = 0;
  for (let i = 0; i < lote.length; i++) {
    const lead = lote[i];
    const r = await enviar(lead.fone, lead.copy_text);
    if (r.ok) {
      falhasSeguidas = 0;
      enviados++;
      const logou = await registrar(lead.id, lead.company);
      console.log(`${hhmm()} OK   #${lead.id} ${lead.company}${logou ? "" : " (atividade NAO registrada)"}`);
    } else {
      falhasSeguidas++;
      console.log(`${hhmm()} FALHA #${lead.id} ${lead.company} -> ${r.status} ${JSON.stringify(r.corpo).slice(0, 120)}`);
      if (falhasSeguidas >= 2) {
        console.error("\nDuas falhas seguidas. Parando agora: e o primeiro sinal de bloqueio.");
        break;
      }
    }

    if (i < lote.length - 1) {
      if (DIA_INTEIRO) {
        // Teto por hora: se ja bateu, espera virar a hora em vez de continuar. Rajada
        // concentrada e o que a plataforma enxerga, nao o total do dia.
        const daHora = naUltimaHora(await enviadosHoje());
        if (daHora >= TETO_HORA) {
          console.log(`     teto da hora (${daHora}/${TETO_HORA}). Pausa de 20min.`);
          await dormir(20 * 60 * 1000);
        }
        // Fora da janela comercial, dorme ate ela voltar em vez de encerrar: o processo
        // fica de pe o dia todo e retoma sozinho a tarde.
        while (!janelaOk().ok && !FORCE_HORA) {
          console.log(`     ${hhmm()} fora da janela, aguardando 15min...`);
          await dormir(15 * 60 * 1000);
        }
        const espera = sorteio(DIA_MIN_S, DIA_MAX_S);
        console.log(`     proximo em ${Math.round(espera / 60)}min...`);
        await dormir(espera * 1000);
      } else {
        const fimDoBloco = (i + 1) % TAM_BLOCO === 0;
        const espera = fimDoBloco ? PAUSA_BLOCO_S : sorteio(MIN_S, MAX_S);
        console.log(`     aguardando ${espera}s${fimDoBloco ? " (pausa entre blocos)" : ""}...`);
        await dormir(espera * 1000);
      }
    }
  }

  console.log(`\nEnviados: ${enviados}/${lote.length}.`);
})();