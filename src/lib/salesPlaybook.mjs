import SALES_PLAYBOOK from "../../content/sales-playbook.json" with { type: "json" };

export { SALES_PLAYBOOK };

function foldText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function stableBucket(value, buckets) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % buckets;
}

function detectVariantFromCopy(copyText) {
  const text = String(copyText ?? "").trim();
  if (/^fala!/i.test(text)) return "B";
  if (/^oi,?\s*tudo bem\?/i.test(text)) return "A";
  return null;
}

function copyAssignmentForLead(input) {
  const variants = SALES_PLAYBOOK.experiment.variants;
  const detected = detectVariantFromCopy(input.copyText);
  const identity = input.id ?? input.company ?? "lead-sem-identidade";
  const variant = detected ?? variants[stableBucket(identity, variants.length)];
  return {
    copyVersion: SALES_PLAYBOOK.copyVersion,
    offerVersion: SALES_PLAYBOOK.offer.version,
    experimentId: SALES_PLAYBOOK.experiment.id,
    variant,
  };
}

function shortCompany(value) {
  const words = String(value ?? "").split(/[|\-–,]/)[0].trim().split(/\s+/);
  const connector = words.findIndex((word) => /^(e|de|da|do|das|dos|em|com|para|pra|&)$/i.test(word));
  const end = connector > 0 ? Math.min(connector, 4) : 4;
  return words.slice(0, end).join(" ") || String(value ?? "empresa");
}

function segmentDescription(segment) {
  return segment === "usinagem" || segment === "caldeiraria"
    ? "metalurgia e usinagem de precisão"
    : "manutenção industrial";
}

function isLocal(city) {
  return foldText(city).includes("monlevade");
}

function interpolate(template, values) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

const CASES = {
  metalthec: { key: "metalthec", url: SALES_PLAYBOOK.cases.metalthecUrl, intro: "Na Metalthec", template: "Metalthec" },
  jotta: { key: "jotta", url: SALES_PLAYBOOK.cases.jottaUrl, intro: "Na Jotta", template: "Jotta" },
};

/**
 * Um case por mensagem (P5, copy v5). Usinagem e caldeiraria recebem Metalthec; o resto
 * recebe Jotta, mesma regra do CASE_LINK da msg 2 (src/lib/followup.ts). Concorrente direto
 * da Jotta (caseOnly "metalthec", origin_detail = concorrente_jotta) nunca le o nome dela.
 */
function caseDoLead(input = {}) {
  if (input.caseOnly === "metalthec") return CASES.metalthec;
  const segment = input.segment_norm || input.segment;
  return segment === "usinagem" || segment === "caldeiraria" ? CASES.metalthec : CASES.jotta;
}

function renderFollowupMessage(input) {
  const company = shortCompany(input.company);
  const values = {
    company,
    mechanism: SALES_PLAYBOOK.mechanism,
    segmentDescription: segmentDescription(input.segment),
  };
  if (input.responseType === "bot") {
    return interpolate(SALES_PLAYBOOK.routing.botName, values);
  }
  if (input.tier === "M1") return interpolate(SALES_PLAYBOOK.followups.M1, values);
  if (input.tier === "M2") {
    const caso = caseDoLead(input);
    const template = SALES_PLAYBOOK.followups[`M2${caso.template}${isLocal(input.city) ? "Local" : "Remote"}`];
    return interpolate(template, { ...values, caseUrl: caso.url });
  }
  return interpolate(SALES_PLAYBOOK.followups.M3, values);
}

const PRECO_BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

function formatarPreco(valor) {
  return PRECO_BRL.format(Number(valor || 0));
}

/**
 * P3 (Story 063): oferta por tier. Governante (Tier A) recebe projeto sob medida com preco so
 * na proposta; estruturado (Tier B) recebe a pagina de R$1.000; micro vai para a Base
 * Industrial manual. Qualquer outra combinacao nao tem oferta: o lead nao entra em lote.
 */
function ofertaDoLead(lead) {
  const tier = lead?.capacity_tier ?? lead?.prospectingEligibility?.capacity_tier ?? null;
  const track = lead?.offer_track ?? lead?.prospectingEligibility?.offer_track ?? null;
  if (track === "entrada" && tier === "micro") {
    const oferta = SALES_PLAYBOOK.entryOffer;
    return { key: "entryOffer", tier, name: oferta.name, version: oferta.version, setupPrice: oferta.setupPrice, monthlyPrice: oferta.monthlyPrice, priceInMessage: true };
  }
  if (track !== "projeto") return null;
  if (tier === "governante") {
    const oferta = SALES_PLAYBOOK.projectOffer;
    return { key: "projectOffer", tier, name: oferta.name, version: oferta.version, setupPrice: oferta.fromSetupPrice, monthlyPrice: oferta.fromMonthlyPrice, priceInMessage: false };
  }
  if (tier === "estruturado") {
    const oferta = SALES_PLAYBOOK.offer;
    return { key: "offer", tier, name: oferta.name, version: oferta.version, setupPrice: oferta.setupPrice, monthlyPrice: oferta.monthlyPrice, priceInMessage: true };
  }
  return null;
}

