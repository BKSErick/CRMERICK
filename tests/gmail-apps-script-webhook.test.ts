import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeGmailAppsScriptPayload } from "../src/lib/gmailAppsScript.ts";

const route = readFileSync(
  new URL("../src/app/api/webhooks/gmail/apps-script/route.ts", import.meta.url),
  "utf8",
);
const repository = readFileSync(
  new URL("../src/lib/brevoConversationRepository.ts", import.meta.url),
  "utf8",
);
const adminAuth = readFileSync(new URL("../src/lib/adminAuth.ts", import.meta.url), "utf8");

function fixture() {
  return {
    source: "gmail_apps_script",
    thread: {
      id: "gmail-thread-1",
      participantEmail: "decisor@empresa.com.br",
      participantName: "Ana",
      subject: "Re: Diagnostico",
    },
    messages: [{
      id: "gmail-message-1",
      direction: "received",
      text: "Tenho interesse.",
      html: "<script>nao salvar</script>",
      subject: "Re: Diagnostico",
      from: { name: "Ana", email: "decisor@empresa.com.br" },
      to: [{ name: "Mydrion", email: "contato@mydrion.com.br" }],
      cc: [],
      bcc: [],
      replyToEmail: "decisor@empresa.com.br",
      sourceMessageId: "<gmail-message-1@empresa.com.br>",
      occurredAt: 1788955200000,
      attachments: [{ name: "arquivo.pdf", content: "nao aceitar binario" }],
    }],
  };
}

test("normaliza payload Gmail em conversa segura sem HTML ou binarios", () => {
  const normalized = normalizeGmailAppsScriptPayload(fixture());

  assert.equal(normalized?.thread.providerThreadId, "gmail-thread-1");
  assert.equal(normalized?.thread.participantEmail, "decisor@empresa.com.br");
  assert.equal(normalized?.messages[0]?.providerMessageId, "gmail-message-1");
  assert.equal(normalized?.messages[0]?.content, "Tenho interesse.");
  assert.equal(normalized?.messages[0]?.htmlContent, "");
  assert.deepEqual(normalized?.messages[0]?.attachments, []);
  assert.equal(normalized?.messages[0]?.occurredAt, "2026-09-09T12:00:00.000Z");
});

test("rejeita fonte, ids, email, direcao e lotes invalidos", () => {
  assert.equal(normalizeGmailAppsScriptPayload({ ...fixture(), source: "outro" }), null);
  assert.throws(
    () => normalizeGmailAppsScriptPayload({ ...fixture(), thread: { ...fixture().thread, id: "" } }),
    /thread/i,
  );
  assert.throws(
    () => normalizeGmailAppsScriptPayload({
      ...fixture(),
      thread: { ...fixture().thread, participantEmail: "email-invalido" },
    }),
    /email/i,
  );
  assert.throws(
    () => normalizeGmailAppsScriptPayload({
      ...fixture(),
      messages: [{ ...fixture().messages[0], direction: "delete" }],
    }),
    /direcao/i,
  );
  assert.throws(
    () => normalizeGmailAppsScriptPayload({
      ...fixture(),
      messages: Array.from({ length: 51 }, (_, index) => ({
        ...fixture().messages[0],
        id: `gmail-message-${index}`,
      })),
    }),
    /50 mensagens/i,
  );
});

test("rota Gmail exige Bearer secret, limita payload e usa provider isolado", () => {
  assert.match(route, /BREVO_CONVERSATIONS_WEBHOOK_SECRET/);
  assert.match(route, /Bearer/);
  assert.match(route, /MAX_PAYLOAD_BYTES\s*=\s*1_000_000/);
  assert.match(route, /normalizeGmailAppsScriptPayload/);
  assert.match(route, /createEmailConversationRepository/);
  assert.match(route, /gmail_apps_script/);
  assert.match(route, /status:\s*401/);
  assert.match(route, /status:\s*413/);
});

test("rota Gmail e publica no proxy e repositorio separa provider", () => {
  assert.match(adminAuth, /pathname\.startsWith\("\/api\/webhooks\/gmail\/apps-script"\)/);
  assert.match(repository, /createEmailConversationRepository/);
  assert.match(repository, /provider:\s*provider/);
  assert.match(repository, /\.eq\("provider",\s*provider\)/);
});
