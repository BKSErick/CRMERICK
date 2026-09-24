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

  if (porte === "EPP" || porte === "DEMAIS") {
    return { tier: "governante", evidence: evidencia };
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

export function avaliarElegibilidadeProspeccao(lead) {
  const decision_access = acessoAoDecisor(lead);

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

  const { tier, evidence } = capacidade(lead, temSinalIndustrial);
  const eligible = tier === "governante" || tier === "estruturado";
  return {
    eligible,
    capacity_tier: tier,
    capacity_evidence: evidence,
    decision_access,
    offer_track: eligible ? "projeto" : tier === "micro" ? "entrada" : "nenhuma",
    eligibility_reason: eligible
      ? `ICP confirmado e capacidade ${tier}`
      : tier === "micro"
        ? "capacidade abaixo da oferta principal; reservar para produto de entrada"
        : "capacidade financeira ainda sem evidencia suficiente",
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

const prospectingEligibility = { avaliarElegibilidadeProspeccao, compararPrioridadeProspeccao };
export default prospectingEligibility;
