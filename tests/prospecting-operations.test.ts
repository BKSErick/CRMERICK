import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSearchQueries,
  nextChannelAction,
  normalizeInstagramIdentity,
  preferredChannelForSegment,
  summarizeChannelHistory,
} from "../src/lib/prospecting.ts";

test("busca Instagram aceita somente odontologia e estetica", () => {
  const dental = buildSearchQueries("odontologia", "Belo Horizonte", "MG");
  const aesthetics = buildSearchQueries("estetica", "Contagem", "MG");

  assert.ok(dental.maps.every((query) => query.includes("Belo Horizonte MG")));
  assert.ok(dental.maps.some((query) => query.includes("clinica odontologica")));
  assert.ok(aesthetics.maps.some((query) => query.includes("clinica de estetica")));
  assert.ok([...dental.maps, ...aesthetics.maps].every((query) => !query.includes("industrial")));
  assert.throws(() => buildSearchQueries("industrial" as never, "Ipatinga", "MG"), /Vertical invalida/);
});

test("normaliza username e rejeita URL que nao e Instagram", () => {
  assert.equal(normalizeInstagramIdentity("@Clinica.Sorriso"), "clinica.sorriso");
  assert.equal(normalizeInstagramIdentity("https://www.instagram.com/Clinica_Sorriso/?hl=pt-br"), "clinica_sorriso");
  assert.equal(normalizeInstagramIdentity("https://example.com/clinica"), null);
  assert.equal(normalizeInstagramIdentity("instagram.com/p/ABC123"), null);
});

test("segmento industrial nunca recebe Instagram como canal preferido", () => {
  assert.equal(preferredChannelForSegment("industrial_b2b"), "email_linkedin_whatsapp");
  assert.equal(preferredChannelForSegment("odontologia"), "instagram");
  assert.equal(preferredChannelForSegment("estetica"), "instagram");
});

test("abrir perfil nao conta como envio e WhatsApp nao altera relogio Instagram", () => {
  const summary = summarizeChannelHistory("instagram", [
    { channel: "instagram", event: "opened", occurredAt: "2026-08-01T12:00:00.000Z" },
    { channel: "whatsapp", event: "sent", occurredAt: "2026-08-02T12:00:00.000Z" },
  ]);

  assert.equal(summary.outboundCount, 0);
  assert.equal(summary.lastOutboundAt, null);
  assert.equal(summary.lastOpenedAt, "2026-08-01T12:00:00.000Z");
  assert.equal(nextChannelAction(summary), null);
});

test("cadencia Instagram usa D+2, D+5 e D+10 por envios confirmados", () => {
  const messages = [
    { channel: "instagram", event: "sent", occurredAt: "2026-08-01T12:00:00.000Z" },
    { channel: "instagram", event: "sent", occurredAt: "2026-08-03T12:00:00.000Z" },
    { channel: "instagram", event: "sent", occurredAt: "2026-08-06T12:00:00.000Z" },
  ] as const;

  assert.deepEqual(nextChannelAction(summarizeChannelHistory("instagram", messages.slice(0, 1))), {
    tier: "M1",
    at: "2026-08-03T12:00:00.000Z",
  });
  assert.deepEqual(nextChannelAction(summarizeChannelHistory("instagram", messages.slice(0, 2))), {
    tier: "M2",
    at: "2026-08-06T12:00:00.000Z",
  });
  assert.deepEqual(nextChannelAction(summarizeChannelHistory("instagram", messages)), {
    tier: "M3",
    at: "2026-08-11T12:00:00.000Z",
  });
});

test("resposta e opt-out encerram follow-up automatico do canal", () => {
  const replied = summarizeChannelHistory("instagram", [
    { channel: "instagram", event: "sent", occurredAt: "2026-08-01T12:00:00.000Z" },
    { channel: "instagram", event: "received", occurredAt: "2026-08-01T13:00:00.000Z" },
  ]);
  const optedOut = { ...replied, hasReply: false, optedOut: true };

  assert.equal(nextChannelAction(replied), null);
  assert.equal(nextChannelAction(optedOut), null);
});
