export const DEAL_QUALIFICATION_VERSION = 1;

export const QUALIFICATION_FIELD_DEFINITIONS = Object.freeze([
  { key: "problem", label: "Problema ou gargalo" },
  { key: "impact", label: "Impacto no negocio" },
  { key: "stakeholders", label: "Decisor e influenciadores" },
  { key: "urgency", label: "Urgencia" },
  { key: "investmentCapacity", label: "Capacidade de investimento" },
  { key: "desiredSolution", label: "Solucao desejada" },
  { key: "recommendedOffer", label: "Oferta recomendada" },
]);

export const QUALIFICATION_REVIEW_STAGES = Object.freeze(["qualified", "proposal", "negotiation"]);

const FIELD_KEYS = new Set(QUALIFICATION_FIELD_DEFINITIONS.map((field) => field.key));
const EVIDENCE_ORIGINS = new Set(["messages", "activities", "deal", "deal_notes", "operator"]);
const MAX_TEXT_LENGTH = 4000;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function cleanTimestamp(value) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function emptyField(metadata = {}) {
  return {
    status: "not_informed",
    value: null,
    source: metadata.source ?? null,
    evidence: null,
    updatedAt: metadata.updatedAt ?? null,
    updatedBy: metadata.updatedBy ?? null,
  };
}

function normalizeEvidence(value) {
  if (!isRecord(value)) return null;
  const text = cleanText(value.text);
  const origin = cleanText(value.origin, 80);
  if (!text || !origin || !EVIDENCE_ORIGINS.has(origin)) return null;
  return { text, origin };
}

function normalizeStoredField(value) {
  if (!isRecord(value)) return emptyField();
  const status = value.status;
  const text = cleanText(value.value);
  const updatedAt = cleanTimestamp(value.updatedAt);
  const updatedBy = cleanText(value.updatedBy, 200);
  const evidence = normalizeEvidence(value.evidence);

  if ((status !== "suggested" && status !== "confirmed") || !text) {
    return emptyField({
      source: value.source === "operator" ? "operator" : null,
      updatedAt,
      updatedBy,
    });
  }

  return {
    status,
    value: text,
    source: status === "confirmed" ? "operator" : "ai",
    evidence,
    updatedAt,
    updatedBy,
  };
}

export function normalizeDealQualification(raw) {
  const sourceFields = isRecord(raw?.fields) ? raw.fields : isRecord(raw) ? raw : {};
  return {
    version: DEAL_QUALIFICATION_VERSION,
    fields: Object.fromEntries(
      QUALIFICATION_FIELD_DEFINITIONS.map(({ key }) => [key, normalizeStoredField(sourceFields[key])]),
    ),
  };
}

export function summarizeDealQualification(raw) {
  const qualification = normalizeDealQualification(raw);
  const fields = QUALIFICATION_FIELD_DEFINITIONS.map((definition) => ({
    ...definition,
    status: qualification.fields[definition.key].status,
  }));
  const confirmedCount = fields.filter((field) => field.status === "confirmed").length;
  const suggestedCount = fields.filter((field) => field.status === "suggested").length;
  return {
    totalFields: fields.length,
    confirmedCount,
    suggestedCount,
    completeness: Math.round((confirmedCount / fields.length) * 100),
    pendingFields: fields.filter((field) => field.status !== "confirmed"),
  };
}

function requireContext(context) {
  const actor = cleanText(context?.actor, 200);
  const at = cleanTimestamp(context?.at);
  if (!actor) throw new Error("Autor da alteracao de qualificacao e obrigatorio.");
  if (!at) throw new Error("Data da alteracao de qualificacao e invalida.");
  return { actor, at };
}

function requireField(field) {
  if (typeof field !== "string" || !FIELD_KEYS.has(field)) {
    throw new Error("Campo de qualificacao invalido.");
  }
  return field;
}

function normalizeSuggestion(value) {
  if (!isRecord(value)) throw new Error("Sugestao de qualificacao invalida.");
  const text = cleanText(value.value);
  const evidence = normalizeEvidence(value.evidence);
  if (!text) throw new Error("Sugestao de qualificacao sem valor.");
  if (!evidence) throw new Error("Sugestao de qualificacao exige evidencia valida.");
  return { value: text, evidence };
}

export function applyQualificationMutation(raw, mutation, context) {
  const qualification = normalizeDealQualification(raw);
  const { actor, at } = requireContext(context);
  if (!isRecord(mutation)) throw new Error("Mutacao de qualificacao invalida.");

  if (mutation.action === "suggest") {
    if (!isRecord(mutation.suggestions)) throw new Error("Sugestoes de qualificacao sao obrigatorias.");
    for (const [key, suggestionValue] of Object.entries(mutation.suggestions)) {
      if (!FIELD_KEYS.has(key) || qualification.fields[key].status === "confirmed") continue;
      const suggestion = normalizeSuggestion(suggestionValue);
      qualification.fields[key] = {
        status: "suggested",
        value: suggestion.value,
        source: "ai",
        evidence: suggestion.evidence,
        updatedAt: at,
        updatedBy: actor,
      };
    }
    return qualification;
  }

  const field = requireField(mutation.field);
  if (mutation.action === "clear") {
    qualification.fields[field] = emptyField({ source: "operator", updatedAt: at, updatedBy: actor });
    return qualification;
  }
  if (mutation.action !== "confirm") throw new Error("Acao de qualificacao invalida.");

  const current = qualification.fields[field];
  const value = cleanText(mutation.value) ?? current.value;
  if (!value) throw new Error("Valor e obrigatorio para confirmar a qualificacao.");
  qualification.fields[field] = {
    status: "confirmed",
    value,
    source: "operator",
    evidence: mutation.evidence === undefined ? current.evidence : normalizeEvidence(mutation.evidence),
    updatedAt: at,
    updatedBy: actor,
  };
  return qualification;
}

export function parseQualificationSuggestions(content) {
  if (typeof content !== "string") throw new Error("Resposta da IA nao contem JSON valido.");
  const withoutFences = content.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Resposta da IA nao contem JSON valido.");

  let parsed;
  try {
    parsed = JSON.parse(withoutFences.slice(start, end + 1));
  } catch {
    throw new Error("Resposta da IA nao contem JSON valido.");
  }
  const fields = isRecord(parsed?.fields) ? parsed.fields : parsed;
  if (!isRecord(fields)) throw new Error("Resposta da IA nao contem campos validos.");

  const suggestions = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!FIELD_KEYS.has(key)) continue;
    try {
      suggestions[key] = normalizeSuggestion(value);
    } catch {
      // Um campo malformado nao invalida outras sugestoes que possuem evidencia.
    }
  }
  if (Object.keys(suggestions).length === 0) throw new Error("Resposta da IA nao contem sugestoes com evidencia valida.");
  return suggestions;
}
