/**
 * Gate Thiago Finch (Story 064, P7 do checklist de 24/09/2026). Qualquer "nao" retem.
 *
 * Por lead (antes de entrar em lote):
 *   1. passou pelos quatro gates (fit industrial, capacidade, acesso, oferta)?
 *   2. a oferta corresponde ao tier (Tier A nunca le R$1.000; Tier B nunca le a faixa do site)?
 *   3. fala com quem decide ou encaminha (bot retem; gatekeeper encaminha, entao passa)?
 *   4. o degrau tem proximo passo objetivo definido no playbook?
 *   5. o custo humano da conversa cabe no ticket (toques manuais <= teto da oferta)?
 * Por lote (antes de volume novo):
 *   6. estamos medindo avanco, e o lote anterior do piloto esta todo classificado?
 *   7. nao ha resposta qualificada parada esperando o Erick?
 *   8. a matematica fecha (volume dentro do piloto, sem kill disparado) antes de escalar?
 *
 * Especificacao do clone Finch ajustada ao checklist: o criterio 3 diz "decidir OU
 * encaminhar", entao gatekeeper passa. decision_access incerto passa no primeiro contato
 * frio (reter zeraria a cadencia) e e resolvido na leitura da primeira resposta.
 */

import { ESTAGIOS_FRIOS, avaliarElegibilidadeProspeccao } from "./prospectingEligibility.mjs";
import { SALES_PLAYBOOK, ofertaDoLead, orcamentoHumanoDaOferta } from "./salesPlaybook.mjs";

const CONFIG = SALES_PLAYBOOK.finchGate;
const PILOTO = SALES_PLAYBOOK.pilot;

/** Brasil sem horario de verao desde 2019: Brasilia = UTC-3 o ano todo. */
const OFFSET_BRASILIA_MS = 3 * 3600000;
const INICIO_EXPEDIENTE = 8;
const FIM_EXPEDIENTE = 18;

/** Horas uteis (seg-sex, 8h-18h de Brasilia) entre dois instantes. */
export function horasUteisEntre(inicioIso, fimIso) {
  const inicio = Date.parse(inicioIso);
  const fim = Date.parse(fimIso);
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) return 0;
  let total = 0;
  // Anda por dia util em horario de Brasilia; no maximo 60 dias para nao virar laco longo.
  const dia = new Date(inicio - OFFSET_BRASILIA_MS);
  dia.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 60 && dia.getTime() + OFFSET_BRASILIA_MS < fim; i += 1) {
    const semana = dia.getUTCDay();
    if (semana !== 0 && semana !== 6) {
      const abre = dia.getTime() + OFFSET_BRASILIA_MS + INICIO_EXPEDIENTE * 3600000;
      const fecha = dia.getTime() + OFFSET_BRASILIA_MS + FIM_EXPEDIENTE * 3600000;
      const de = Math.max(abre, inicio);
      const ate = Math.min(fecha, fim);
      if (ate > de) total += (ate - de) / 3600000;
    }
    dia.setUTCDate(dia.getUTCDate() + 1);
  }
  return total;
}

/**
 * Resposta qualificada parada: o lead respondeu como humano (ou esta no fundo do funil),
 * falou por ultimo e ficou mais que N horas uteis sem resposta nossa. Anti-ICP em estagio
 * frio nao conta: resposta de refrigeracao nao e resposta qualificada, e o destino dela e a
 * carta naoForaIcp (24/09/2026: 78 "paradas", boa parte de climatizacao e refrigeracao).
 */
