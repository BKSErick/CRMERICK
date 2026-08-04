import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("proxy do Next 16 protege paginas e APIs com a mesma sessao", () => {
  const source = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  assert.match(source, /export async function proxy/);
  assert.match(source, /verifyAdminSession/);
  assert.match(source, /ADMIN_SESSION_COOKIE/);
  assert.match(source, /status:\s*401/);
  assert.match(source, /\/login/);
});
