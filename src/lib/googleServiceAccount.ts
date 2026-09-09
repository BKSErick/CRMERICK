import crypto from "crypto";

// Autenticacao por service account para as APIs do Google (GA4 Data API e Search
// Console). Sem dependencia nova: o JWT RS256 e assinado com o crypto do Node.
//
// Vive separado de googleAnalytics.ts porque o token e POR ESCOPO: Analytics e
// Search Console pedem escopos diferentes, e um cache unico devolveria o token
// errado para a segunda API que chamasse.

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const SCOPE_ANALYTICS = "https://www.googleapis.com/auth/analytics.readonly";
export const SCOPE_SEARCH_CONSOLE = "https://www.googleapis.com/auth/webmasters.readonly";

const CLIENT_EMAIL = process.env.GA_SERVICE_ACCOUNT_EMAIL;
// A chave vem do JSON do service account com \n escapado (padrao em env de deploy).
const PRIVATE_KEY = process.env.GA_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");

export function hasServiceAccount(): boolean {
  return Boolean(CLIENT_EMAIL && PRIVATE_KEY);
}

export function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const cache = new Map<string, { value: string; expiresAt: number }>();

export async function getAccessToken(scope: string): Promise<string | null> {
  if (!CLIENT_EMAIL || !PRIVATE_KEY) return null;

  const cached = cache.get(scope);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

  const issuedAt = Math.floor(Date.now() / 1000);
  const claim = { iss: CLIENT_EMAIL, scope, aud: TOKEN_URL, iat: issuedAt, exp: issuedAt + 3600 };
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
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const body = await res.json();
    if (!body?.access_token) return null;

    cache.set(scope, {
      value: body.access_token as string,
      expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
    });
    return body.access_token as string;
  } catch {
    return null;
  }
}