export function respostasQualificadasParadas(deals, agoraIso = new Date().toISOString(), config = CONFIG.stalledReply) {
  const tipos = new Set(config.responseTypes);
  const fundo = new Set(config.funnelStages);
  return (deals ?? [])
    .filter((deal) => deal && deal.stage !== "lost" && deal.stage !== "won")
    .filter((deal) => tipos.has(String(deal.response_type ?? "")) || fundo.has(String(deal.stage ?? "")))
    .filter((deal) => {
      if (!ESTAGIOS_FRIOS.includes(String(deal.stage ?? ""))) return true;
      if (deal.is_icp === false) return false;
      return !/anti-ICP/i.test(avaliarElegibilidadeProspeccao(deal).eligibility_reason);
    })
    .map((deal) => {
      const inbound = Date.parse(deal.last_inbound_at ?? "");
      const outbound = Date.parse(deal.last_outbound_at ?? "");
      if (!Number.isFinite(inbound)) return null;
      if (Number.isFinite(outbound) && outbound >= inbound) return null;
      const horas = horasUteisEntre(deal.last_inbound_at, agoraIso);
      if (horas <= config.businessHours) return null;
      return { id: Number(deal.id), company: String(deal.company ?? deal.name ?? ""), stage: deal.stage, horasUteis: Math.round(horas * 10) / 10 };
    })
    .filter(Boolean)
    .sort((a, b) => b.horasUteis - a.horasUteis);
}

function criterio(id, titulo, ok, motivo) {
  return { id, titulo, ok, motivo };
}

const MENCIONA_R1000 = /r\$\s*1\.?000\b|\{\{setupprice\}\}/i;
const MENCIONA_FAIXA_SITE = /r\$\s*1\.?800\b|a partir de r\$/i;

/**
 * @param {object} lead deal com os campos da regua (is_icp, porte, capacity_tier...)
 * @param {{ degrau?: string, mensagem?: string, toquesManuais?: number }} contexto
 */
export function avaliarGateFinchLead(lead, contexto = {}) {
  if (lead?.segment === "eventos") {
    return {
      aprovado: true,
      criterios: [criterio("vertical", "Vertical propria", true, "casa de evento: regua e oferta proprias, fora do gate industrial")],
    };
  }

  const elegibilidade = lead?.prospectingEligibility ?? avaliarElegibilidadeProspeccao(lead);
  const oferta = ofertaDoLead({ capacity_tier: elegibilidade.capacity_tier, offer_track: elegibilidade.offer_track });
  const acesso = elegibilidade.decision_access;
  const acessoBloqueado = CONFIG.blockedDecisionAccess.includes(acesso);
  const mensagem = String(contexto.mensagem ?? "");

  const c1 = criterio(
    "quatroGates",
    "O lead passou pelos quatro gates?",
    elegibilidade.eligible && !acessoBloqueado && Boolean(oferta),
    elegibilidade.eligible
      ? acessoBloqueado ? `acesso ${acesso}` : oferta ? `fit, capacidade ${elegibilidade.capacity_tier}, acesso ${acesso}, oferta ${oferta.key}` : "sem oferta compativel"
      : elegibilidade.eligibility_reason,
  );

  let ofertaOk = Boolean(oferta) && oferta.tier === elegibilidade.capacity_tier;
  let ofertaMotivo = oferta ? `${oferta.name} para ${oferta.tier}` : "sem oferta para o tier";
  if (ofertaOk && oferta.key === "projectOffer" && MENCIONA_R1000.test(mensagem)) {
    ofertaOk = false;
    ofertaMotivo = "Tier A com o preco de R$1.000 na mensagem";
  }
  if (ofertaOk && oferta.key === "offer" && MENCIONA_FAIXA_SITE.test(mensagem)) {
    ofertaOk = false;
    ofertaMotivo = "Tier B com a faixa do site na mensagem (as duas faixas nunca na mesma peca)";
  }
  const c2 = criterio("ofertaDoTier", "A oferta corresponde ao tier?", ofertaOk, ofertaMotivo);

  const c3 = criterio(
    "decisor",
    "Estamos falando com alguem capaz de decidir ou encaminhar?",
    !acessoBloqueado,
    acessoBloqueado ? `acesso ${acesso}: bot nao decide nem encaminha` : `acesso ${acesso}`,
  );

  const degrau = String(contexto.degrau ?? "msg1");
  const proximo = CONFIG.nextSteps[degrau];
  const c4 = criterio("proximoPasso", "O proximo passo e objetivo?", Boolean(proximo), proximo ?? `degrau ${degrau} sem proximo passo definido`);

  const orcamento = oferta ? orcamentoHumanoDaOferta(oferta.key) : null;
  const toques = Math.max(0, Number(contexto.toquesManuais ?? 0));
  const cabe = Boolean(orcamento) && toques <= orcamento.maxManualTouches;
  const c5 = criterio(
    "custoHumano",
    "O custo humano da conversa cabe no ticket?",
    cabe,
    orcamento ? `${toques} de ${orcamento.maxManualTouches} toques manuais que a margem de ${Math.round(SALES_PLAYBOOK[oferta.key].operatingCaps.minimumContributionMargin * 100)}% comporta` : "oferta sem teto operacional",
  );

  const criterios = [c1, c2, c3, c4, c5];
  return { aprovado: criterios.every((item) => item.ok), criterios, oferta };
}

