import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL("../src/app/api/webhooks/brevo/conversations/route.ts", import.meta.url),
  "utf8",
);
const repository = readFileSync(
  new URL("../src/lib/brevoConversationRepository.ts", import.meta.url),
  "utf8",
);
const adminAuth = readFileSync(new URL("../src/lib/adminAuth.ts", import.meta.url), "utf8");

test("rota Brevo exige segredo server-side e limita payload", () => {
  assert.match(route, /BREVO_CONVERSATIONS_WEBHOOK_SECRET/);
  assert.match(route, /isValidBrevoWebhookSecret/);
  assert.match(route, /authorization/i);
  assert.match(route, /content-length/i);
  assert.match(route, /status:\s*401/);
  assert.match(route, /status:\s*413/);
});

test("rota Brevo e publica no proxy, mas continua autenticada pelo proprio segredo", () => {
  assert.match(adminAuth, /pathname\.startsWith\("\/api\/webhooks\/brevo\/conversations"\)/);
});

test("repositorio deduplica pelo provider_message_id antes de inserir", () => {
  assert.match(repository, /brevo_conversations/);
  assert.match(repository, /provider_message_id/);
  assert.match(repository, /\.in\("provider_message_id"/);
  assert.match(repository, /23505/);
  assert.doesNotMatch(repository, /rawUnsafeHtml/);
});

test("repositorio casa contato por email e nao cria cadastro desconhecido", () => {
  assert.match(repository, /from\("contacts"\)/);
  assert.match(repository, /\.ilike\("email"/);
  assert.doesNotMatch(repository, /from\("contacts"\)\.insert/);
  assert.doesNotMatch(repository, /from\("deals"\)\.insert/);
});
