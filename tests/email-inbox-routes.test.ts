import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const listRoute = readFileSync(new URL("../src/app/api/emails/route.ts", import.meta.url), "utf8");
const readRoute = readFileSync(new URL("../src/app/api/emails/read/route.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../src/lib/emailInboxRepository.ts", import.meta.url), "utf8");

test("API lista threads com pagina server-side fixa em dez", () => {
  assert.match(listRoute, /inboxPageWindow/);
  assert.match(repository, /\.range\(window\.from,\s*window\.to\)/);
  assert.match(repository, /count:\s*"exact"/);
  assert.match(repository, /last_message_at/);
});

test("API carrega mensagens somente para a thread selecionada", () => {
  assert.match(listRoute, /thread/);
  assert.match(repository, /from\("messages"\)/);
  assert.match(repository, /\.eq\("email_thread_id",\s*threadId\)/);
  assert.match(repository, /\.order\("occurred_at",\s*\{\s*ascending:\s*true/);
});

test("marcar como lida zera thread e atualiza mensagens recebidas", () => {
  assert.match(readRoute, /markThreadRead/);
  assert.match(repository, /unread_count:\s*0/);
  assert.match(repository, /status:\s*"read"/);
  assert.match(repository, /direction",\s*"received"/);
});