/**
 * @param {{ deals: object[], agoraIso?: string, pedido?: Record<string, number>, pilotoAnterior?: object|null }} entrada
 *   pilotoAnterior: saida de scripts/pilot-report.mjs ({ tiers: { governante: { kill, scale, pendentesClassificacao } } })
 */
export function avaliarGateFinchLote({ deals, agoraIso = new Date().toISOString(), pedido = {}, pilotoAnterior = null }) {
  const avanco = ["reconhecimento", "preco_apresentado", "proposta", "venda"].every((metrica) => PILOTO.metrics.includes(metrica));
  const pendentes = Object.values(pilotoAnterior?.tiers ?? {}).reduce((soma, tier) => soma + Number(tier?.pendentesClassificacao ?? 0), 0);
  const c6 = criterio(
    "medindoAvanco",
    "Estamos medindo avanco, nao apenas resposta?",
    avanco && pendentes === 0,
    !avanco ? "metricas do piloto sem avanco de funil" : pendentes ? `${pendentes} resposta(s) do lote anterior sem classificacao` : "metricas de avanco definidas e lote anterior classificado",
  );

  const paradas = respostasQualificadasParadas(deals, agoraIso);
  const c7 = criterio(
    "respostasParadas",
    "Nao ha volume novo enquanto existirem respostas qualificadas paradas?",
    paradas.length === 0,
    paradas.length ? `${paradas.length} resposta(s) qualificada(s) esperando: ${paradas.slice(0, 5).map((p) => `#${p.id} ${p.company} (${p.horasUteis}h uteis)`).join(", ")}` : "nenhuma resposta qualificada parada",
  );

  const estouros = [];
  for (const [tier, quantidade] of Object.entries(pedido)) {
    const teto = Number(PILOTO.perTier[tier] ?? 0);
    const regra = pilotoAnterior?.tiers?.[tier];
    if (regra?.kill) estouros.push(`${tier}: kill disparado no piloto anterior (${regra.killMotivo ?? "ver relatorio"})`);
    else if (Number(quantidade) > teto && !regra?.scale) estouros.push(`${tier}: ${quantidade} pedidos acima do piloto (${teto}) sem condicao de scale`);
  }
  const c8 = criterio(
    "matematica",
    "A matematica fecha antes de escalar?",
    estouros.length === 0,
    estouros.length ? estouros.join("; ") : "volume dentro do piloto e sem kill",
  );

  const criterios = [c6, c7, c8];
  return { aprovado: criterios.every((item) => item.ok), criterios, paradas };
}

export function resumoGateFinch(resultado) {
  const falhas = resultado.criterios.filter((item) => !item.ok);
  return falhas.length ? `RETIDO: ${falhas.map((item) => `${item.id} (${item.motivo})`).join(" | ")}` : "OK";
}

const finchGate = { avaliarGateFinchLead, avaliarGateFinchLote, horasUteisEntre, respostasQualificadasParadas, resumoGateFinch };
export default finchGate;