/**
 * P7 (gate Finch, criterio 5): quanto de conversa humana cabe no ticket sem furar a margem
 * minima. Liquido = preco - taxa; custo maximo = liquido x (1 - margem); o que sobra depois
 * da implantacao e o orcamento da conversa, dividido pelo tempo de um toque manual.
 */
function orcamentoHumanoDaOferta(key) {
  const oferta = SALES_PLAYBOOK[key];
  const caps = oferta?.operatingCaps;
  if (!caps) return null;
  const setupPrice = Number(oferta.setupPrice ?? oferta.fromSetupPrice);
  const liquido = setupPrice * (1 - caps.paymentFeeRate);
  const custoMaximo = liquido * (1 - caps.minimumContributionMargin);
  const custoImplantacao = caps.setupHours * caps.internalHourlyCost;
  const orcamentoConversa = custoMaximo - custoImplantacao;
  const minutosPorToque = Number(caps.minutesPerManualTouch ?? 15);
  const minutos = (orcamentoConversa / caps.internalHourlyCost) * 60;
  return {
    setupPrice,
    liquido,
    custoMaximo,
    custoImplantacao,
    orcamentoConversa,
    minutosPorToque,
    maxManualTouches: Math.max(0, Math.floor(minutos / minutosPorToque + 1e-9)),
  };
}

/** Sim forte de lead Tier A: case + proposta escrita, sem preco e sem R$1.000. */
function renderTierAOferta(input) {
  const tierA = SALES_PLAYBOOK.postResponse.tierA;
  const caso = caseDoLead(input);
  const nome = String(input.nomeDecisor ?? "").trim().split(/\s+/)[0];
  const quemDecide = nome ? interpolate(tierA.quemDecideComNome, { nomeDecisor: nome }) : tierA.quemDecideSemNome;
  return interpolate(tierA.oferta, {
    caseIntro: caso.intro,
    caseUrl: caso.url,
    company: shortCompany(input.company),
    quemDecide,
  });
}

/** Segundo degrau do Tier A: a condicao, a partir do piso da faixa do site. */
function renderTierAProposta(input) {
  const oferta = SALES_PLAYBOOK.projectOffer;
  return interpolate(SALES_PLAYBOOK.postResponse.tierA.proposta, {
    company: shortCompany(input.company),
    setupPrice: formatarPreco(oferta.fromSetupPrice),
    monthlyPrice: formatarPreco(oferta.fromMonthlyPrice),
    proximaEntrada: input.nextSlot ?? SALES_PLAYBOOK.postResponse.proximaEntrada,
  });
}

function calculateEntryOfferEconomics(overrides = {}) {
  const offer = SALES_PLAYBOOK.entryOffer;
  const caps = { ...offer.operatingCaps, ...overrides };
  const setupCosts =
    offer.setupPrice * caps.paymentFeeRate + caps.setupHours * caps.internalHourlyCost;
  const monthlyCosts =
    offer.monthlyPrice * caps.paymentFeeRate +
    caps.infrastructureReserveMonthly +
    (caps.monthlyMinutes / 60) * caps.internalHourlyCost;
  const resultFor = (revenue, costs, operating) => {
    const contribution = revenue - costs;
    return {
      revenue,
      costs,
      contribution,
      contributionMargin: contribution / revenue,
      ...operating,
    };
  };
  return {
    setup: resultFor(offer.setupPrice, setupCosts, { productionHours: caps.setupHours }),
    monthly: resultFor(offer.monthlyPrice, monthlyCosts, { productionMinutes: caps.monthlyMinutes }),
    minimumContributionMargin: caps.minimumContributionMargin,
  };
}

function renderEntryOfferMessage(input) {
  const offer = SALES_PLAYBOOK.entryOffer;
  return interpolate(offer.message, {
    company: shortCompany(input.company),
    setupPrice: offer.setupPrice,
    monthlyPrice: offer.monthlyPrice,
    deliveryDays: offer.deliveryBusinessDays,
    proximaEntrada: input.nextSlot ?? "[DIA]",
  });
}

function activityExperimentMetadata(assignment, extra = {}) {
  return {
    ...extra,
    copy_version: assignment.copyVersion,
    copy_variant: assignment.variant,
    offer_version: assignment.offerVersion,
    experiment_id: assignment.experimentId,
  };
}

const salesPlaybookModule = {
  SALES_PLAYBOOK,
  activityExperimentMetadata,
  calculateEntryOfferEconomics,
  caseDoLead,
  copyAssignmentForLead,
  detectVariantFromCopy,
  formatarPreco,
  isLocal,
  ofertaDoLead,
  orcamentoHumanoDaOferta,
  renderEntryOfferMessage,
  renderFollowupMessage,
  renderTierAOferta,
  renderTierAProposta,
  shortCompany,
};

export {
  activityExperimentMetadata,
  calculateEntryOfferEconomics,
  caseDoLead,
  copyAssignmentForLead,
  detectVariantFromCopy,
  formatarPreco,
  isLocal,
  ofertaDoLead,
  orcamentoHumanoDaOferta,
  renderEntryOfferMessage,
  renderFollowupMessage,
  renderTierAOferta,
  renderTierAProposta,
  shortCompany,
};

export default salesPlaybookModule;
