import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("solicitacao de acesso nao revela a allowlist e nao cria usuario desconhecido", () => {
  const request = source("../src/app/api/auth/request/route.ts");
  assert.match(request, /isAdminEmail/);
  assert.match(request, /shouldCreateUser:\s*false/);
  assert.match(request, /status:\s*202/);
});

test("magic link emite cookie HttpOnly e logout revoga a sessao local", () => {
  const verify = source("../src/app/api/auth/link/route.ts");
  const logout = source("../src/app/api/auth/logout/route.ts");
  assert.match(verify, /createAdminSession/);
  assert.match(verify, /httpOnly:\s*true/);
  assert.match(verify, /sameSite:\s*"lax"/);
  assert.match(logout, /maxAge:\s*0/);
});

test("magic link e validado no Supabase antes de emitir sessao administrativa", () => {
  const link = source("../src/app/api/auth/link/route.ts");
  assert.match(link, /getUser/);
  assert.match(link, /isAdminEmail/);
  assert.match(link, /createAdminSession/);
  assert.match(link, /httpOnly:\s*true/);
});
