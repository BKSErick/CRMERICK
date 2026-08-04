export const ADMIN_SESSION_COOKIE = "crm_admin_session";
export const ADMIN_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

type SessionPayload = { email: string; exp: number };

function normalizeEmail(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(value: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function assertSecret(secret?: string | null) {
  if (!secret || secret.length < 32) {
    throw new Error("CRM_AUTH_SECRET precisa ter pelo menos 32 caracteres.");
  }
}

export function isAdminEmail(value?: string | null, configured?: string | null) {
  const email = normalizeEmail(value);
  const admin = normalizeEmail(configured);
  return Boolean(email && admin && email === admin);
}

export async function createAdminSession(options: {
  email: string;
  secret: string;
  now?: number;
  ttlSeconds?: number;
}) {
  assertSecret(options.secret);
  const email = normalizeEmail(options.email);
  if (!email) throw new Error("E-mail administrativo invalido.");
  const exp = Math.floor((options.now ?? Date.now()) / 1000) + (options.ttlSeconds ?? ADMIN_SESSION_TTL_SECONDS);
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ email, exp })));
  const signature = bytesToBase64Url(await hmac(payload, options.secret));
  return `${payload}.${signature}`;
}

export async function verifyAdminSession(token: string | undefined, secret: string | undefined, now = Date.now()) {
  if (!token || !secret || secret.length < 32) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  try {
    const expected = await hmac(payload, secret);
    if (!constantTimeEqual(expected, base64UrlToBytes(signature))) return null;
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as SessionPayload;
    if (!parsed.email || !Number.isInteger(parsed.exp) || parsed.exp <= Math.floor(now / 1000)) return null;
    return { email: normalizeEmail(parsed.email), expiresAt: parsed.exp };
  } catch {
    return null;
  }
}

export function safeReturnPath(value?: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function isPublicCrmPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/auth/callback" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/webhooks/uazapi") ||
    pathname.startsWith("/api/threads/callback") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|webp|ico)$/i.test(pathname)
  );
}

export function isPublicCrmRequest(pathname: string, method: string) {
  if (isPublicCrmPath(pathname)) return true;
  if (method.toUpperCase() !== "POST") return false;
  return [
    "/api/quiz-leads",
    "/api/facebook-pixel",
    "/api/threads/deauthorize",
    "/api/threads/delete",
  ].includes(pathname);
}
