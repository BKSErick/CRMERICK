import crypto from "crypto";

// Acesso de leitura ao GA4 (Data API) via service account. Sem dependencia nova:
// o JWT RS256 e assinado com o crypto do Node, igual ao resto do projeto.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";

const PROPERTY_ID = process.env.GA_PROPERTY_ID;
const CLIENT_EMAIL = process.env.GA_SERVICE_ACCOUNT_EMAIL;
// A chave vem do JSON do service account com \n escapado (padrao em env de deploy).
const PRIVATE_KEY = process.env.GA_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");

export function isGaConfigured(): boolean {
  return Boolean(PROPERTY_ID && CLIENT_EMAIL && PRIVATE_KEY);
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (!CLIENT_EMAIL || !PRIVATE_KEY) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const issuedAt = Math.floor(Date.now() / 1000);
  const claim = {
    iss: CLIENT_EMAIL,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  };

  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify(claim))}`;

  let assertion: string;
  try {
    const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(PRIVATE_KEY);
    assertion = `${unsigned}.${base64url(signature)}`;
  } catch {
    // Chave malformada (escape de \n errado e o caso comum).
    return null;
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const body = await res.json();
    if (!body?.access_token) return null;

    cachedToken = {
      value: body.access_token as string,
      expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
    };
    return cachedToken.value;
  } catch {
    return null;
  }
}

export type GaEventRow = { eventName: string; eventCount: number; activeUsers: number };
export type GaPageRow = { pagePath: string; sessions: number; activeUsers: number };

type ReportResponse = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
};

async function runReport(body: Record<string, unknown>): Promise<ReportResponse | null> {
  const token = await getAccessToken();
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
