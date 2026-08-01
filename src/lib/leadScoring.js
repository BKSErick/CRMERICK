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

// --- Telefone: procedencia, nao mais sim/nao --------------------------------
// DDDs que realmente existem no Brasil. Sem essa lista, 0800 / 4004 / 3003 entram
// como se fossem numero de cliente (a primeira varredura de sites gravou um 0800).
const DDDS_VALIDOS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

function classifyPhone(value) {
  const d = String(value == null ? "" : value).replace(/\D/g, "").replace(/^55/, "");
  if (!d || d.startsWith("0")) return { number: null, kind: "invalido", ddd: null }; // 0800 / 0300
  const ddd = d.slice(0, 2);
  if (!DDDS_VALIDOS.has(ddd)) return { number: null, kind: "invalido", ddd: null }; // 4004 / 3003
  const rest = d.slice(2);
  if (rest.length === 9 && rest[0] === "9") return { number: `55${d}`, kind: "celular", ddd };
  if (rest.length === 8 && /^[2-5]/.test(rest)) return { number: `55${d}`, kind: "fixo", ddd };
  return { number: null, kind: "invalido", ddd: null };
}

// Ordem de confianca do canal (aprendido em 31/07/2026): exigir celular do Maps
// descartava 73% da base. O fixo de industria pequena costuma ter WhatsApp Business,
// e o numero publicado no proprio site vale mais que os dois - foi a empresa que
// escolheu atender por ali. Fixo nao verificado nao e descarte: e fila de verificacao.
function phoneProfile(lead) {
  const confirmado = classifyPhone(lead.whatsapp_jid);
  if (confirmado.number) return { ...confirmado, source: "confirmado" };
  const site = classifyPhone(lead.site_whatsapp || lead.whatsapp_site);
  if (site.number) return { ...site, source: "site" };
  const maps = classifyPhone(lead.phone);
  if (maps.number) return { ...maps, source: "maps" };
  return { number: null, kind: "nenhum", ddd: null, source: null };
}

function phoneScore(p) {
  if (p.source === "confirmado") return 24; // a Uazapi confirmou que o numero existe
  if (p.source === "site") return 22; // a empresa publica esse numero
  if (p.kind === "celular") return 18;
  if (p.kind === "fixo") return 10; // pode ter WhatsApp, so falta verificar
  return -20;
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
  if (phoneProfile(lead).number) n++;
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
  const p = phoneProfile(lead);
  // Fixo ainda nao verificado nao vira "sem canal": vira fila da verificacao na
  // Uazapi (scripts/uazapi-check-numbers.mjs). Metade deles atende no WhatsApp.
  const viaTelefone = p.number ? (p.kind === "fixo" && p.source === "maps" ? "whatsapp_verificar" : "whatsapp") : null;
  if (segment.key === "industrial_b2b") {
    if (lead.email) return "email";
    if (hasWebsite(lead) && !hasInstagramOnly(lead)) return "email";
    return viaTelefone || "linkedin";
  }
  if (hasInstagramOnly(lead)) return "instagram";
  return viaTelefone || "instagram";
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

  score += phoneScore(ctx.phone);

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

// --- Lookalike: parecido com quem ja respondeu ------------------------------
// O perfil vem de data/winning-profile.json, gerado por scripts/lead-winning-profile.mjs
// a partir das respostas REAIS no CRM. Cada celula (segmento, DDD, com/sem site) traz um
// lift: quanto ela responde acima ou abaixo da media geral.
//
// Duas travas contra superticao:
//   1) celula com amostra menor que minAmostra e ignorada (1 venda em 1 lead nao e padrao)
//   2) o bonus total e limitado a LOOKALIKE_TETO, entao ele reordena a fila mas nunca
//      promove um lead ruim (sem canal, excluido) so por estar na regiao da moda
const LOOKALIKE_TETO = 12;
const LOOKALIKE_PESO = 20; // lift 1.5x em uma dimensao vale ~10 pontos

function lookalikeBoost(lead, profile, ctx, segment) {
  if (!profile || !profile.dimensoes) return { bonus: 0, reasons: [] };
  const minAmostra = Number(profile.minAmostra || 5);
  const chaves = {
    segment: segment.key,
    ddd: ctx.phone.ddd,
    tem_site: hasWebsite(lead) ? "com_site" : "sem_site",
  };

  let bruto = 0;
  const reasons = [];
  for (const [dim, valor] of Object.entries(chaves)) {
    if (valor == null) continue;
    const celula = profile.dimensoes[dim] && profile.dimensoes[dim][valor];
    if (!celula || celula.total < minAmostra) continue;
    const delta = (Number(celula.lift) - 1) * LOOKALIKE_PESO;
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.5) continue;
    bruto += delta;
    reasons.push(`${dim}=${valor} ${Number(celula.lift).toFixed(2)}x (n=${celula.total})`);
  }

  const bonus = Math.round(Math.max(-LOOKALIKE_TETO, Math.min(LOOKALIKE_TETO, bruto)));
  return { bonus, reasons };
}

function diagnoseLead(lead, profile) {
  const segment = classifySegment(lead);
  const opportunity = opportunityType(lead);
  const live = liveSignals(lead);
  const builder = lead.builder || detectBuilderByUrl(lead.website) || null;
  const competitorBuilt = Boolean(lead.competitor_built);
  const phone = phoneProfile(lead);
  const ctx = { opportunity, competitorBuilt, live, builder, phone };
  const consciousness = consciousnessV2(lead, ctx);
  const lookalike = lookalikeBoost(lead, profile, ctx, segment);
  const base = scoreV2(lead, ctx, segment);

  return {
    name: lead.name || "",
    website: lead.website || "",
    phone: lead.phone || "",
    phone_e164: phone.number,
    phone_kind: phone.kind,
    phone_source: phone.source,
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
    priority_score_base: base,
    lookalike_bonus: lookalike.bonus,
    lookalike_reasons: lookalike.reasons,
    priority_score: Math.max(0, base + lookalike.bonus),
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
  classifyPhone,
  phoneProfile,
  phoneScore,
  lookalikeBoost,
  liveSignals,
  consciousnessV2,
  recommendedApproach,
  recommendedChannelV2,
  scoreV1,
  scoreV2,
  diagnoseLead,
  dedupeLeads,
};
