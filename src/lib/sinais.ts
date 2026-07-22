import type { SupabaseClient } from "@supabase/supabase-js";

// Fonte unica do SINAL de interesse (tabela pixel_events). Vive em lib e nao dentro
// de /api/sinais porque o sinal nao e de uma aba so: quem abriu a pagina hoje precisa
// furar a fila do Comando, aparecer no Pipeline e pesar no follow-up. A aba Sinais e
// apenas o primeiro consumidor.

export type TrafficKind = "inbound" | "outbound";

export type CompanySignal = {
  company: string;
  views: number;
  waClicks: number;
  linkClicks: number;
  lastEvent: string;
  hot: boolean;
  pageUrl: string | null;
};

export const HOT_WINDOW_MS = 48 * 60 * 60 * 1000;

export function normalizeUrl(raw: unknown): { url: string; label: string; host: string } | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const path = parsed.pathname.replace(/\/index\.html$/i, "/").replace(/(.)\/$/, "$1");
    return { url: `${parsed.origin}${path}`, label: path === "" ? "/" : path, host: parsed.host };
  } catch {
    return { url: value, label: value, host: "" };
  }
}

// Cada propriedade digital que traz acesso e uma linha de trafego separada. Classifica
// por HOST, com refinamento por path onde o mesmo host serve varias linhas. Host novo
// vira linha propria em vez de sumir do relatorio.
export function classifySource(host: string, path: string): { key: string; label: string; kind: TrafficKind } {
  const h = host.toLowerCase();
  const p = path.toLowerCase();

  if (h.includes("crmerick")) {
    if (p.startsWith("/huberick-temp")) return { key: "diagnosticos", label: "Diagnosticos (outbound)", kind: "outbound" };
    return { key: "crm", label: "CRM (interno)", kind: "inbound" };
  }
  if (h.includes("lps-")) {
    const slug = p.split("/").filter(Boolean)[1];
    return slug
      ? { key: `lp:${slug}`, label: `Modelo LP: ${slug}`, kind: "outbound" }
      : { key: "lp:hub", label: "Modelos LP (hub)", kind: "outbound" };
  }
  if (p.startsWith("/quiz") || p.startsWith("/resultado")) return { key: "quiz", label: "Quiz Diagnostico", kind: "inbound" };
  if (h.includes("o-strackpagina") || h.includes("ostrack")) return { key: "ostrack", label: "Site OStrack", kind: "inbound" };
  if (h.includes("gthouse")) return { key: "gthouse", label: "Site GT House", kind: "inbound" };
  if (h.includes("viabr")) return { key: "viabr", label: "Site Via BR", kind: "inbound" };
  if (h.includes("metalthec")) return { key: "metalthec", label: "Site Metalthec", kind: "inbound" };
  if (h.includes("linkbio") || h.includes("link-in-bio") || h.includes("euericksena")) {
    return { key: "bio", label: "Link in Bio", kind: "inbound" };
  }
  return { key: h || "desconhecido", label: h || "Origem desconhecida", kind: "inbound" };
}

export const signalKey = (v?: string | null) => (v ?? "").trim().toLowerCase();

// Os nomes de empresa vindos do Garimpo sao longos e o gerador de paginas trunca
// ("ABC Metal - Caixa de Correio - Bicicletario - Quadro de Avisos - Por..."), entao
// a chave exata perde 4 de 9 casamentos. O prefixo antes do primeiro " - " reancora.
export function signalAliases(company: string): string[] {
  const k = signalKey(company);
  if (!k) return [];
  const prefix = k.split(" - ")[0].trim();
  return prefix && prefix !== k ? [k, prefix] : [k];
}

/**
 * Indice de sinal por empresa, pronto para join com deals.company / deals.name.
 * So considera linhas OUTBOUND: link in bio e site proprio sao trafego, nao prospect,
 * e entrariam como empresa fantasma na fila de quem abordar.
 */
export async function getCompanySignals(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<Map<string, CompanySignal>> {
  const { data, error } = await supabase
    .from("pixel_events")
    .select("event_name, page_url, client_name, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw error;

  const byCompany = new Map<string, CompanySignal>();

  for (const row of data ?? []) {
    const page = normalizeUrl(row.page_url);
    if (page && classifySource(page.host, page.label).kind !== "outbound") continue;

    const company = (row.client_name ?? "").trim();
    if (!company) continue;
    const created = row.created_at ? String(row.created_at) : "";

    const entry =
      byCompany.get(signalKey(company)) ??
      ({ company, views: 0, waClicks: 0, linkClicks: 0, lastEvent: created, hot: false, pageUrl: page?.url ?? null } as CompanySignal);

    const name = String(row.event_name ?? "");
    if (name === "DiagnosticoView") entry.views++;
    else if (name === "DiagnosticoWhatsAppClick") entry.waClicks++;
    else entry.linkClicks++;

    if (created && created > entry.lastEvent) entry.lastEvent = created;
    if (!entry.pageUrl && page) entry.pageUrl = page.url;
    byCompany.set(signalKey(company), entry);
  }

  // Expande com os aliases de prefixo para o join tolerar nome truncado.
  const indexed = new Map<string, CompanySignal>();
  for (const entry of byCompany.values()) {
    entry.hot = Boolean(entry.lastEvent) && now.getTime() - new Date(entry.lastEvent).getTime() <= HOT_WINDOW_MS;
    for (const alias of signalAliases(entry.company)) {
      if (!indexed.has(alias)) indexed.set(alias, entry);
    }
  }
  return indexed;
}

/** Peso do sinal na priorizacao da fila: abertura vale, clique no WhatsApp vale muito. */
export function signalWeight(s?: CompanySignal | null): number {
  if (!s) return 0;
  const recency = s.hot ? 2 : 1;
  return (s.views * 2 + s.linkClicks * 3 + s.waClicks * 10) * recency;
}
