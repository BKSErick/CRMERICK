import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("login valida senha no Supabase e limita acesso ao email administrativo", () => {
  const login = source("../src/app/api/auth/login/route.ts");
  assert.match(login, /isAdminEmail/);
  assert.match(login, /signInWithPassword/);
  assert.match(login, /createAdminSession/);
  assert.match(login, /httpOnly:\s*true/);
  assert.match(login, /sameSite:\s*"lax"/);
  assert.doesNotMatch(login, /signInWithOtp|generateLink|createUser/);
});

test("logout revoga a sessao local", () => {
  const logout = source("../src/app/api/auth/logout/route.ts");
  assert.match(logout, /maxAge:\s*0/);
});
