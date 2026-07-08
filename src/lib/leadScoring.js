"use strict";

/**
 * leadScoring.js - Scoring v2 dos leads (Story 017).
 * Modulo COMPARTILHADO entre o CLI (scripts/lead-search-playbook.js, CommonJS) e a rota
 * server-side da fila do dia (src/app/api/comando, via leadScoring.d.ts). Logica PURA e
 * SINCRONA (sem fetch). Pesos explicaveis e documentados - nao e caixa-preta.
 *
 * Tabela de pesos (priority_score v2):
 *   +18 tem telefone            -20 sem telefone
 *   +18 segmento industrial_b2b +10 segmento local (clima/odonto/eventos)
 *   +12 rating >= 4.3           +12 reviews >= 10   +8 reviews >= 50
 *   SEM_SITE (rebalanceado por sinais de operacao viva):
 *       +14 se >= 2 sinais vivos | +4 se 1 sinal | -12 se 0 sinal (fila C)
 *   +12 site fraco de builder   +8 instagram-como-site   +8 link intermediario
 *   +6  site feito por concorrente (paga por digital, valoriza o ativo)
 *   consciencia: +16 pronto | +12 comparando | +10 consciente | +0 desconhecido
 *   -45 excluido (sindicato/prefeitura/etc.)
 * content_score e calculado A PARTE (nao entra no priority_score).
 */

const RECOMMENDED_APPROACHES = ["sem_site_ativo", "builder_fraco", "site_concorrente", "site_auditar", "industrial_email"];

const HIGH_INTENT_QUERIES = {
  industrial: [
    '"manutencao industrial" "orcamento" "Belo Horizonte"',
    '"usinagem CNC" "pecas sob medida" "Sao Bernardo do Campo"',
    '"caldeiraria industrial" "orcamento" "Contagem"',
    '"automacao industrial" "CLP" "Ipatinga"',
    '"manutencao hidraulica industrial" "orcamento" "MG"',
  ],
  localServices: [
    '"climatizacao" "manutencao" "Ipatinga"',
    '"energia solar" "simulacao" "Ipatinga"',
    '"dentista invisalign" "agendamento" "Ipatinga"',
  ],
  painEvents: [
    '"site fora do ar" "orcamento" segmento cidade',
    '"linktree" segmento cidade',
    '"instagram" "sem site" segmento cidade',
  ],
};

// Termos ASCII: normalize() remove acentos do texto do lead, entao a versao sem acento casa
// com dados acentuados (evita duplicar termos e mantem o fonte livre de mojibake).
const EXCLUDE_TERMS = [
  "sindicato", "clube", "parque", "bairro", "associacao",
  "municipal", "prefeitura", "metalurgicos", "reel", "news",
];

const SEGMENT_RULES = [
  { key: "industrial_b2b", terms: ["manutencao industrial", "usinagem", "caldeiraria", "automacao industrial", "compressores", "hidraulica industrial", "metalurgica", "solda", "tornearia"], channel: "email_linkedin_whatsapp", angle: "validacao_b2b_e_orcamento" },
  { key: "climatizacao", terms: ["climatizacao", "ar condicionado", "refrigeracao"], channel: "whatsapp_instagram", angle: "urgencia_e_agendamento" },
  { key: "odontologia", terms: ["odontologia", "dentista", "invisalign", "clinica odontologica"], channel: "whatsapp_instagram", angle: "agendamento_e_confianca" },
  { key: "eventos", terms: ["evento", "eventos", "espaco", "wedding", "buffet"], channel: "email_whatsapp_instagram", angle: "reserva_e_prova_visual" },
];

// Padroes de URL de construtores (builders). Nome legivel -> substrings.
const BUILDER_URL_PATTERNS = [
  ["Wix", ["wixsite.com", "wixstatic.com", "wix.com"]],
  ["GoDaddy", ["godaddysites.com", "secureserver.net"]],
  ["Squarespace", ["squarespace.com", "sqsp.net"]],
  ["Webnode", ["webnode."]],
  ["Jotform", ["jotform."]],
  ["Canva Sites", ["canva.site"]],
  ["Duda", ["multiscreensite.com", "dudaone", "duda.co"]],
  ["Google Sites", ["sites.google.com"]],
  ["Loja Integrada", ["lojaintegrada.com.br"]],
  ["WordPress.com", ["wordpress.com"]],
];

