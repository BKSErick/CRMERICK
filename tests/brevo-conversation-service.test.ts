import assert from "node:assert/strict";
import test from "node:test";

import type { NormalizedBrevoConversation } from "../src/lib/brevoConversations.ts";
import {
  ingestBrevoConversation,
  type BrevoConversationRepository,
} from "../src/lib/brevoConversationService.ts";

function fixture(): NormalizedBrevoConversation {
  return {
    thread: {
      providerThreadId: "thread-1",
      participantEmail: "decisor@empresa.com.br",
      participantName: "Ana",
      subject: "Re: Diagnostico",
    },
    messages: [
      {
        providerMessageId: "received-1",
        direction: "received",
        content: "Tenho interesse.",
        htmlContent: "<p>Tenho interesse.</p>",
        subject: "Re: Diagnostico",
        fromEmail: "decisor@empresa.com.br",
        recipientEmails: ["contato@mydrion.com.br"],
        ccEmails: [],
        bccEmails: [],
        replyToEmail: "decisor@empresa.com.br",
        sourceMessageId: "<source-1@example.com>",
        senderName: "Ana",
        occurredAt: "2026-09-08T20:00:00.000Z",
        attachments: [],
      },
      {
        providerMessageId: "sent-1",
        direction: "sent",
        content: "Perfeito, Ana.",
        htmlContent: "<p>Perfeito, Ana.</p>",
        subject: "Re: Diagnostico",
        fromEmail: "contato@mydrion.com.br",
        recipientEmails: ["decisor@empresa.com.br"],
        ccEmails: [],
        bccEmails: [],
        replyToEmail: "",
        sourceMessageId: "<source-2@mydrion.com.br>",
        senderName: "Erick",
        occurredAt: "2026-09-08T20:05:00.000Z",
        attachments: [],
      },
    ],
  };
}

function fakeRepository(overrides: Partial<BrevoConversationRepository> = {}) {
  const calls = {
    linkEmails: [] as string[],
    threads: [] as unknown[],
    messages: [] as unknown[],
    activities: [] as unknown[],
    refreshed: [] as number[],
  };
  const repository: BrevoConversationRepository = {
    async findCrmLinkByEmail(email) {
      calls.linkEmails.push(email);
      return { contactId: 91, dealId: 42, company: "Empresa Industrial" };
    },
    async ensureThread(input) {
      calls.threads.push(input);
      return { id: 7 };
    },
    async findExistingMessageIds() {
      return new Set<string>();
    },
    async insertMessage(input) {
      calls.messages.push(input);
      return true;
    },
    async insertInboundActivity(input) {
      calls.activities.push(input);
    },
    async refreshThread(threadId) {
      calls.refreshed.push(threadId);
    },
    ...overrides,
  };
  return { calls, repository };
}

test("persiste mensagens novas e audita somente recebidas vinculadas", async () => {
  const { calls, repository } = fakeRepository();

  const result = await ingestBrevoConversation(repository, fixture());

  assert.deepEqual(calls.linkEmails, ["decisor@empresa.com.br"]);
  assert.deepEqual(calls.threads, [{
    ...fixture().thread,
    contactId: 91,
    dealId: 42,
  }]);
  assert.equal(calls.messages.length, 2);
  assert.equal(calls.activities.length, 1);
  assert.deepEqual(calls.refreshed, [7]);
  assert.deepEqual(result, { threadId: 7, inserted: 2, received: 1, duplicates: 0 });
});

test("reentrega nao insere, nao audita e nao incrementa leitura", async () => {
  const { calls, repository } = fakeRepository({
    async findExistingMessageIds() {
      return new Set(["received-1", "sent-1"]);
    },
  });

  const result = await ingestBrevoConversation(repository, fixture());

  assert.equal(calls.messages.length, 0);
  assert.equal(calls.activities.length, 0);
  assert.equal(calls.refreshed.length, 0);
  assert.deepEqual(result, { threadId: 7, inserted: 0, received: 0, duplicates: 2 });
});

test("remetente desconhecido fica sem vinculo e nao cria lead", async () => {
  const { calls, repository } = fakeRepository({
    async findCrmLinkByEmail(email) {
      calls.linkEmails.push(email);
      return null;
    },
  });

  await ingestBrevoConversation(repository, fixture());

  assert.deepEqual(calls.threads, [{
    ...fixture().thread,
    contactId: null,
    dealId: null,
  }]);
  assert.equal(calls.messages.length, 2);
  assert.equal(calls.activities.length, 0);
});
