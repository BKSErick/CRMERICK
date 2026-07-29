import assert from "node:assert/strict";
import test from "node:test";

import {
  hashWebhookSecret,
  isValidWebhookSecret,
  isValidWebhookSecretHash,
  normalizeUazapiWebhook,
} from "../src/lib/uazapiWebhook.ts";

const baseMessage = {
  event: "messages",
  instance: "instance-test",
  data: {
    id: "r-internal",
    messageid: "3EB0A1",
    chatid: "5531999999999@s.whatsapp.net",
    sender: "5531999999999@s.whatsapp.net",
    senderName: "Cliente Teste",
    isGroup: false,
    fromMe: false,
    messageType: "Conversation",
    messageTimestamp: 1_753_814_800_000,
    status: "Delivered",
    text: "Tenho interesse no projeto.",
    wasSentByApi: false,
  },
};

test("valida o segredo do webhook sem aceitar ausente ou diferente", () => {
  assert.equal(isValidWebhookSecret("segredo-correto", "segredo-correto"), true);
  assert.equal(isValidWebhookSecret("segredo-errado", "segredo-correto"), false);
  assert.equal(isValidWebhookSecret(null, "segredo-correto"), false);
  assert.equal(isValidWebhookSecret("segredo-correto", undefined), false);
});

test("valida com seguranca um segredo aleatorio armazenado apenas como hash", () => {
  const hash = hashWebhookSecret("segredo-aleatorio");
  assert.notEqual(hash, "segredo-aleatorio");
  assert.equal(isValidWebhookSecretHash("segredo-aleatorio", hash), true);
  assert.equal(isValidWebhookSecretHash("segredo-incorreto", hash), false);
  assert.equal(isValidWebhookSecretHash(null, hash), false);
});

test("normaliza mensagem recebida usando remetente como telefone do contato", () => {
  const result = normalizeUazapiWebhook(baseMessage);

  assert.equal(result.kind, "message");
  if (result.kind !== "message") return;

  assert.deepEqual(result.message, {
    provider: "uazapi",
    providerMessageId: "3EB0A1",
    instanceId: "instance-test",
    chatId: "5531999999999@s.whatsapp.net",
    contactPhone: "5531999999999",
    senderName: "Cliente Teste",
    direction: "received",
    messageType: "Conversation",
    content: "Tenho interesse no projeto.",
    occurredAt: "2025-07-29T18:46:40.000Z",
  });
});

test("normaliza mensagem enviada usando o chat como telefone do contato", () => {
  const result = normalizeUazapiWebhook({
    ...baseMessage,
    data: {
      ...baseMessage.data,
      messageid: "3EB0A2",
      sender: "5531888888888@s.whatsapp.net",
      fromMe: true,
      text: "Posso te mostrar uma proposta?",
    },
  });

  assert.equal(result.kind, "message");
  if (result.kind !== "message") return;
  assert.equal(result.message.direction, "sent");
  assert.equal(result.message.contactPhone, "5531999999999");
});

test("aceita o envelope data.message e timestamp em segundos", () => {
  const result = normalizeUazapiWebhook({
    event: "message",
    instance: "instance-test",
    data: {
      message: {
        ...baseMessage.data,
        messageid: "3EB0A3",
        messageTimestamp: 1_753_814_800,
      },
    },
  });

  assert.equal(result.kind, "message");
  if (result.kind !== "message") return;
  assert.equal(result.message.occurredAt, "2025-07-29T18:46:40.000Z");
});

test("ignora grupos e mensagens originadas pela API", () => {
  const group = normalizeUazapiWebhook({
    ...baseMessage,
    data: { ...baseMessage.data, isGroup: true, chatid: "120363000000@g.us" },
  });
  const apiMessage = normalizeUazapiWebhook({
    ...baseMessage,
    data: { ...baseMessage.data, wasSentByApi: true },
  });

  assert.deepEqual(group, { kind: "ignored", reason: "group" });
  assert.deepEqual(apiMessage, { kind: "ignored", reason: "sent_by_api" });
});

test("ignora eventos diferentes e rejeita mensagem sem identificador", () => {
  const connection = normalizeUazapiWebhook({ event: "connection", data: {} });
  const missingId = normalizeUazapiWebhook({
    ...baseMessage,
    data: { ...baseMessage.data, id: "", messageid: "" },
  });

  assert.deepEqual(connection, { kind: "ignored", reason: "unsupported_event" });
  assert.deepEqual(missingId, { kind: "ignored", reason: "missing_message_id" });
});
