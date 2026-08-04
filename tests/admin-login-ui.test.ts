import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("login solicita magic link do Supabase sem embutir credencial administrativa", () => {
  const source = readFileSync(new URL("../src/app/login/LoginForm.tsx", import.meta.url), "utf8");
  assert.match(source, /api\/auth\/request/);
  assert.match(source, /link de acesso/i);
  assert.doesNotMatch(source, /api\/auth\/verify/);
  assert.doesNotMatch(source, /CRM_ADMIN_EMAIL/);
});

test("bridge troca o token do magic link por sessao HttpOnly e limpa a URL", () => {
  const source = readFileSync(new URL("../src/components/SupabaseAuthBridge.tsx", import.meta.url), "utf8");
  assert.match(source, /access_token/);
  assert.match(source, /api\/auth\/link/);
  assert.match(source, /history\.replaceState/);
  assert.doesNotMatch(source, /console\.log/);
});

test("sidebar encerra a sessao administrativa", () => {
  const source = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
  assert.match(source, /api\/auth\/logout/);
  assert.match(source, /Sair/);
});
