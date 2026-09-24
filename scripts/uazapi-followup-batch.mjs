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
import { conferirCanal } from "./lib/canalWhatsapp.mjs";
import { segmentoVetado } from "./lib/analise-comum.mjs";

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
// Teto de SAIDA DO NUMERO: prospeccao + conversa do aparelho somadas. Existe porque o
// WhatsApp conta o numero, nao a fila do CRM.
const TETO_NUMERO = Number(arg("teto-numero", 40));
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
// Concorrente direto da Jotta (origin_detail = "concorrente_jotta", base de ICP de
// Monlevade de 15/09) nunca le o nome da Jotta: o M2 desses cita so a Metalthec.
const caseOnlyDe = (originDetail) => (originDetail === "concorrente_jotta" ? "metalthec" : null);

function followupMessage(tier, company, ehBot, segment, city, originDetail) {
  return renderFollowupMessage({
    tier,
    company,
    segment,
    city,
    caseOnly: caseOnlyDe(originDetail),
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
    // AMPLIADO em 18/08/2026 medindo as 388 respostas recebidas da base: dez
    // autoresponders passavam como resposta HUMANA e tiravam o lead da cadencia,
    // alem de inflar a taxa de resposta. Espelha src/lib/followup.ts (classify
    // InboundResponse) -- mudar aqui obriga a mudar la. Cada padrao veio de um caso
    // real: Blukit, Proeng, JP/F&T (IA da Meta), Tesla, Union, CASALTEC, Automacao
    // Monlevade, DM Refrigeracao e TOHRU.
    "aguardando atendimento",
    "que legal ter voc[êe] aqui",
    "n[ãa]o consigo ajudar com isso",
    "somos o RH",
    "informe seu nome",
    "somos a empresa",
    "estou aqui para oferecer",
    "n[ãa]o estamos dispon[íi]veis no momento",
    // Terceira pessoa de proposito: e a empresa falando de si. "estou à sua
    // disposição", que e humano, nao casa.
    "est[áa] a sua disposi[çc][ãa]o",
    // Segunda rodada: mensagens do MESMO autoresponder que escapavam por redacao.
    "horário de funcionamento|horario de funcionamento",
    "agrade[çc]o (o|seu|pelo) contato",
    "protocolo de chamado",
    // Menu interativo do WhatsApp Business; botao nunca e gente escrevendo.
    // [AudioMessage] fica de FORA de proposito: audio e humano e precisa ser ouvido.
    "\\[ButtonsMessage\\]|\\[ListMessage\\]",
  ].join("|"),
  "i",
);

async function carregarFila() {
  const [deals, contatos, acts] = await Promise.all([
    fetchAllPages(supa, "deals?stage=in.(abordado,followup)&select=id,company,segment,origin_detail"),
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
    const h = (hist[a.deal_id] = hist[a.deal_id] || { saidas: 0, humanas: 0, bots: 0, ultimaSaida: null, saidasDepoisBot: 0 });
    if (a.type === "whatsapp_received") {
      if (AUTORESPONDER.test(a.description || "")) h.bots++;
      else h.humanas++;
    } else {
      h.saidas++;
      h.ultimaSaida = a.created_at;
      if (h.bots > 0) h.saidasDepoisBot++;
    }
  }

  const agora = Date.now();
  return deals
    .map((d) => {
      const h = hist[d.id];
      const celular = canal(porId[d.id]);
      if (!h || !h.ultimaSaida || !celular) return null;
      if (h.humanas > 0) return null; // conversa viva: responder na mao, nunca automatizar
      if (segmentoVetado(d.segment, d.company)) return null; // refrigeracao/climatizacao, 24/09/2026
      const dias = Math.floor((agora - Date.parse(h.ultimaSaida)) / 86400000);
      const tier = tierForDays(dias);
      if (tier === "aguardar") return null;
      if (h.saidas >= 3) return null; // ja levou 3 toques: parar por respeito e por seguranca
      // Lead de autoresponder recebe o texto "bot" em QUALQUER degrau, entao o segundo
      // toque depois da saudacao automatica era o mesmo pedido de novo, palavra por
      // palavra. Em 24/09/2026 havia 14 leads que ja tinham levado o texto bot 2x sem
      // resposta humana e 24 na fila prestes a levar. O pedido do responsavel sai uma
      // vez; sem resposta humana depois dele, o lead sai do WhatsApp (e-mail assume).
      if (h.bots > 0 && h.saidasDepoisBot > 0) return null;
      return { ...d, fone: celular, dias, tier, ehBot: h.bots > 0, toques: h.saidas, cidade: porId[d.id]?.city };
    })
    .filter(Boolean)
    .filter((d) => !TIER_FILTRO || d.tier === TIER_FILTRO)
    .filter((d) => IDS.size === 0 || IDS.has(d.id))
    .filter((d) => !EXCLUDE_IDS.has(d.id))
    .sort((a, b) => b.dias - a.dias);
}

// Espelha uazapi-send-batch.mjs: .catch() no fetch inteiro, sem rede o fetch rejeita.
async function statusInstancia() {
  return fetch(`${BASE}/instance/status`, { headers: { token: TOKEN } })
    .then((r) => r.json())
    .catch(() => ({}));
}

// Risquinhos (24/09/2026). A Uazapi guarda o status de cada mensagem nossa no chat:
// "Sent" e um risquinho so (saiu do servidor, nao chegou no aparelho), "Delivered" e
// "Read" sao dois. Mensagem sem status nao conta pra lado nenhum. Chat sem historico
// (mensagem antiga ou enviada por outra instancia) devolve zero e nao afirma nada.
const ENTREGUE = /delivered|read|played/i;
async function entregaDoCanal(fone) {
  const d = String(fone).replace(/\D/g, "");
  // Mesmo numero em duas grafias, com e sem o nono digito: tenta as duas.
  const variantes = [d];
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") variantes.push(d.slice(0, 4) + d.slice(5));
  if (d.startsWith("55") && d.length === 12) variantes.push(`${d.slice(0, 4)}9${d.slice(4)}`);
  for (const v of variantes) {
    const corpo = await fetch(`${BASE}/message/find`, {
      method: "POST",
      headers: { token: TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ chatid: `${v}@s.whatsapp.net`, limit: 30 }),
    })
      .then((r) => r.json())
      .catch(() => ({}));
    const nossas = (corpo?.messages || []).filter((m) => m.fromMe && m.status);
    if (!nossas.length) continue;
    const entregues = nossas.filter((m) => ENTREGUE.test(m.status)).length;
    return { nossas: nossas.length, entregues, naoEntregues: nossas.length - entregues };
  }
  return { nossas: 0, entregues: 0, naoEntregues: 0 };
}

// Duas mensagens paradas num risquinho e nenhuma entregue: o numero nao recebe (ou
// bloqueou). O terceiro toque so queima o numero da Mydrion. Lost com blocker, sem
// loss_reason_code, para o e-mail continuar tratando o lead como vivo.
async function perderPorNaoEntrega(dealId, empresa, entrega) {
  const deal = await supa(`deals?id=eq.${dealId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ stage: "lost", blocker: "whatsapp_nao_entregue" }),
  });
  await supa("activities", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      deal_id: dealId,
      type: "stage_change",
      description: `${empresa} -> lost: ${entrega.naoEntregues} mensagens de WhatsApp paradas em um risquinho, nenhuma entregue`,
    }),
  });
  return deal.ok;
}

// Espelha uazapi-send-batch.mjs: queda de rede ganha nova tentativa em vez de matar o
// processo. Ver o comentario de la para o incidente de 02/09/2026.
async function enviar(fone, texto, tentativas = 3) {
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const r = await fetch(`${BASE}/send/text`, {
        method: "POST",
        headers: { token: TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ number: fone, text: texto, linkPreview: false }),
      });
      return { ok: r.ok, status: r.status, corpo: await r.json().catch(() => ({})) };
    } catch (erro) {
      const causa = erro?.cause?.code ?? erro?.message ?? String(erro);
      const ultima = tentativa === tentativas;
      console.log(`     rede falhou (${causa}) ${tentativa}/${tentativas}${ultima ? "" : ", nova tentativa em 15s"}`);
      if (ultima) return { ok: false, status: 0, corpo: { erro: causa } };
      await dormir(15000);
    }
  }
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
  const status = await statusInstancia();
  console.log(`Instancia: ${status?.instance?.status ?? "desconhecida"} (${status?.instance?.owner ?? "-"})`);
  if (GO && status?.instance?.status !== "connected") {
    // Exit 3 = instancia caida: o dispatcher espera a reconexao sem gastar tentativa.
    console.error("Instancia nao conectada. Aguardando reconexao.");
    process.exit(3);
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

  // GUARD DE SEGURANCA DO NUMERO (18/08/2026), coisa diferente do teto acima. Aqui
  // conta TUDO que saiu do numero hoje -- sync inclusive, sem tirar is_prospect=false
  // -- porque quem restringe a conta e o WhatsApp, e ele nao separa prospeccao de
  // conversa. Em 18/08 o teto de prospeccao marcou 35 e liberou a fila, mas o aparelho
  // tinha mandado outras 17: as 52 saidas derrubaram a instancia as 14:42 e a conta
  // ficou 24h sem poder iniciar conversa. Espelha uazapi-send-batch.mjs -- mudar aqui
  // obriga a mudar la.
  const saidasNumero = await fetchAllPages(
    supa,
    `activities?type=in.(whatsapp_sent,whatsapp_sent_sync)&created_at=gte.${inicio.toISOString()}&select=id`,
  );
  const jaNumero = Array.isArray(saidasNumero) ? saidasNumero.length : 0;
  const restaNumero = Math.max(0, TETO_NUMERO - jaNumero);
  if (GO && restaNumero === 0) {
    console.log(`\nTeto de saida do numero atingido (${jaNumero}/${TETO_NUMERO}), somando prospeccao e conversa do aparelho. Nada a enviar.`);
    return;
  }

  const fila = await carregarFila();
  const porTier = fila.reduce((a, d) => ({ ...a, [d.tier]: (a[d.tier] || 0) + 1 }), {});
  const alvo = Math.min(LIMITE, JSON_OUT ? LIMITE : Math.min(restaHoje, restaNumero));
  // Mesma conferencia do primeiro disparo (14/09/2026): o perfil do WhatsApp tem que
  // ser da empresa do card. Follow-up em numero errado repete o erro tres vezes -- a
  // Consertech (#1146) saiu de manha para um perfil "Omega Tech". Ver canalWhatsapp.mjs.
  const lote = [];
  const retidosCanal = [];
  const naoEntregues = [];
  for (const l of fila) {
    if (lote.length >= alvo) break;
    const canal = await conferirCanal(l.fone, l.company, { base: BASE, token: TOKEN });
    if (!canal.ok) {
      retidosCanal.push(`#${l.id} ${l.company} -> ${l.fone} (${canal.motivo}${canal.nome ? `: perfil "${canal.nome}"` : ""})`);
      continue;
    }
    // Uma mensagem sem entregar ganha a segunda tentativa; a segunda tambem parada,
    // o lead sai da cadencia.
    const entrega = await entregaDoCanal(l.fone);
    if (entrega.naoEntregues >= 2 && entrega.entregues === 0) {
      naoEntregues.push({ ...l, entrega });
      continue;
    }
    lote.push({ ...l, perfilWpp: canal.nome || "" });
  }
  console.log(`Enviados hoje (disparo + follow-up): ${jaHoje}/${TETO_DIA} | saidas do numero: ${jaNumero}/${TETO_NUMERO}`);
  if (retidosCanal.length) {
    console.log(`Retidos pela conferencia do numero na Uazapi: ${retidosCanal.length} (corrigir whatsapp_site/whatsapp_jid no cadastro)`);
    retidosCanal.forEach((r) => console.log(`   ${r}`));
  }
  if (naoEntregues.length) {
    console.log(`Nao entregues (2+ mensagens num risquinho so): ${naoEntregues.length}${GO ? " -> lost" : " (com --go vao pra lost)"}`);
    for (const l of naoEntregues) {
      const perdeu = GO ? await perderPorNaoEntrega(l.id, l.company, l.entrega) : false;
      console.log(`   #${l.id} ${l.company} -> ${l.fone} (${l.entrega.naoEntregues} paradas)${GO ? (perdeu ? " LOST" : " FALHOU GRAVAR") : ""}`);
    }
  }

  console.log(`\nFila de follow-up: ${fila.length} ${JSON.stringify(porTier)} | lote: ${lote.length} | modo: ${GO ? "ENVIO REAL" : "dry-run"}\n`);
  lote.forEach((l, i) => {
    const texto = followupMessage(l.tier, l.company, l.ehBot, l.segment, l.cidade, l.origin_detail);
    console.log(`[${i + 1}] ${l.tier}${l.ehBot ? "/bot" : ""} D+${l.dias} #${l.id} ${l.company} -> ${l.fone}${l.perfilWpp ? ` (perfil: ${l.perfilWpp})` : ""}`);
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
    // Recheca a cada envio, nao so na largada: o lote leva horas para escoar e o Erick
    // conversa no celular no meio disso. Conferir uma vez no inicio nao pegaria.
    if (i > 0) {
      const agora = await fetchAllPages(
        supa,
        `activities?type=in.(whatsapp_sent,whatsapp_sent_sync)&created_at=gte.${inicio.toISOString()}&select=id`,
      );
      const saidas = Array.isArray(agora) ? agora.length : 0;
      if (saidas >= TETO_NUMERO) {
        console.error(`\n${hhmm()} Teto de saida do numero atingido (${saidas}/${TETO_NUMERO}). Parando para nao arriscar bloqueio.`);
        process.exitCode = 2;
        break;
      }
    }
    const r = await enviar(l.fone, followupMessage(l.tier, l.company, l.ehBot, l.segment, l.cidade, l.origin_detail));
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
      console.log(`${hhmm()} FALHA #${l.id} ${l.company} -> ${r.status} ${JSON.stringify(r.corpo).slice(0, 110)}`);
      // Instancia que caiu no meio do lote nao e bloqueio: exit 3, o dispatcher retoma.
      const agora = await statusInstancia();
      if (agora?.instance?.status !== "connected") {
        console.error(`\n${hhmm()} Instancia caiu no meio do lote (${agora?.instance?.status ?? "desconhecida"}). Aguardando reconexao.`);
        process.exitCode = 3;
        break;
      }
      falhas++;
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