function normalize(value) {
  return String(value == null ? "" : value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function hasWebsite(lead) {
  const website = normalize(lead.website);
  return Boolean(website && website !== "null" && website !== "undefined");
}

function hasInstagramOnly(lead) {
  return hasWebsite(lead) && normalize(lead.website).includes("instagram.com");
}

function hasInstagram(lead) {
  return hasInstagramOnly(lead) || Boolean(lead.instagram);
}

function classifySegment(lead) {
  const text = normalize(`${lead.name || ""} ${lead.address || ""}`);
  return (
    SEGMENT_RULES.find((rule) => rule.terms.some((term) => text.includes(normalize(term)))) || {
      key: "outro",
      channel: "whatsapp",
      angle: "validacao_digital_generica",
    }
  );
}

function isExcluded(lead) {
  const text = normalize(`${lead.name || ""} ${lead.address || ""}`);
  return EXCLUDE_TERMS.some((term) => text.includes(normalize(term)));
}

function detectBuilderByUrl(website) {
  const w = normalize(website);
  if (!w) return null;
  for (const [name, patterns] of BUILDER_URL_PATTERNS) {
    if (patterns.some((p) => w.includes(p))) return name;
  }
  return null;
}

function opportunityType(lead) {
  if (!hasWebsite(lead)) return "SEM_SITE";
  if (hasInstagramOnly(lead)) return "INSTAGRAM_COMO_SITE";
  const w = normalize(lead.website);
  if (w.includes("linktree") || w.includes("linktr.ee") || w.includes("wa.me") || w.includes("bit.ly")) return "LINK_INTERMEDIARIO";
  if (lead.builder || detectBuilderByUrl(lead.website)) return "SITE_FRACO_BUILDER";
  return "SITE_EXISTENTE_AUDITAR";
}

// Sinais de operacao viva (rebalanceia o "sem site").
function liveSignals(lead) {
  let n = 0;
  if (Number(lead.rating || 0) >= 4.0) n++;
  if (Number(lead.reviews_count || 0) >= 3) n++;
  if (lead.phone) n++;
  if (lead.address) n++;
  if (hasInstagram(lead)) n++;
  return n;
}

function consciousnessV2(lead, ctx) {
  if (lead.replied || lead.interested) return "pronto"; // so quando ha resposta real
  if (ctx.competitorBuilt) return "comparando";
  if (ctx.opportunity === "SITE_EXISTENTE_AUDITAR") return "comparando";
  if (ctx.opportunity === "SITE_FRACO_BUILDER") return "consciente";
  // sem site / instagram / link: depende dos sinais de vida
  return ctx.live >= 2 ? "consciente" : "desconhecido";
}

function recommendedChannelV2(lead, segment) {
  if (segment.key === "industrial_b2b") {
    if (lead.email) return "email";
    if (hasWebsite(lead) && !hasInstagramOnly(lead)) return "email";
    return lead.phone ? "whatsapp" : "linkedin";
  }
  if (hasInstagramOnly(lead)) return "instagram";
  return lead.phone ? "whatsapp" : "instagram";
}

function recommendedApproach(lead, ctx, segment) {
  if (ctx.competitorBuilt) return "site_concorrente";
  if (segment.key === "industrial_b2b" && lead.email) return "industrial_email";
  if (ctx.opportunity === "SITE_FRACO_BUILDER") return "builder_fraco";
  if (ctx.opportunity === "SEM_SITE" || ctx.opportunity === "INSTAGRAM_COMO_SITE" || ctx.opportunity === "LINK_INTERMEDIARIO") {
    return "sem_site_ativo";
  }
  return "site_auditar";
}

// Score v1 (mantido para comparacao / rollback logico por 1 ciclo).
function scoreV1(lead) {
  let score = 0;
  const reviews = Number(lead.reviews_count || 0);
  const rating = Number(lead.rating || 0);
  const segment = classifySegment(lead);
  if (lead.phone) score += 18;
  if (lead.website) score += 6;
  if (!hasWebsite(lead)) score += 16;
  if (hasInstagramOnly(lead)) score += 10;
  if (rating >= 4.3) score += 12;
  if (reviews >= 10) score += 12;
  if (reviews >= 50) score += 8;
  if (segment.key === "industrial_b2b") score += 18;
  if (["climatizacao", "odontologia", "eventos"].includes(segment.key)) score += 10;
  if (!lead.phone) score -= 20;
  if (reviews === 0 && !hasWebsite(lead)) score -= 15;
  if (isExcluded(lead)) score -= 45;
  return Math.max(0, score);
}

function scoreV2(lead, ctx, segment) {
  let score = 0;
  const reviews = Number(lead.reviews_count || 0);
  const rating = Number(lead.rating || 0);

  if (lead.phone) score += 18;
  else score -= 20;

  if (segment.key === "industrial_b2b") score += 18;
  else if (["climatizacao", "odontologia", "eventos"].includes(segment.key)) score += 10;

  if (rating >= 4.3) score += 12;
  if (reviews >= 10) score += 12;
  if (reviews >= 50) score += 8;

  // SEM_SITE rebalanceado por operacao viva (fim do bonus flat +16).
  if (ctx.opportunity === "SEM_SITE") {
    if (ctx.live >= 2) score += 14;
    else if (ctx.live === 1) score += 4;
    else score -= 12;
  } else if (ctx.opportunity === "SITE_FRACO_BUILDER") {
    score += 12;
  } else if (ctx.opportunity === "INSTAGRAM_COMO_SITE") {
    score += 8;
  } else if (ctx.opportunity === "LINK_INTERMEDIARIO") {
    score += 8;
  }

  if (ctx.competitorBuilt) score += 6;

  const consciousness = consciousnessV2(lead, ctx);
  if (consciousness === "pronto") score += 16;
  else if (consciousness === "comparando") score += 12;
  else if (consciousness === "consciente") score += 10;

  if (isExcluded(lead)) score -= 45;
  return Math.max(0, score);
}

function diagnoseLead(lead) {
  const segment = classifySegment(lead);
  const opportunity = opportunityType(lead);
  const live = liveSignals(lead);
  const builder = lead.builder || detectBuilderByUrl(lead.website) || null;
  const competitorBuilt = Boolean(lead.competitor_built);
  const ctx = { opportunity, competitorBuilt, live, builder };
  const consciousness = consciousnessV2(lead, ctx);

  return {
    name: lead.name || "",
    website: lead.website || "",
    phone: lead.phone || "",
    email: lead.email || "",
    rating: lead.rating == null ? null : Number(lead.rating),
    reviews_count: Number(lead.reviews_count || 0),
    address: lead.address || "",
    segment: segment.key,
    angle: segment.angle,
    opportunity,
    builder,
    builder_source: builder ? lead.builder_source || "url" : null,
    competitor_built: competitorBuilt,
    competitor_provider: lead.competitor_provider || null,
    competitor_link: lead.competitor_link || null,
    live_signals: live,
    consciousness,
    channel: recommendedChannelV2(lead, segment),
    recommended_approach: recommendedApproach(lead, ctx, segment),
    content_score: lead.content_score == null ? null : Number(lead.content_score),
    content_signals: lead.content_signals || null,
    needs_email_research: segment.key === "industrial_b2b" && !lead.email,
    priority_score_v1: scoreV1(lead),
    priority_score: scoreV2(lead, ctx, segment),
    excluded: isExcluded(lead),
  };
}

function dedupeLeads(leads) {
  const seen = new Map();
  for (const lead of leads) {
    const keyParts = [normalize(lead.name), normalize(lead.phone || ""), normalize(lead.website || ""), normalize(lead.address || "")].filter(Boolean);
    const key = keyParts.slice(0, 3).join("|") || normalize(lead.name);
    const current = seen.get(key);
    if (!current) {
      seen.set(key, lead);
      continue;
    }
    if (diagnoseLead(lead).priority_score > diagnoseLead(current).priority_score) seen.set(key, lead);
  }
  return Array.from(seen.values());
}

module.exports = {
  RECOMMENDED_APPROACHES,
  HIGH_INTENT_QUERIES,
  normalize,
  classifySegment,
  isExcluded,
  detectBuilderByUrl,
  opportunityType,
  liveSignals,
  consciousnessV2,
  recommendedApproach,
  recommendedChannelV2,
  scoreV1,
  scoreV2,
  diagnoseLead,
  dedupeLeads,
};
