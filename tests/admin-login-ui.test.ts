import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("login envia email e senha ao endpoint server-side sem embutir credenciais", () => {
  const source = readFileSync(new URL("../src/app/login/LoginForm.tsx", import.meta.url), "utf8");
  assert.match(source, /api\/auth\/login/);
  assert.match(source, /type="password"/);
  assert.match(source, /current-password/);
  assert.match(source, /Entrar no CRM/);
  assert.doesNotMatch(source, /api\/auth\/request|link de acesso|CRM_ADMIN_EMAIL/i);
});

test("layout nao processa tokens de magic link no navegador", () => {
  const source = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /SupabaseAuthBridge|access_token/);
});

test("sidebar encerra a sessao administrativa", () => {
  const source = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
  assert.match(source, /api\/auth\/logout/);
  assert.match(source, /Sair/);
});
