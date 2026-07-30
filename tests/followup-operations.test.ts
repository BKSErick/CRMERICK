import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWhatsappActivitySummary,
  classifyInboundResponse,
  classificationUpdate,
  normalizeClientActivityType,
  nextActionAfterInbound,
  nextActionAfterOutbound,
  queueSectionForDeal,
  resolveNextActionAt,
  messageCompanyMismatch,
} from "../src/lib/followup.ts";
import {
  normalizeWhatsappPhone,
  phoneMatchVariants,
} from "../src/lib/whatsappPhone.ts";
import { mapDealFromRow, mapDealToRow } from "../src/lib/crmRecords.ts";

test("classifica bot, encaminhamento e resposta humana sem IA", () => {
  assert.equal(
    classifyInboundResponse("Esta e uma mensagem automatica. Digite 1 para vendas."),
    "bot",
  );
  assert.equal(
    classifyInboundResponse(
      "Poderia entrar em contato com meu superior responsavel por compras de materiais e servicos?",
    ),
    "encaminhamento",
  );
  assert.equal(classifyInboundResponse("Tenho interesse. Pode me mostrar?"), "humana");
});

test("agenda resposta humana agora e bot para D+7", () => {
  const reference = "2026-07-30T12:00:00.000Z";
  assert.deepEqual(nextActionAfterInbound("humana", reference), {
    at: reference,
    type: "responder",
    note: "Resposta humana recebida; responder com contexto.",
  });
  assert.deepEqual(nextActionAfterInbound("bot", reference), {
    at: "2026-08-06T12:00:00.000Z",
    type: "followup_bot",
    note: "Resposta automatica; retomar em D+7.",
  });
});

test("aplica silencio em D+2, D+5 e D+10 e encerra depois de M3", () => {
  const reference = "2026-07-30T12:00:00.000Z";
  assert.equal(
    nextActionAfterOutbound({ responseType: "sem_resposta", occurredAt: reference, outboundCount: 1 }).at,
    "2026-08-01T12:00:00.000Z",
  );
  assert.equal(
    nextActionAfterOutbound({ responseType: "sem_resposta", occurredAt: reference, outboundCount: 2 }).at,
    "2026-08-02T12:00:00.000Z",
  );
  assert.equal(
    nextActionAfterOutbound({ responseType: "sem_resposta", occurredAt: reference, outboundCount: 3 }).at,
    "2026-08-04T12:00:00.000Z",
  );
  assert.equal(
    nextActionAfterOutbound({ responseType: "sem_resposta", occurredAt: reference, outboundCount: 4 }).at,
    null,
  );
});

test("mantem bot em intervalos de sete dias apos novo envio", () => {
  const plan = nextActionAfterOutbound({
    responseType: "bot",
    occurredAt: "2026-07-30T12:00:00.000Z",
    outboundCount: 2,
  });
  assert.equal(plan.at, "2026-08-06T12:00:00.000Z");
  assert.equal(plan.type, "followup_bot");
  assert.deepEqual(
    nextActionAfterOutbound({
      responseType: "bot",
      occurredAt: "2026-08-20T12:00:00.000Z",
      outboundCount: 4,
    }),
    {
      at: null,
      type: null,
      note: "Cadencia de bot concluida em D+21.",
    },
  );
});

test("proxima acao manual prevalece sobre recomendacao", () => {
  assert.equal(
    resolveNextActionAt("2026-08-03T09:00:00.000Z", "2026-08-01T12:00:00.000Z"),
    "2026-08-03T09:00:00.000Z",
  );
  assert.equal(resolveNextActionAt(null, "2026-08-01T12:00:00.000Z"), "2026-08-01T12:00:00.000Z");
  assert.deepEqual(
    classificationUpdate("bot", "2026-07-30T12:00:00.000Z", "manual"),
    {
      responseType: "bot",
      responseTypeSource: "manual",
    },
  );
});

test("clique no WhatsApp registra abertura, nunca envio", () => {
  assert.equal(normalizeClientActivityType("whatsapp_sent"), "whatsapp_opened");
  assert.equal(normalizeClientActivityType("note"), "note");
});

