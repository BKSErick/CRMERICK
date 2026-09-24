/**
 * Regua de elegibilidade comercial da prospeccao.
 *
 * O score deixa de ser porteiro: ele so ordena quem ja passou por ICP, capacidade
 * e canal. Isso impede que um anti-ICP enriquecido (site, telefone, capital) compre
 * entrada na fila por acumulacao de pontos.
 *
 * Casas de evento sao uma vertical separada, com oferta e copy proprias. Elas nao
 * sao julgadas pelo ICP industrial e continuam elegiveis quando entram por uma fila
 * explicitamente montada para `segment=eventos`.
 */

const ANTI_ICP = [
  /serralher|calha|esquadria|port[aã]o|port[oõ]es|corrim[aã]o|guarda.?corpo|gradil/i,
  /marmoraria|granito|m[aá]rmore|vidra[çc]aria/i,
  /refrigera|climatiza|ar.?condicionado/i,
  /geladeira|lavadora|refrigerador|eletrodom[eé]stic/i,
  /automotiv|autope[çc]|funilaria|borracharia|lava.?jato/i,
  /seguran[çc]a eletr[oô]nica|cftv|alarme|c[aâ]mera/i,
  /com[eé]rcio varejista|loja autorizada|distribuidora|revenda|papelaria|supermercado/i,
  /educa[çc][aã]o|escola|faculdade|cl[ií]nica|consultoria|contabil|advocacia|imobili[aá]ri/i,
  /constru[çc][aã]o civil|reforma|residencial|predial/i,
];

const SINAL_INDUSTRIAL = [
  /usinag|tornearia|torno\b|ferramentaria|retific|fres(a|ar)|eletroeros|mandrilh/i,
  /caldeirar|metal[uú]rgic|metalmec[aâ]nic|artefatos? (de|estampados? de) metal/i,
  /manuten\S* industrial|mec[aâ]nica industrial|automa[çc][aã]o industrial/i,
  /fabrica[çc][aã]o|ind[uú]stria|industrial|siderurg|minera[çc][aã]o|fundi[çc][aã]o/i,
  /hidr[aá]ulic|pneum[aá]tic|redutor|empilhadeira|guincho|talha\b/i,
];

function textoDoLead(lead) {
  return [lead?.company, lead?.name, lead?.segment, lead?.segment_norm, lead?.cnae_descricao]
    .filter(Boolean)
    .join(" ");
}

function acessoAoDecisor(lead) {
  const atual = String(lead?.decision_access || "").toLowerCase();
  if (["decisor", "indicado", "gatekeeper", "bot", "incerto"].includes(atual)) return atual;
  if (lead?.decisor_nome) return "decisor";
  return "incerto";
}

function capacidade(lead, temSinalIndustrial) {
  const porte = String(lead?.porte || "").trim().toUpperCase();
  const capital = Number(lead?.capital_social || 0);
  const temSite = Boolean(String(lead?.site_url || "").trim());
  const evidencia = [];

  if (porte) evidencia.push(`porte ${porte}`);
  if (capital > 0) evidencia.push(`capital social R$ ${Math.round(capital).toLocaleString("pt-BR")}`);
  if (temSite) evidencia.push("site institucional");
  if (temSinalIndustrial) evidencia.push("atividade industrial comprovada");

  // P3 (Story 063): Tier A e porte + presenca institucional propria. Sem site o porte sozinho
  // nao sustenta projeto sob medida; a empresa continua elegivel, na oferta do Tier B.
  if (porte === "EPP" || porte === "DEMAIS") {
    if (temSite) return { tier: "governante", evidence: evidencia };
    return { tier: "estruturado", evidence: evidencia, nota: `porte ${porte} sem site institucional` };
  }
  if (porte === "MEI") {
    return { tier: "micro", evidence: evidencia };
  }
  if (porte === "ME") {
    if (capital >= 50_000 && temSite && temSinalIndustrial) {
      return { tier: "estruturado", evidence: evidencia };
    }
    if (capital > 0 && capital < 50_000) {
      return { tier: "micro", evidence: evidencia };
    }
    return { tier: "incerto", evidence: evidencia };
  }
  return { tier: "incerto", evidence: evidencia };
}

const TIERS_DE_EXCECAO = new Set(["governante", "estruturado"]);

/**
 * P0 (Story 064): excecao manual so vale com evidencia industrial escrita, tier de oferta
 * principal, aprovador e data. Qualquer campo faltando e como se a excecao nao existisse.
 * O unico caminho de escrita e scripts/approve-eligibility-exception.mjs.
 */
export function excecaoValida(excecao) {
  if (!excecao || typeof excecao !== "object") return null;
  const evidence = String(excecao.evidence ?? "").trim();
  const approvedBy = String(excecao.approved_by ?? "").trim();
  const approvedAt = String(excecao.approved_at ?? "").trim();
  if (!evidence || !approvedBy || !approvedAt || Number.isNaN(Date.parse(approvedAt))) return null;
  if (!TIERS_DE_EXCECAO.has(excecao.tier)) return null;
  return { evidence, tier: excecao.tier, approved_by: approvedBy, approved_at: approvedAt };
}

