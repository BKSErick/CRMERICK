import type { FollowupTier } from "./followup.ts";
import { normalizeInstagramIdentity, type ProspectingVertical } from "./prospecting.ts";

export type ProspectingCandidate = {
  name: string;
  city?: string | null;
  uf?: string | null;
  mapsCid?: string | null;
  phone?: string | null;
  website?: string | null;
  instagramUrl?: string | null;
};

export type ExistingProspectingReference = {
  dealId: number;
  name?: string | null;
  mapsCid?: string | null;
  phone?: string | null;
  website?: string | null;
  instagramUsername?: string | null;
};

function fold(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function phoneDigits(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
}

function businessDomain(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (["instagram.com", "facebook.com", "linktr.ee", "wa.me"].includes(host)) return null;
    return host;
  } catch {
    return null;
  }
}

function namesCompatible(companyName: string, profileTitle: string) {
  const ignored = new Set(["a", "as", "clinica", "de", "da", "das", "do", "e", "estetica"]);
  const companyTokens = fold(companyName).split(" ").filter((token) => token.length >= 3 && !ignored.has(token));
  const profile = new Set(fold(profileTitle).split(" "));
  return companyTokens.some((token) => profile.has(token));
}

export function classifyCandidateAgainstCrm(
  candidate: ProspectingCandidate,
  existing: readonly ExistingProspectingReference[],
  suppressionList: readonly string[],
):
  | { state: "blocked"; matchedBy: "suppression_list" }
  | { state: "existing"; dealId: number; matchedBy: "maps_cid" | "name" | "phone" | "domain" | "instagram" }
  | { state: "new"; matchedBy: null } {
  const name = fold(candidate.name);
  if (suppressionList.some((item) => name.includes(fold(item)))) {
    return { state: "blocked", matchedBy: "suppression_list" };
  }

  const checks = [
    {
      key: "maps_cid" as const,
      candidate: candidate.mapsCid,
      existing: (item: ExistingProspectingReference) => item.mapsCid,
    },
    {
      key: "name" as const,
      candidate: name,
      existing: (item: ExistingProspectingReference) => fold(item.name),
    },
    {
      key: "phone" as const,
      candidate: phoneDigits(candidate.phone),
      existing: (item: ExistingProspectingReference) => phoneDigits(item.phone),
    },
    {
      key: "domain" as const,
      candidate: businessDomain(candidate.website),
      existing: (item: ExistingProspectingReference) => businessDomain(item.website),
    },
    {
      key: "instagram" as const,
      candidate: normalizeInstagramIdentity(candidate.instagramUrl),
      existing: (item: ExistingProspectingReference) => normalizeInstagramIdentity(item.instagramUsername),
    },
  ];

  for (const check of checks) {
    if (!check.candidate || String(check.candidate).length < 3) continue;
    const match = existing.find((item) => check.existing(item) === check.candidate);
    if (match) return { state: "existing", dealId: match.dealId, matchedBy: check.key };
  }

  return { state: "new", matchedBy: null };
}

export function rankInstagramEvidence(input: {
  companyName: string;
  profileTitle?: string | null;
  profileUrl?: string | null;
  foundOnOfficialWebsite: boolean;
}) {
  const reasons: string[] = [];
  if (input.foundOnOfficialWebsite) reasons.push("site_oficial");
  if (
    input.profileTitle &&
    input.profileUrl &&
    normalizeInstagramIdentity(input.profileUrl) &&
    namesCompatible(input.companyName, input.profileTitle)
  ) {
    reasons.push("nome_compativel");
  }

  const confidence = reasons.length >= 2 ? "high" : reasons.length === 1 ? "medium" : "low";
  return { confidence, requiresReview: confidence !== "high", reasons };
}

export function createInstagramMessage(input: {
  tier: "initial" | Exclude<FollowupTier, "aguardar">;
  vertical: ProspectingVertical;
  company: string;
  city?: string | null;
}) {
  const company = input.company.trim();
  const location = input.city?.trim() ? ` em ${input.city.trim()}` : "";
  const audience = input.vertical === "odontologia" ? "clinicas odontologicas" : "clinicas de estetica";
  const intent = input.vertical === "odontologia" ? "avaliacao ou procedimento" : "procedimento ou atendimento";

  if (input.tier === "initial") {
    return `Oi! Vi o perfil da ${company}${location}. Eu crio paginas para ${audience} que organizam o interesse por ${intent} antes da conversa chegar no WhatsApp. Posso te mostrar a ideia?`;
  }
  if (input.tier === "M1") {
    return `Oi! Uma ideia que pode fazer sentido para a ${company}: em vez de cada pessoa chegar perguntando tudo do zero, a pagina identifica o interesse e leva o contato mais organizado para o WhatsApp. Quer que eu te mostre o fluxo?`;
  }
  if (input.tier === "M2") {
    return `Oi! Posso montar um esboco curto para a ${company}, mostrando como separar os interesses antes do atendimento. Se fizer sentido, te envio por aqui para avaliar sem compromisso.`;
  }
  return `Oi! Vou encerrar por aqui para nao virar insistencia. Se em algum momento quiser organizar melhor os contatos que chegam pelo Instagram e WhatsApp, pode me chamar. Sucesso para a ${company}!`;
}
