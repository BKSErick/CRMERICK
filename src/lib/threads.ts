import { createHmac, timingSafeEqual } from "node:crypto";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";

// Threads (Meta) tem host proprio e token proprio: nada do Instagram/Facebook funciona aqui.
// O token nasce de um OAuth no navegador (usuario autoriza), vive 60 dias e se renova sozinho.
export const THREADS_GRAPH = "https://graph.threads.net";
export const THREADS_API = `${THREADS_GRAPH}/v1.0`;
export const THREADS_PROVIDER = "threads";
const SCOPES = ["threads_basic", "threads_manage_insights"];
const RENEW_WHEN_DAYS_LEFT = 7;

export type ThreadsToken = {
  accessToken: string;
  accountId: string;
  username: string | null;
  expiresAt: string | null;
};

export function getRedirectUri() {
  return (
    process.env.THREADS_REDIRECT_URI ||
    "https://crmerick.vercel.app/api/threads/callback"
  );
}

export function buildAuthorizeUrl() {
  const appId = process.env.THREADS_APP_ID;
  if (!appId) throw new Error("THREADS_APP_ID nao configurado no servidor.");
  const url = new URL("https://threads.net/oauth/authorize");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", getRedirectUri());
  url.searchParams.set("scope", SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}

export async function loadStoredToken(): Promise<ThreadsToken | null> {
  const supabase = getCrmSupabaseAdmin();
  const { data, error } = await supabase
    .from("integration_settings")
    .select("access_token, account_id, username, token_expires_at")
    .eq("provider", THREADS_PROVIDER)
    .maybeSingle();

  if (error || !data?.access_token || !data?.account_id) return null;
  return {
    accessToken: data.access_token,
    accountId: data.account_id,
    username: data.username ?? null,
    expiresAt: data.token_expires_at ?? null,
  };
}

export async function saveToken(token: {
  accessToken: string;
  accountId: string;
  username?: string | null;
  expiresIn?: number | null;
}) {
  const supabase = getCrmSupabaseAdmin();
  const expiresAt = token.expiresIn
    ? new Date(Date.now() + token.expiresIn * 1000).toISOString()
    : null;

  const { error } = await supabase.from("integration_settings").upsert(
    {
      provider: THREADS_PROVIDER,
      access_token: token.accessToken,
      account_id: token.accountId,
      username: token.username ?? null,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" },
  );
  if (error) throw new Error(`Falha ao salvar token do Threads: ${error.message}`);
  return { expiresAt };
}

// code (do callback) -> token curto (1h) -> token longo (60 dias)
export async function exchangeCodeForToken(code: string) {
  const appId = process.env.THREADS_APP_ID;
  const appSecret = process.env.THREADS_APP_SECRET;
  if (!appId || !appSecret) throw new Error("THREADS_APP_ID/THREADS_APP_SECRET ausentes.");

  const form = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: getRedirectUri(),
    code,
  });
  const shortRes = await fetch(`${THREADS_GRAPH}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const short = await shortRes.json();
  if (!shortRes.ok || !short.access_token) {
    throw new Error(short?.error_message ?? short?.error?.message ?? "Troca do code falhou.");
  }

  const longUrl = new URL(`${THREADS_GRAPH}/access_token`);
  longUrl.searchParams.set("grant_type", "th_exchange_token");
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("access_token", short.access_token);
  const longRes = await fetch(longUrl);
  const long = await longRes.json();

  // Se a troca falhar, o token curto ainda serve por 1h — melhor guardar do que perder.
  const accessToken: string = long.access_token ?? short.access_token;
  const expiresIn: number | null = long.expires_in ?? 3600;
  return { accessToken, accountId: String(short.user_id), expiresIn };
}

// Renova quando falta menos de uma semana. Token do Threads so renova se tiver 24h+ de vida.
export async function refreshIfNeeded(token: ThreadsToken): Promise<ThreadsToken> {
  if (!token.expiresAt) return token;
  const msLeft = new Date(token.expiresAt).getTime() - Date.now();
  if (msLeft > RENEW_WHEN_DAYS_LEFT * 86400 * 1000) return token;

  try {
    const url = new URL(`${THREADS_GRAPH}/refresh_access_token`);
    url.searchParams.set("grant_type", "th_refresh_token");
    url.searchParams.set("access_token", token.accessToken);
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok || !json.access_token) return token;

    await saveToken({
      accessToken: json.access_token,
      accountId: token.accountId,
      username: token.username,
      expiresIn: json.expires_in ?? null,
    });
    return { ...token, accessToken: json.access_token };
  } catch {
    return token;
  }
}

// signed_request = base64url(assinatura) + "." + base64url(payload), assinado com o app secret.
// Usado nos callbacks de desinstalar e de exclusao de dados. Assinatura invalida => null.
export function parseSignedRequest(
  signed: string,
  appSecret: string | undefined,
): Record<string, unknown> | null {
  if (!signed || !appSecret) return null;
  const [sigB64, payloadB64] = signed.split(".");
  if (!sigB64 || !payloadB64) return null;

  try {
    const esperada = createHmac("sha256", appSecret).update(payloadB64).digest();
    const recebida = Buffer.from(sigB64, "base64url");
    if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
    return JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

type InsightRow = {
  name: string;
  total_value?: { value?: number };
  values?: { value?: number }[];
};

export function sumThreadsInsights(data: InsightRow[] | undefined) {
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    out[row.name] =
      row.total_value?.value ?? (row.values ?? []).reduce((acc, v) => acc + (v.value ?? 0), 0);
  }
  return out;
}