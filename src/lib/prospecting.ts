import type { FollowupTier } from "@/lib/followup";

export type ProspectingChannel = "instagram" | "whatsapp" | "email" | "linkedin";
export type ProspectingVertical = "odontologia" | "estetica";
export type ChannelStatus =
  | "review"
  | "ready"
  | "opened"
  | "contacted"
  | "replied"
  | "paused"
  | "opted_out";

export type InstagramKanbanColumn = "to_contact" | "opened" | "followup" | "replied" | "archived";

export function instagramKanbanColumnForStatus(status?: ChannelStatus | string | null): InstagramKanbanColumn {
  if (status === "opened") return "opened";
  if (status === "contacted") return "followup";
  if (status === "replied") return "replied";
  if (status === "paused" || status === "opted_out") return "archived";
  return "to_contact";
}

export type ChannelEvent = {
  channel: ProspectingChannel;
  event: "opened" | "sent" | "received" | "opted_out";
  occurredAt: string;
};

export type ChannelHistory = {
  channel: ProspectingChannel;
  outboundCount: number;
  inboundCount: number;
  hasReply: boolean;
  optedOut: boolean;
  lastOpenedAt: string | null;
  lastOutboundAt: string | null;
  lastInboundAt: string | null;
};

const VERTICAL_QUERIES: Record<ProspectingVertical, readonly string[]> = {
  odontologia: [
    "clinica odontologica",
    "dentista",
    "implante dentario",
    "ortodontia",
    "invisalign",
  ],
  estetica: [
    "clinica de estetica",
    "estetica avancada",
    "depilacao a laser",
    "harmonizacao facial",
    "botox",
  ],
};

const INSTAGRAM_RESERVED_PATHS = new Set([
  "accounts",
  "direct",
  "explore",
  "p",
  "reel",
  "reels",
  "stories",
]);

function cleanLocationPart(value: string) {
  return value.replace(/[^\p{L}\p{N}\s.'-]/gu, " ").replace(/\s+/g, " ").trim();
}

function addUtcDays(value: string, days: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function buildSearchQueries(vertical: ProspectingVertical, city: string, uf: string) {
  const terms = VERTICAL_QUERIES[vertical];
  if (!terms) throw new Error("Vertical invalida para prospeccao Instagram.");

  const cleanCity = cleanLocationPart(city);
  const cleanUf = cleanLocationPart(uf).toUpperCase();
  if (!cleanCity || !/^[A-Z]{2}$/.test(cleanUf)) {
    throw new Error("Cidade e UF validas sao obrigatorias.");
  }

  const location = `${cleanCity} ${cleanUf}`;
  return {
    maps: terms.map((term) => `${term} em ${location}`),
    profiles: terms.map((term) => `site:instagram.com ${term} "${cleanCity}" ${cleanUf}`),
  };
}

export function normalizeInstagramIdentity(value?: string | null) {
  const raw = value?.trim();
  if (!raw) return null;

  if (raw.startsWith("@")) {
    const username = raw.slice(1).toLowerCase();
    return /^[a-z0-9._]{1,30}$/.test(username) ? username : null;
  }

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "instagram.com") return null;
    const username = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    if (!username || INSTAGRAM_RESERVED_PATHS.has(username)) return null;
    return /^[a-z0-9._]{1,30}$/.test(username) ? username : null;
  } catch {
    return null;
  }
}

export function preferredChannelForSegment(segment?: string | null) {
  if (segment === "odontologia" || segment === "estetica") return "instagram";
  if (segment === "industrial_b2b") return "email_linkedin_whatsapp";
  return "whatsapp";
}

export function summarizeChannelHistory(
  channel: ProspectingChannel,
  events: readonly ChannelEvent[],
): ChannelHistory {
  const summary: ChannelHistory = {
    channel,
    outboundCount: 0,
    inboundCount: 0,
    hasReply: false,
    optedOut: false,
    lastOpenedAt: null,
    lastOutboundAt: null,
    lastInboundAt: null,
  };

  for (const item of events) {
    if (item.channel !== channel || Number.isNaN(new Date(item.occurredAt).getTime())) continue;
    if (item.event === "opened") {
      if (!summary.lastOpenedAt || item.occurredAt > summary.lastOpenedAt) {
        summary.lastOpenedAt = item.occurredAt;
      }
    } else if (item.event === "sent") {
      summary.outboundCount += 1;
      if (!summary.lastOutboundAt || item.occurredAt > summary.lastOutboundAt) {
        summary.lastOutboundAt = item.occurredAt;
      }
    } else if (item.event === "received") {
      summary.inboundCount += 1;
      summary.hasReply = true;
      if (!summary.lastInboundAt || item.occurredAt > summary.lastInboundAt) {
        summary.lastInboundAt = item.occurredAt;
      }
    } else if (item.event === "opted_out") {
      summary.optedOut = true;
    }
  }

  return summary;
}

export function nextChannelAction(history: ChannelHistory): { tier: Exclude<FollowupTier, "aguardar">; at: string } | null {
  if (history.hasReply || history.optedOut || !history.lastOutboundAt) return null;
  const cadence = [
    { tier: "M1", days: 2 },
    { tier: "M2", days: 3 },
    { tier: "M3", days: 5 },
  ] as const;
  const step = cadence[history.outboundCount - 1];
  if (!step) return null;
  const at = addUtcDays(history.lastOutboundAt, step.days);
  return at ? { tier: step.tier, at } : null;
}