test("organiza cada deal em uma unica secao operacional", () => {
  const now = "2026-07-30T12:00:00.000Z";
  assert.equal(queueSectionForDeal({ responseType: "humana", phone: "5531999999999", nextActionAt: now }, now), "responder_agora");
  assert.equal(queueSectionForDeal({ responseType: "encaminhamento", phone: "5531999999999", nextActionAt: now }, now), "encaminhamentos");
  assert.equal(queueSectionForDeal({ responseType: "bot", phone: "5531999999999", nextActionAt: now }, now), "bots_d7");
  assert.equal(queueSectionForDeal({ responseType: "sem_resposta", phone: "", nextActionAt: now }, now), "dados_inconsistentes");
  assert.equal(queueSectionForDeal({ responseType: "sem_resposta", phone: "5531999999999", nextActionAt: "2026-07-29T12:00:00.000Z" }, now), "followups_vencidos");
  assert.equal(queueSectionForDeal({ responseType: "sem_resposta", phone: "5531999999999", nextActionAt: "2026-08-01T12:00:00.000Z" }, now), "aguardando_cadencia");
  assert.equal(
    queueSectionForDeal({
      responseType: "humana",
      phone: "5531999999999",
      nextActionAt: "2026-08-01T12:00:00.000Z",
      lastInboundAt: "2026-07-29T10:00:00.000Z",
      lastOutboundAt: "2026-07-29T11:00:00.000Z",
    }, now),
    "aguardando_cadencia",
  );
  assert.equal(
    queueSectionForDeal({
      responseType: "humana",
      phone: "5531999999999",
      nextActionAt: "2026-08-02T12:00:00.000Z",
      nextActionSource: "manual",
      lastInboundAt: "2026-07-30T10:00:00.000Z",
      lastOutboundAt: "2026-07-29T11:00:00.000Z",
    }, now),
    "aguardando_cadencia",
  );
  assert.equal(
    queueSectionForDeal({
      responseType: "encaminhamento",
      phone: "5531999999999",
      nextActionAt: now,
      nextActionType: "contactar_responsavel",
      nextActionSource: "manual",
      lastInboundAt: "2026-07-30T10:00:00.000Z",
      lastOutboundAt: "2026-07-30T10:05:00.000Z",
    }, now),
    "encaminhamentos",
  );
});

test("normaliza telefone brasileiro e cria variante segura do nono digito", () => {
  assert.equal(normalizeWhatsappPhone("(31) 91072-4070"), "5531910724070");
  assert.deepEqual(phoneMatchVariants("553191072407"), [
    "553191072407",
    "5531991072407",
  ]);
  assert.deepEqual(phoneMatchVariants("553133334444"), ["553133334444"]);
  assert.deepEqual(phoneMatchVariants("+1 415 555 2671"), ["14155552671"]);
});

test("bloqueia mensagem que cita outra empresa conhecida", () => {
  assert.equal(
    messageCompanyMismatch(
      "Preparei uma analise da Metalville para voce.",
      "Metallider",
      ["Metallider", "Metalville", "Vertical Eletrica"],
    ),
    "Metalville",
  );
  assert.equal(
    messageCompanyMismatch(
      "Preparei uma analise da Metallider para voce.",
      "Metallider",
      ["Metallider", "Metalville"],
    ),
    null,
  );
});

test("resume envios manuais e sincronizados junto com a ultima entrada", () => {
  const summary = buildWhatsappActivitySummary([
    { deal_id: 7, type: "whatsapp_sent", created_at: "2026-07-20T10:00:00.000Z", description: "Primeiro envio" },
    { deal_id: 7, type: "whatsapp_received", created_at: "2026-07-21T10:00:00.000Z", description: "[UAZAPI-HISTORY ABC123] WhatsApp recebido: Resposta" },
    { deal_id: 7, type: "whatsapp_sent_sync", created_at: "2026-07-22T10:00:00.000Z", description: "Envio sincronizado" },
  ]);

  assert.deepEqual(summary[7], {
    last: "2026-07-22T10:00:00.000Z",
    count: 2,
    lastOutbound: "2026-07-22T10:00:00.000Z",
    lastOutboundText: "Envio sincronizado",
    lastInbound: "2026-07-21T10:00:00.000Z",
    lastInboundText: "Resposta",
    inboundCount: 1,
  });
});

test("mapeia campos operacionais com fallback retrocompativel", () => {
  const legacy = mapDealFromRow({ id: 4, company: "Legado", stage: "abordado" });
  assert.equal(legacy.responseType, "sem_resposta");
  assert.equal(legacy.nextActionAt, undefined);

  const row = mapDealToRow({
    responseType: "bot",
    nextActionAt: "2026-08-06T12:00:00.000Z",
    nextActionType: "followup_bot",
    nextActionNote: "Retomar no D+7",
    responseTypeSource: "manual",
    responseTimeMinutes: 90,
  });
  assert.deepEqual(row, {
    response_type: "bot",
    next_action_at: "2026-08-06T12:00:00.000Z",
    next_action_type: "followup_bot",
    next_action_note: "Retomar no D+7",
    response_type_source: "manual",
    response_time_minutes: 90,
  });
});
