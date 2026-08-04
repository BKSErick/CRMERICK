import assert from "node:assert/strict";
import test from "node:test";

import { planProspectingAction } from "../src/lib/prospectingActions.ts";

const now = "2026-08-04T15:00:00.000Z";

test("open atualiza abertura e cria atividade, mas nao cria mensagem", () => {
  const plan = planProspectingAction({ action: "open", dealId: 42, channel: "instagram", now });
  assert.deepEqual(plan.channelUpdate, { status: "opened", lastOpenedAt: now });
  assert.deepEqual(plan.activity, { type: "instagram_opened", description: "Perfil do Instagram aberto" });
  assert.equal(plan.message, null);
});

test("confirm_sent exige texto e agenda o proximo toque", () => {
  assert.throws(
    () => planProspectingAction({ action: "confirm_sent", dealId: 42, channel: "instagram", now, content: "" }),
    /conteudo/i,
  );
  const plan = planProspectingAction({
    action: "confirm_sent",
    dealId: 42,
    channel: "instagram",
    now,
    content: "Oi! Posso te mostrar uma ideia?",
    previousOutboundCount: 0,
  });
  assert.deepEqual(plan.message, {
    channel: "instagram",
    content: "Oi! Posso te mostrar uma ideia?",
    status: "sent",
    provider: "manual",
    direction: "sent",
    occurredAt: now,
    sentAt: now,
  });
  assert.deepEqual(plan.channelUpdate, {
    status: "contacted",
    lastOutboundAt: now,
    nextActionAt: "2026-08-06T15:00:00.000Z",
    nextActionType: "followup_silencio",
    nextActionNote: "Instagram M1 em D+2",
  });
});

test("register_reply cria entrada e encerra cadencia automatica", () => {
  const plan = planProspectingAction({
    action: "register_reply",
    dealId: 42,
    channel: "instagram",
    now,
    content: "Pode me explicar melhor?",
  });
  assert.equal(plan.message?.direction, "received");
  assert.equal(plan.channelUpdate.status, "replied");
  assert.equal(plan.channelUpdate.responseType, "humana");
  assert.equal(plan.channelUpdate.nextActionAt, null);
});

test("opt_out encerra o canal sem afetar outros canais", () => {
  const plan = planProspectingAction({ action: "opt_out", dealId: 42, channel: "instagram", now });
  assert.deepEqual(plan.channelUpdate, {
    status: "opted_out",
    optedOutAt: now,
    nextActionAt: null,
    nextActionType: null,
    nextActionNote: "Opt-out registrado manualmente",
  });
  assert.equal(plan.activity?.type, "instagram_opted_out");
});
