import assert from "node:assert/strict";
import test from "node:test";

import {
  createAdminSession,
  isAdminEmail,
  isPublicCrmPath,
  isPublicCrmRequest,
  safeReturnPath,
  verifyAdminSession,
} from "../src/lib/adminAuth.ts";

const secret = "0123456789abcdef0123456789abcdef";

test("cria e valida sessao assinada sem expor segredo", async () => {
  const token = await createAdminSession({
    email: "Admin@Example.com",
    secret,
    now: 1_700_000_000_000,
    ttlSeconds: 3600,
  });
  assert.doesNotMatch(token, new RegExp(secret));
  assert.deepEqual(await verifyAdminSession(token, secret, 1_700_001_000_000), {
    email: "admin@example.com",
    expiresAt: 1_700_003_600,
  });
  assert.equal(await verifyAdminSession(`${token}x`, secret, 1_700_001_000_000), null);
});

test("sessao expirada e segredo fraco falham fechado", async () => {
  await assert.rejects(
    () => createAdminSession({ email: "admin@example.com", secret: "curto" }),
    /32 caracteres/,
  );
  const token = await createAdminSession({
    email: "admin@example.com",
    secret,
    now: 1_700_000_000_000,
    ttlSeconds: 60,
  });
  assert.equal(await verifyAdminSession(token, secret, 1_700_000_061_000), null);
});

test("allowlist compara email normalizado e sem configuracao recusa tudo", () => {
  assert.equal(isAdminEmail(" Admin@Example.com ", "admin@example.com"), true);
  assert.equal(isAdminEmail("other@example.com", "admin@example.com"), false);
  assert.equal(isAdminEmail("admin@example.com", undefined), false);
});

test("retorno aceita apenas caminho interno", () => {
  assert.equal(safeReturnPath("/instagram?tab=prospecting"), "/instagram?tab=prospecting");
  assert.equal(safeReturnPath("https://evil.example/phish"), "/");
  assert.equal(safeReturnPath("//evil.example/phish"), "/");
});

test("excecoes publicas sao minimas", () => {
  assert.equal(isPublicCrmPath("/login"), true);
  assert.equal(isPublicCrmPath("/api/auth/request"), true);
  assert.equal(isPublicCrmPath("/api/webhooks/uazapi"), true);
  assert.equal(isPublicCrmPath("/_next/static/chunk.js"), true);
  assert.equal(isPublicCrmPath("/api/prospecting"), false);
  assert.equal(isPublicCrmPath("/pipeline"), false);
  assert.equal(isPublicCrmRequest("/api/facebook-pixel", "POST"), true);
  assert.equal(isPublicCrmRequest("/api/facebook-pixel", "GET"), false);
  assert.equal(isPublicCrmRequest("/api/threads/deauthorize", "POST"), true);
  assert.equal(isPublicCrmRequest("/api/threads/delete", "POST"), true);
});
