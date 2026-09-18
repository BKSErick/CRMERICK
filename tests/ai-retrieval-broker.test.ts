import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildDailyPriorityFacts,
  buildEmailAwaitingFacts,
  buildWhatsappAwaitingFacts,
  sanitizeDealSearchTerm,
} from "../src/lib/aiRetrievalBroker.ts";

test("email pendente depende da ultima direcao e nao do unread_count", () => {
  const facts = buildEmailAwaitingFacts([
    { id: 1, status: "open", last_message_direction: "received", last_message_at: "2026-09-18T10:00:00Z", unread_count: 0, participant_email: "a@acme.com", participant_name: "Ana", subject: "Proposta", deal_id: 10 },
    { id: 2, status: "open", last_message_direction: "sent", last_message_at: "2026-09-18T11:00:00Z", unread_count: 8, participant_email: "b@beta.com", participant_name: "Bia", subject: "Retorno", deal_id: 11 },
    { id: 3, status: "archived", last_message_direction: "received", last_message_at: "2026-09-18T12:00:00Z", unread_count: 1, participant_email: "c@c.com", participant_name: "Caio", subject: "Oi", deal_id: 12 },
  ], 20);

  assert.deepEqual(facts.map((item) => item.threadId), [1]);
  assert.equal(facts[0].unreadCount, 0);
  assert.equal(facts[0].href, "/emails?thread=1");
});

test("WhatsApp usa o evento mais recente, conta sent_sync como saida e exclui bot", () => {
  const activities = [
    { id: 9, deal_id: 1, type: "whatsapp_received", created_at: "2026-09-18T12:00:00Z", description: "WhatsApp recebido: Quero saber mais" },
    { id: 8, deal_id: 1, type: "whatsapp_sent", created_at: "2026-09-18T11:00:00Z", description: "Envio" },
    { id: 7, deal_id: 2, type: "whatsapp_sent_sync", created_at: "2026-09-18T12:00:00Z", description: "Resposta do Erick" },
    { id: 6, deal_id: 2, type: "whatsapp_received", created_at: "2026-09-18T11:00:00Z", description: "Tenho interesse" },
    { id: 5, deal_id: 3, type: "whatsapp_received", created_at: "2026-09-18T12:00:00Z", description: "Esta é uma mensagem automática. Digite 1." },
  ];
  const deals = [
    { id: 1, company: "Acme", name: "Ana", stage: "qualified" },
    { id: 2, company: "Beta", name: "Bia", stage: "followup" },
    { id: 3, company: "Bot SA", name: "Bot", stage: "prospect" },
  ];

  const facts = buildWhatsappAwaitingFacts(activities, deals, 20);
  assert.deepEqual(facts.map((item) => item.dealId), [1]);
  assert.equal(facts[0].href, "/pipeline?dealId=1");
});

test("busca PostgREST remove operadores e limita o termo", () => {
  assert.equal(sanitizeDealSearchTerm("  Acme%),stage.eq.lost,(  "), "Acme stage eq lost");
  assert.equal(sanitizeDealSearchTerm("x".repeat(200)).length, 100);
});

test("broker aplica stage e score no banco antes do range", () => {
  const source = readFileSync(new URL("../src/lib/aiRetrievalBroker.ts", import.meta.url), "utf8");
  assert.match(source, /request = request\.in\("stage", plan\.filters\.stageIn\)/);
  assert.match(source, /request = request\.gte\("points", plan\.filters\.minPoints\)/);
  assert.ok(source.indexOf('request.in("stage"') < source.indexOf('.range(0, plan.filters.limit - 1)'));
});

test("prioridades colocam respostas humanas antes de follow-up vencido", () => {
  const facts = buildDailyPriorityFacts({
    whatsapp: [{ dealId: 2, company: "Beta", receivedAt: "2026-09-18T09:00:00Z", preview: "Oi", stage: "followup", href: "/pipeline?dealId=2" }],
    email: [{ threadId: 3, dealId: 3, participant: "Ana", email: "a@a.com", subject: "Proposta", preview: "", receivedAt: "2026-09-18T08:00:00Z", unreadCount: 0, href: "/emails?thread=3" }],
    overdue: [{ dealId: 4, company: "Gama", name: "Gil", stage: "qualified", nextActionAt: "2026-09-17T08:00:00Z", nextActionType: "followup", href: "/pipeline?dealId=4" }],
    limit: 20,
  });
  assert.deepEqual(facts.map((item) => item.kind), ["whatsapp_reply", "email_reply", "overdue_followup"]);
});
