import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidBrevoWebhookSecret,
  normalizeBrevoConversationEvent,
} from "../src/lib/brevoConversations.ts";

const emailMessage = {
  id: "message-1",
  type: "visitor",
  text: "Gostaria de entender melhor a proposta.",
  html: "<p>Gostaria de entender melhor a proposta.</p>",
  rawUnsafeHtml: "<script>alert('nao salvar')</script>",
  createdAt: 1788901200000,
  subject: "Re: Diagnostico comercial",
  sourceMessageId: "<original-message@example.com>",
  from: { email: "Decisor@Empresa.com.br", name: "Ana Decisora" },
  to: [{ email: "contato@mydrion.com.br", name: "Mydrion" }],
  replyTo: { email: "decisor@empresa.com.br", name: "Ana Decisora" },
  cc: [{ email: "socio@empresa.com.br" }],
  bcc: [],
  attachments: [
    {
      name: "brief.pdf",
      size: 2048,
      mimeType: "application/pdf",
      link: "https://example.com/brief.pdf",
      isInline: false,
      ignoredInternalField: "nao persistir",
    },
  ],
};

test("valida segredo do webhook sem aceitar ausente ou parcial", () => {
  assert.equal(isValidBrevoWebhookSecret("segredo-completo", "segredo-completo"), true);
  assert.equal(isValidBrevoWebhookSecret("segredo", "segredo-completo"), false);
  assert.equal(isValidBrevoWebhookSecret("", "segredo-completo"), false);
  assert.equal(isValidBrevoWebhookSecret("segredo-completo", ""), false);
});

test("normaliza conversationStarted de email e descarta HTML bruto inseguro", () => {
  const normalized = normalizeBrevoConversationEvent({
    eventName: "conversationStarted",
    conversationId: "thread-1",
    message: emailMessage,
    visitor: {
      source: "email",
      displayedName: "Ana Decisora",
      attributes: { EMAIL: "decisor@empresa.com.br" },
    },
  });

  assert.ok(normalized);
  assert.deepEqual(normalized.thread, {
    providerThreadId: "thread-1",
    participantEmail: "decisor@empresa.com.br",
    participantName: "Ana Decisora",
    subject: "Re: Diagnostico comercial",
  });
  assert.equal(normalized.messages.length, 1);
  assert.deepEqual(normalized.messages[0], {
    providerMessageId: "message-1",
    direction: "received",
    content: "Gostaria de entender melhor a proposta.",
    htmlContent: "<p>Gostaria de entender melhor a proposta.</p>",
    subject: "Re: Diagnostico comercial",
    fromEmail: "decisor@empresa.com.br",
    recipientEmails: ["contato@mydrion.com.br"],
    ccEmails: ["socio@empresa.com.br"],
    bccEmails: [],
    replyToEmail: "decisor@empresa.com.br",
    sourceMessageId: "<original-message@example.com>",
    senderName: "Ana Decisora",
    occurredAt: new Date(1788901200000).toISOString(),
    attachments: [
      {
        name: "brief.pdf",
        size: 2048,
        mimeType: "application/pdf",
        link: "https://example.com/brief.pdf",
        isInline: false,
      },
    ],
  });
  assert.equal("rawUnsafeHtml" in normalized.messages[0], false);
});

test("normaliza fragmento com mensagens recebidas e enviadas", () => {
  const normalized = normalizeBrevoConversationEvent({
    eventName: "conversationFragment",
    conversationId: "thread-2",
    visitor: {
      source: "email",
      displayedName: "Carlos",
      attributes: { EMAIL: "carlos@empresa.com.br" },
    },
    messages: [
      emailMessage,
      {
        ...emailMessage,
        id: "message-2",
        type: "agent",
        text: "Claro, Carlos. Segue o resumo.",
        html: "<p>Claro, Carlos. Segue o resumo.</p>",
        from: { email: "contato@mydrion.com.br", name: "Erick Sena" },
        to: [{ email: "carlos@empresa.com.br" }],
        createdAt: 1788901260000,
      },
    ],
  });

  assert.ok(normalized);
  assert.equal(normalized.messages.length, 2);
  assert.equal(normalized.messages[0].direction, "received");
  assert.equal(normalized.messages[1].direction, "sent");
  assert.equal(normalized.thread.participantEmail, "carlos@empresa.com.br");
});

test("preserva metadados seguros quando o anexo vem no campo file", () => {
  const normalized = normalizeBrevoConversationEvent({
    eventName: "conversationStarted",
    conversationId: "thread-file",
    visitor: { source: "email", attributes: { EMAIL: "ana@empresa.com.br" } },
    message: {
      ...emailMessage,
      id: "message-file",
      attachments: [],
      file: {
        name: "pedido.pdf",
        size: 4096,
        mimeType: "application/pdf",
        link: "https://example.com/pedido.pdf",
        isInline: false,
      },
    },
  });

  assert.ok(normalized);
  assert.deepEqual(normalized.messages[0].attachments, [{
    name: "pedido.pdf",
    size: 4096,
    mimeType: "application/pdf",
    link: "https://example.com/pedido.pdf",
    isInline: false,
  }]);
});

test("ignora eventos que nao sao conversa de email", () => {
  assert.equal(normalizeBrevoConversationEvent({
    eventName: "conversationFragment",
    conversationId: "thread-widget",
    visitor: { source: "widget" },
    messages: [{ id: "chat-1", type: "visitor", text: "Oi", createdAt: 1788901200000 }],
  }), null);
});

test("rejeita payload sem identidade de conversa", () => {
  assert.throws(
    () => normalizeBrevoConversationEvent({ eventName: "conversationFragment", messages: [] }),
    /conversationId/i,
  );
});
