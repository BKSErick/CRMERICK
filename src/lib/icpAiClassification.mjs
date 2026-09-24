const PROTECTED_STAGES = new Set([
  "qualified",
  "agendamento",
  "reuniao",
  "proposal",
  "negotiation",
  "won",
]);

const foldText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function camposEvidenciaIcp(deal) {
  return [deal?.segment, deal?.segment_norm, deal?.cnae_descricao, deal?.porte]
    .map((value) => String(value ?? "").trim())
    .filter((value) => value && !/^\((?:vazio|sem)\)$/i.test(value));
}

function evidenciaExplicita(evidence, deal) {
  const foldedEvidence = foldText(evidence);
  if (foldedEvidence.length < 6) return false;
  return camposEvidenciaIcp(deal).some((source) => foldText(source).includes(foldedEvidence));
}

/**
 * Fecha a porta entre a resposta do modelo e o CRM.
 *
 * Nome fantasia nao e evidencia suficiente: `sim`/`nao` exige nivel 2 e trecho
 * literal de segmento, CNAE ou porte. Todo o resto continua bloqueado como incerto.
 */
export function normalizarDecisaoIcpIa({ result, deal }) {
  if (!result?.ok) {
    return {
      persist: false,
      veredito: "incerto",
      isIcp: null,
      confidence: 0,
      evidence: "",
      model: null,
      segment: null,
      reason: result?.reason ?? "falha_da_ia",
    };
  }

  const icp = result.answers?.icp;
  const confidenceAnswer = result.answers?.confianca;
  if (icp?.type !== "choice" || confidenceAnswer?.type !== "score") {
    return {
      persist: false,
      veredito: "incerto",
      isIcp: null,
      confidence: 0,
      evidence: String(result.evidencia ?? "").trim(),
      model: result.model ?? null,
      segment: null,
      reason: "resposta_tipagem_invalida",
    };
  }

  const rawVerdict = icp.choice;
  const confidence = Number(confidenceAnswer.level ?? 0);
  const evidence = String(result.evidencia ?? "").trim().slice(0, 500);
  const decisive =
    (rawVerdict === "sim" || rawVerdict === "nao") &&
    confidence === 2 &&
    evidenciaExplicita(evidence, deal);
  const protectedDowngrade = rawVerdict === "nao" && PROTECTED_STAGES.has(String(deal?.stage ?? ""));
  const veredito = decisive && !protectedDowngrade ? rawVerdict : "incerto";
  const segmentAnswer = result.answers?.segmento;

  return {
    persist: true,
    veredito,
    isIcp: veredito === "sim" ? true : veredito === "nao" ? false : null,
    confidence,
    evidence,
    model: [result.provider, result.model].filter(Boolean).join("/") || null,
    segment:
      veredito !== "incerto" && segmentAnswer?.type === "choice" && segmentAnswer.choice !== "outro"
        ? segmentAnswer.choice
        : null,
    reason: protectedDowngrade
      ? "estagio_protegido"
      : decisive
        ? "evidencia_explicita"
        : "evidencia_ou_confianca_insuficiente",
  };
}

const icpAiClassification = { camposEvidenciaIcp, normalizarDecisaoIcpIa };
export default icpAiClassification;
