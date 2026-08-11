import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildOperationalFunnel,
  meetingStatusUpdate,
} from "../src/lib/funnelMetrics.ts";

test("status de reuniao gera timestamps consistentes", () => {
  const now = "2026-08-10T15:00:00.000Z";
  assert.deepEqual(meetingStatusUpdate("confirmed", now), {
    meeting_status: "confirmed",
    confirmed_at: now,
    held_at: null,
    done: false,
  });
  assert.deepEqual(meetingStatusUpdate("held", now), {
    meeting_status: "held",
    held_at: now,
    done: true,
  });
  assert.deepEqual(meetingStatusUpdate("no_show", now), {
    meeting_status: "no_show",
    held_at: null,
    done: true,
  });
  assert.deepEqual(meetingStatusUpdate("scheduled", now), {
    meeting_status: "scheduled",
    confirmed_at: null,
    held_at: null,
    done: false,
  });
});

test("funil operacional mede resposta, reuniao e receita sem inflar MRR", () => {
  const funnel = buildOperationalFunnel({
    deals: [
      { id: 1, stage: "abordado", response_type: "humana", value: 0, recurring: false },
      { id: 2, stage: "proposal", response_type: "encaminhamento", referred_phone: "5531999", value: 1000, recurring: false },
      { id: 3, stage: "won", response_type: "humana", value: 150, recurring: true },
      { id: 4, stage: "won", response_type: "humana", value: 1000, recurring: false },
    ],
    activities: [
      { deal_id: 1, type: "whatsapp_sent" },
      { deal_id: 2, type: "whatsapp_sent_sync" },
      { deal_id: 3, type: "whatsapp_sent" },
      { deal_id: 4, type: "whatsapp_sent" },
    ],
    meetings: [
      { deal_id: 2, kind: "reuniao", meeting_status: "scheduled" },
      { deal_id: 3, kind: "reuniao", meeting_status: "held" },
      { deal_id: 4, kind: "reuniao", meeting_status: "cancelled" },
    ],
  });

  assert.equal(funnel.counts.approached, 4);
  assert.equal(funnel.counts.validResponses, 4);
  assert.equal(funnel.counts.referrals, 1);
  assert.equal(funnel.counts.meetingsScheduled, 2);
  assert.equal(funnel.counts.meetingsHeld, 1);
  assert.equal(funnel.counts.proposals, 3);
  assert.equal(funnel.counts.won, 2);
  assert.equal(funnel.revenue.mrr, 150);
  assert.equal(funnel.revenue.oneOff, 1000);
});

test("webhook transforma vCard em encaminhamento persistido sem enviar mensagem", () => {
  const webhook = readFileSync(new URL("../src/app/api/webhooks/uazapi/route.ts", import.meta.url), "utf8");
  assert.match(webhook, /extrairContatoIndicado/);
  assert.match(webhook, /referred_phone/);
  assert.match(webhook, /contactar_responsavel/);
  assert.doesNotMatch(webhook, /send\/text/);
});

test("API de calendario persiste status de reuniao usando a regra de dominio", () => {
  const calendar = readFileSync(new URL("../src/app/api/calendar/route.ts", import.meta.url), "utf8");
  assert.match(calendar, /meetingStatusUpdate/);
  assert.match(calendar, /meeting_status/);
  assert.match(calendar, /confirmed_at/);
  assert.match(calendar, /held_at/);
});

test("migration aditiva sincroniza tracking, metadata e status de reuniao", () => {
  const migration = readFileSync(
    new URL("../scripts/migrations/20260810_sales_automation_metrics.sql", import.meta.url),
    "utf8",
  );
  for (const field of ["copy_version", "copy_variant", "offer_version", "experiment_id", "metadata", "meeting_status"]) {
    assert.match(migration, new RegExp(field));
  }
  assert.match(migration, /if not exists/);
});

test("API de funil usa a mesma engine mensuravel do relatorio", () => {
  const route = readFileSync(new URL("../src/app/api/funnel/route.ts", import.meta.url), "utf8");
  assert.match(route, /buildOperationalFunnel/);
  assert.match(route, /buildVariantReport/);
  assert.match(route, /copy_variant/);
});

test("telas operacionais exibem status de reuniao e metricas reais do fundo", () => {
  const meetingsPage = readFileSync(new URL("../src/app/reunioes/page.tsx", import.meta.url), "utf8");
  const funnelPage = readFileSync(new URL("../src/app/funil/page.tsx", import.meta.url), "utf8");
  assert.match(meetingsPage, /meetingStatus/);
  assert.match(meetingsPage, /Realizada/);
  assert.match(meetingsPage, /No-show/);
  assert.match(funnelPage, /\/api\/funnel/);
  assert.match(funnelPage, /meetingsHeld/);
});

test("relatorio CLI compara variantes usando a engine compartilhada", () => {
  const report = readFileSync(new URL("../scripts/report-copy-experiment.mjs", import.meta.url), "utf8");
  assert.match(report, /buildVariantReport/);
  assert.match(report, /Respostas validas/);
  assert.match(report, /Reunioes realizadas/);
});
