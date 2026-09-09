import { getAccessToken, hasServiceAccount, SCOPE_ANALYTICS } from "@/lib/googleServiceAccount";

// Acesso de leitura ao GA4 (Data API) via service account. A autenticacao mora em
// googleServiceAccount.ts porque o Search Console usa a mesma conta em outro escopo.

const DATA_API = "https://analyticsdata.googleapis.com/v1beta";

const PROPERTY_ID = process.env.GA_PROPERTY_ID;

export function isGaConfigured(): boolean {
  return Boolean(PROPERTY_ID) && hasServiceAccount();
}

export type GaEventRow = { eventName: string; eventCount: number; activeUsers: number };
export type GaPageRow = { pagePath: string; sessions: number; activeUsers: number };
export type GaDayRow = { date: string; sessions: number; activeUsers: number };
export type GaSourceRow = { channel: string; source: string; sessions: number; activeUsers: number };
export type GaDeviceRow = { device: string; sessions: number };

type ReportResponse = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
};

async function runReport(body: Record<string, unknown>): Promise<ReportResponse | null> {
  const token = await getAccessToken(SCOPE_ANALYTICS);
  if (!token || !PROPERTY_ID) return null;

  try {
    const res = await fetch(`${DATA_API}/properties/${PROPERTY_ID}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ReportResponse;
  } catch {
    return null;
  }
}

const num = (value?: string) => Number(value) || 0;

/** Contagem por evento nos ultimos N dias. */
export async function fetchGaEvents(days = 30): Promise<GaEventRow[] | null> {
  const report = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }, { name: "activeUsers" }],
    limit: 100,
  });
  if (!report) return null;

  return (report.rows ?? []).map((row) => ({
    eventName: row.dimensionValues?.[0]?.value ?? "",
    eventCount: num(row.metricValues?.[0]?.value),
    activeUsers: num(row.metricValues?.[1]?.value),
  }));
}

/** Sessoes por pagina — alimenta as linhas de trafego do radar de Sinais. */
export async function fetchGaPages(days = 30, limit = 50): Promise<GaPageRow[] | null> {
  const report = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  });
  if (!report) return null;

  return (report.rows ?? []).map((row) => ({
    pagePath: row.dimensionValues?.[0]?.value ?? "",
    sessions: num(row.metricValues?.[0]?.value),
    activeUsers: num(row.metricValues?.[1]?.value),
  }));
}

/** Sessoes por dia — mostra se o trafego cresce ou so teve um pico e morreu. */
export async function fetchGaDaily(days = 30): Promise<GaDayRow[] | null> {
  const report = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
    limit: 400,
  });
  if (!report) return null;

  return (report.rows ?? []).map((row) => {
    // O GA4 devolve a data como "20260909"; normalizamos para ISO.
    const bruto = row.dimensionValues?.[0]?.value ?? "";
    const date = bruto.length === 8 ? `${bruto.slice(0, 4)}-${bruto.slice(4, 6)}-${bruto.slice(6, 8)}` : bruto;
    return { date, sessions: num(row.metricValues?.[0]?.value), activeUsers: num(row.metricValues?.[1]?.value) };
  });
}

/** De onde vem o acesso: canal (Organic, Direct, Referral...) e a origem crua. */
export async function fetchGaSources(days = 30, limit = 25): Promise<GaSourceRow[] | null> {
  const report = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "sessionDefaultChannelGroup" }, { name: "sessionSource" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  });
  if (!report) return null;

  return (report.rows ?? []).map((row) => ({
    channel: row.dimensionValues?.[0]?.value ?? "",
    source: row.dimensionValues?.[1]?.value ?? "",
    sessions: num(row.metricValues?.[0]?.value),
    activeUsers: num(row.metricValues?.[1]?.value),
  }));
}

/** Celular x desktop: decide onde a pagina precisa funcionar bem primeiro. */
export async function fetchGaDevices(days = 30): Promise<GaDeviceRow[] | null> {
  const report = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "deviceCategory" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 10,
  });
  if (!report) return null;

  return (report.rows ?? []).map((row) => ({
    device: row.dimensionValues?.[0]?.value ?? "",
    sessions: num(row.metricValues?.[0]?.value),
  }));
}