export function avaliarElegibilidadeProspeccao(lead) {
  const decision_access = acessoAoDecisor(lead);

  const excecao = excecaoValida(lead?.eligibility_exception);
  if (excecao) {
    return {
      eligible: true,
      capacity_tier: excecao.tier,
      capacity_evidence: [`excecao manual: ${excecao.evidence}`],
      decision_access,
      offer_track: "projeto",
      eligibility_reason: `excecao manual aprovada por ${excecao.approved_by} em ${excecao.approved_at.slice(0, 10)}`,
    };
  }

  if (lead?.segment === "eventos") {
    return {
      eligible: true,
      capacity_tier: "governante",
      capacity_evidence: ["vertical de eventos com curadoria propria"],
      decision_access,
      offer_track: "projeto",
      eligibility_reason: "vertical de eventos: regua e oferta proprias",
    };
  }

  const texto = textoDoLead(lead);
  const anti = ANTI_ICP.find((padrao) => padrao.test(texto));
  if (anti) {
    return {
      eligible: false,
      capacity_tier: "incerto",
      capacity_evidence: [],
      decision_access,
      offer_track: "nenhuma",
      eligibility_reason: "anti-ICP identificado na atividade ou no nome",
    };
  }

  if (lead?.is_icp !== true) {
    return {
      eligible: false,
      capacity_tier: "incerto",
      capacity_evidence: [],
      decision_access,
      offer_track: "nenhuma",
      eligibility_reason: lead?.is_icp === false ? "fora do ICP industrial" : "ICP industrial ainda indefinido",
    };
  }

  const temSinalIndustrial = SINAL_INDUSTRIAL.some((padrao) => padrao.test(texto));
  if (!temSinalIndustrial) {
    return {
      eligible: false,
      capacity_tier: "incerto",
      capacity_evidence: [],
      decision_access,
      offer_track: "nenhuma",
      eligibility_reason: "sem evidencia industrial suficiente para prospeccao automatica",
    };
  }

  const { tier, evidence, nota } = capacidade(lead, temSinalIndustrial);
  const eligible = tier === "governante" || tier === "estruturado";
  return {
    eligible,
    capacity_tier: tier,
    capacity_evidence: evidence,
    decision_access,
    offer_track: eligible ? "projeto" : tier === "micro" ? "entrada" : "nenhuma",
    eligibility_reason: eligible
      ? `ICP confirmado e capacidade ${tier}${nota ? ` (${nota})` : ""}`
      : tier === "micro"
        ? "capacidade abaixo da oferta principal; reservar para produto de entrada"
        : "capacidade financeira ainda sem evidencia suficiente",
  };
}

export const ESTAGIOS_FRIOS = Object.freeze(["prospect", "abordado", "followup"]);

/**
 * P0 (Story 064): a mesma regua das filas de disparo vale para as filas VISUAIS (Sala de
 * Comando, /disparo, encaminhamentos). Antes delas nenhuma checava elegibilidade e o
 * anti-ICP em abordado/followup aparecia com M1-M3 prontos para copiar.
 *   - anti-ICP ou is_icp=false em estagio frio: sai da fila, sempre;
 *   - inelegivel por outro motivo (ICP indefinido, capacidade incerta, micro): sai, a menos
 *     que tenha resposta humana esperando; nesse caso fica, mas sem template de cadencia;
 *   - estagio avancado (qualified em diante) e eventos: protegidos, a conversa vale mais
 *     que a regra (mesma licao do classify-icp com a JOHN REFRIGERACAO em proposal).
 */
export function retencaoFilaFria(lead) {
  const livre = { excluir: false, semTemplate: false, motivo: null };
  if (!ESTAGIOS_FRIOS.includes(String(lead?.stage ?? ""))) return livre;
  if (lead?.segment === "eventos") return livre;
  const elegibilidade = avaliarElegibilidadeProspeccao(lead);
  if (elegibilidade.eligible) return livre;
  const bloqueado = lead?.is_icp === false || /anti-ICP/i.test(elegibilidade.eligibility_reason);
  const inbound = lead?.last_inbound_at ? Date.parse(lead.last_inbound_at) : NaN;
  const outbound = lead?.last_outbound_at ? Date.parse(lead.last_outbound_at) : NaN;
  const respostaEsperando = Number.isFinite(inbound) && (!Number.isFinite(outbound) || inbound > outbound);
  return {
    excluir: bloqueado || !respostaEsperando,
    semTemplate: true,
    motivo: elegibilidade.eligibility_reason,
  };
}

const ORDEM_CAPACIDADE = {
  governante: 2,
  estruturado: 1,
  micro: 0,
  incerto: 0,
};

function tierDoItem(item) {
  return item?.prospectingEligibility?.capacity_tier || item?.capacity_tier || "incerto";
}

/**
 * Ordena apenas o conjunto que ja passou pelo gate. Sinal observado vem primeiro;
 * capacidade, score e confianca do canal desempatem nessa ordem. IDs explicitos nao
 * usam este comparador: a ordem humana aprovada e preservada pelos scripts de lote.
 */
export function compararPrioridadeProspeccao(a, b) {
  const sinal = Number(b?.signalWeight || 0) - Number(a?.signalWeight || 0);
  if (sinal !== 0) return sinal;

  const capacidade = Number(ORDEM_CAPACIDADE[tierDoItem(b)] || 0) - Number(ORDEM_CAPACIDADE[tierDoItem(a)] || 0);
  if (capacidade !== 0) return capacidade;

  const score = Number(b?.points || 0) - Number(a?.points || 0);
  if (score !== 0) return score;

  const canal = Number(b?.confianca || 0) - Number(a?.confianca || 0);
  if (canal !== 0) return canal;

  return Number(a?.id || 0) - Number(b?.id || 0);
}

const prospectingEligibility = {
  ESTAGIOS_FRIOS,
  avaliarElegibilidadeProspeccao,
  compararPrioridadeProspeccao,
  excecaoValida,
  retencaoFilaFria,
};
export default prospectingEligibility;
