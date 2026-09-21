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

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;

  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function hasWindowsLocalPath(value: string): boolean {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Se a URL estiver malformada, a verificacao conservadora usa o valor bruto.
  }
  return /(^|\/)\/?[a-z]:\//i.test(decoded.replace(/\\/g, "/"));
}

/**
 * Tráfego de preview/desenvolvimento nunca representa interesse comercial.
 * A regra cobre loopback, rede privada, hosts .local e caminhos locais do Windows.
 */
export function isTestTrafficUrl(raw: unknown): boolean {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return false;
  if (hasWindowsLocalPath(value)) return true;

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return (
      parsed.protocol === "file:" ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "::1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local") ||
      isPrivateIpv4(hostname)
    );
  } catch {
    return false;
  }
}

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
  // Depois de ostrack: ostrack.mydrion.com.br e linha do OStrack, nao do site.
  if (h.includes("mydrion.com.br") || h === "mydrion.vercel.app") {
    return { key: "mydrion", label: "Site Mydrion", kind: "inbound" };
  }
  return { key: h || "desconhecido", label: h || "Origem desconhecida", kind: "inbound" };
}

/**
 * O link do e-mail frio leva utm_content=d<dealId> (copy-institucional.mjs). Quem clica
 * cai no site proprio, que e trafego inbound por host; a referencia e o que permite ligar
 * a visita ao card sem depender do nome da empresa.
 */
export function emailDealRef(raw: unknown): number | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  try {
    const content = new URL(value).searchParams.get("utm_content") ?? "";
    const match = /^d(\d{1,9})$/.exec(content);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Sinal de PROSPECT (entra no radar e fura a fila do Comando) e o que vem de pagina
 * outbound OU de visita ao site proprio com referencia do deal. O resto e trafego.
 */
export function trafficKindForUrl(raw: unknown): TrafficKind {
  const page = normalizeUrl(raw);
  if (!page) return "inbound";
  if (classifySource(page.host, page.label).kind === "outbound") return "outbound";
  return emailDealRef(raw) !== null ? "outbound" : "inbound";
}

// Cada propriedade nomeia o evento com prefixo proprio (Diagnostico*, MydrionSite*); o
// que importa pro radar e o sufixo. ScrollDepth e engajamento, nao clique: nao conta.
export type SignalEventKind = "view" | "whatsapp" | "scroll" | "click";
export function signalEventKind(eventName: unknown): SignalEventKind {
  const name = String(eventName ?? "");
  if (/View$/.test(name)) return "view";
  if (/WhatsAppClick$/.test(name)) return "whatsapp";
  if (/ScrollDepth$/.test(name)) return "scroll";
  return "click";
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
 * e entrariam como empresa fantasma na fila de quem abordar. A excecao e a visita ao
 * site vinda do e-mail frio com utm_content=d<dealId>: o beacon ja chega gravado com
 * client_name = deals.company, entao ela conta como sinal do prospect.
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
    if (isTestTrafficUrl(row.page_url)) continue;
    const page = normalizeUrl(row.page_url);
    if (page && trafficKindForUrl(row.page_url) !== "outbound") continue;

    const company = (row.client_name ?? "").trim();
    if (!company) continue;
    const created = row.created_at ? String(row.created_at) : "";

    const entry =
      byCompany.get(signalKey(company)) ??
      ({ company, views: 0, waClicks: 0, linkClicks: 0, lastEvent: created, hot: false, pageUrl: page?.url ?? null } as CompanySignal);

    const kind = signalEventKind(row.event_name);
    if (kind === "view") entry.views++;
    else if (kind === "whatsapp") entry.waClicks++;
    else if (kind === "click") entry.linkClicks++;

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
