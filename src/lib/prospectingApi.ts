import { normalizeInstagramIdentity, type ProspectingVertical } from "./prospecting.ts";

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown) {
  const text = asTrimmedString(value);
  return text || null;
}

function parseVertical(value: unknown): ProspectingVertical {
  if (value === "odontologia" || value === "estetica") return value;
  throw new Error("Vertical invalida. Use odontologia ou estetica.");
}

export function parseSearchRequest(value: unknown) {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const city = asTrimmedString(body.city).replace(/\s+/g, " ");
  const uf = asTrimmedString(body.uf).toUpperCase();
  const vertical = parseVertical(body.vertical);
  if (city.length < 3 || city.length > 80) throw new Error("Cidade valida e obrigatoria.");
  if (!/^[A-Z]{2}$/.test(uf)) throw new Error("UF deve ter duas letras.");
  return { city, uf, vertical };
}

export function parseImportRequest(value: unknown) {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const vertical = parseVertical(body.vertical);
  const rawCandidate = body.candidate && typeof body.candidate === "object"
    ? body.candidate as Record<string, unknown>
    : {};
  const name = asTrimmedString(rawCandidate.name);
  const instagramUrl = asTrimmedString(rawCandidate.instagramUrl);
  const instagramUsername = normalizeInstagramIdentity(instagramUrl);
  if (name.length < 2 || name.length > 160) throw new Error("Nome da empresa e obrigatorio.");
  if (!instagramUsername) throw new Error("Perfil do Instagram valido e obrigatorio.");

  const matchConfidence: "low" | "medium" | "high" = rawCandidate.matchConfidence === "high" || rawCandidate.matchConfidence === "medium"
    ? rawCandidate.matchConfidence
    : "low";
  return {
    vertical,
    candidate: {
      name,
      city: asNullableString(rawCandidate.city),
      uf: asNullableString(rawCandidate.uf)?.toUpperCase() ?? null,
      address: asNullableString(rawCandidate.address),
      mapsCid: asNullableString(rawCandidate.mapsCid),
      phone: asNullableString(rawCandidate.phone),
      website: safePublicHttpUrl(asNullableString(rawCandidate.website)),
      rating: Number.isFinite(Number(rawCandidate.rating)) ? Number(rawCandidate.rating) : null,
      reviewsCount: Number.isFinite(Number(rawCandidate.reviewsCount)) ? Number(rawCandidate.reviewsCount) : 0,
      instagramUrl: `https://www.instagram.com/${instagramUsername}/`,
      instagramUsername,
      matchConfidence,
      matchSource: asNullableString(rawCandidate.matchSource),
      evidence: rawCandidate.evidence && typeof rawCandidate.evidence === "object" && !Array.isArray(rawCandidate.evidence)
        ? rawCandidate.evidence as Record<string, unknown>
        : {},
    },
  };
}

export function safePublicHttpUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host === "::1" || host.endsWith(".local")) return null;
    const parts = host.split(".").map(Number);
    if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
      const [a, b] = parts;
      if (
        a === 0 || a === 10 || a === 127 || a === 169 && b === 254 ||
        a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168
      ) return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
