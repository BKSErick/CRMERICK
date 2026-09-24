/**
 * Metricas do piloto 20 Tier A + 20 Tier B (Story 065, P8). Puro: recebe o que o script
 * leu do banco e devolve o placar por tier, com kill e scale do playbook. Taxa de resposta
 * aparece, mas e secundaria: o que decide e avanco de funil.
 *
 * De onde vem cada metrica (todas de campo que ja existe, nada novo no banco):
 *   decisor_alcancado  decision_access decisor/indicado, ou decisor indicado registrado
 *   reconhecimento     mensagem recebida com ai_intent = sinal_forte
 *   case_aceito        depois de uma mensagem nossa com link de case, o lead respondeu com
 *                      sinal forte, sinal fraco ou pergunta
 *   preco_apresentado  mensagem nossa com preco (mesma regra do funil operacional)
 *   entrada_producao   reuniao marcada/feita ou estagio de agendamento em diante
 *   proposta / venda   estagio proposal+ / won
 *   motivo_perda       loss_reason_code do deal perdido
 */

import { SALES_PLAYBOOK } from "./salesPlaybook.mjs";

const PRECO_ENVIADO = /R\$\s?\d|\d\s?\/\s?m[eê]s|\bmensal(idade)?\b.*\d/i;
const LINK_DE_CASE = /site-metalthec\.vercel\.app|sitejotta\.vercel\.app|gthousesp\.com\.br/i;
const CASE_ACEITO = new Set(["sinal_forte", "sinal_fraco", "pergunta"]);
const ENTRADA = new Set(["agendamento", "reuniao", "proposal", "negotiation", "won"]);
const PROPOSTA = new Set(["proposal", "negotiation", "won"]);
const REUNIAO_VALIDA = new Set(["scheduled", "confirmed", "held"]);
const RESPOSTA_HUMANA = new Set(["humana", "objecao", "encaminhamento"]);
/** M3 sai em D+10: depois disso o lote pode ser julgado pelo kill de reconhecimento. */
const DIAS_PARA_ENCERRAR = 10;

function vazio() {
  return {
    leads: 0,
    respondeu: 0,
    decisor_alcancado: 0,
    reconhecimento: 0,
    case_aceito: 0,
    preco_apresentado: 0,
    entrada_producao: 0,
    proposta: 0,
    venda: 0,
    motivo_perda: {},
    pendentesClassificacao: 0,
  };
}

/**
 * @param {{ leads: {id:number, tier:string}[], deals: object[], messages: object[], meetings: object[], primeiroEnvio?: Record<number,string>, agoraIso?: string }} entrada
 */
export function metricasDoPiloto({ leads, deals, messages, meetings, primeiroEnvio = {}, agoraIso = new Date().toISOString() }) {
  const regras = SALES_PLAYBOOK.pilot.rules;
  const dealPorId = new Map(deals.map((deal) => [Number(deal.id), deal]));
  const mensagensPorDeal = new Map();
  for (const mensagem of messages) {
    const id = Number(mensagem.deal_id);
    if (!mensagensPorDeal.has(id)) mensagensPorDeal.set(id, []);
    mensagensPorDeal.get(id).push(mensagem);
  }
  for (const lista of mensagensPorDeal.values()) lista.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const reunioes = new Set(
    meetings.filter((evento) => evento.kind === "reuniao" && REUNIAO_VALIDA.has(evento.meeting_status)).map((evento) => Number(evento.deal_id)),
  );

  /** @type {Record<string, ReturnType<typeof vazio> & { kill?: boolean, killMotivo?: string | null, scale?: boolean, regra?: { kill?: string, scale?: string } }>} */
  const tiers = {};
  for (const lead of leads) {
    const placar = (tiers[lead.tier] ??= vazio());
    const deal = dealPorId.get(Number(lead.id)) ?? {};
    const lista = mensagensPorDeal.get(Number(lead.id)) ?? [];
    const recebidas = lista.filter((m) => m.direction === "received");
    const enviadas = lista.filter((m) => m.direction === "sent");
    placar.leads += 1;

    const humanas = recebidas.filter((m) => m.ai_intent !== "automatica");
    if (humanas.length || RESPOSTA_HUMANA.has(String(deal.response_type ?? ""))) placar.respondeu += 1;
    if (["decisor", "indicado"].includes(String(deal.decision_access ?? "")) || deal.referred_name) placar.decisor_alcancado += 1;
    if (recebidas.some((m) => m.ai_intent === "sinal_forte")) placar.reconhecimento += 1;

    const primeiroCase = enviadas.find((m) => LINK_DE_CASE.test(String(m.content ?? "")));
    if (primeiroCase && recebidas.some((m) => String(m.created_at) > String(primeiroCase.created_at) && CASE_ACEITO.has(m.ai_intent))) {
      placar.case_aceito += 1;
    }
    if (enviadas.some((m) => PRECO_ENVIADO.test(String(m.content ?? "")))) placar.preco_apresentado += 1;
    if (reunioes.has(Number(lead.id)) || ENTRADA.has(String(deal.stage ?? ""))) placar.entrada_producao += 1;
    if (PROPOSTA.has(String(deal.stage ?? ""))) placar.proposta += 1;
    if (deal.stage === "won") placar.venda += 1;
    if (deal.stage === "lost") {
      const motivo = String(deal.loss_reason_code ?? "sem_motivo");
      placar.motivo_perda[motivo] = (placar.motivo_perda[motivo] ?? 0) + 1;
    }
    // Classificar cada resposta antes do proximo lote: mensagem recebida sem leitura tipada.
    if (recebidas.some((m) => !m.ai_intent)) placar.pendentesClassificacao += 1;
  }

  const agora = Date.parse(agoraIso);
  const envios = Object.values(primeiroEnvio).map((iso) => Date.parse(iso)).filter(Number.isFinite);
  const encerrado = envios.length > 0 && envios.every((t) => (agora - t) / 86400000 >= DIAS_PARA_ENCERRAR);

  for (const [tier, placar] of Object.entries(tiers)) {
    const regra = regras[tier] ?? {};
    const motivos = [];
    if (encerrado && placar.reconhecimento < Number(regra.killMinRecognitions ?? 0)) {
      motivos.push(`${placar.reconhecimento} reconhecimento(s) em ${placar.leads}, abaixo de ${regra.killMinRecognitions}`);
    }
    if (regra.killProposalsWithoutProduction && placar.proposta - placar.venda >= regra.killProposalsWithoutProduction && placar.venda === 0) {
      motivos.push(`${placar.proposta} proposta(s) sem entrada em producao`);
    }
    if (regra.killPricesWithoutSale && placar.preco_apresentado >= regra.killPricesWithoutSale && placar.venda === 0) {
      motivos.push(`${placar.preco_apresentado} preco(s) apresentado(s) sem venda`);
    }
    placar.kill = motivos.length > 0;
    placar.killMotivo = motivos.join("; ") || null;
    placar.scale = !placar.kill && placar.reconhecimento >= Number(regra.killMinRecognitions ?? 3) && placar.venda >= 1;
    placar.regra = { kill: regra.kill, scale: regra.scale };
  }

  return { pilotVersion: SALES_PLAYBOOK.pilot.version, encerrado, tiers };
}

const pilotMetrics = { metricasDoPiloto };
export default pilotMetrics;
