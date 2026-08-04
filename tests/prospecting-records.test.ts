import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { mapProspectingChannelFromRow, mapProspectingChannelToRow } from "../src/lib/prospectingRecords.ts";

test("migration cria estado unico por deal e canal com RLS", () => {
  const migration = readFileSync(
    new URL("../scripts/migrations/20260804_prospecting_channels.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /create table if not exists public\.prospecting_channels/i);
  assert.match(migration, /unique\s*\(deal_id,\s*channel\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /on delete cascade/i);
  assert.match(migration, /channel in \('instagram', 'whatsapp', 'email', 'linkedin'\)/i);
});

test("mapeia registro do banco com defaults retrocompativeis", () => {
  assert.deepEqual(
    mapProspectingChannelFromRow({
      id: "7",
      deal_id: "42",
      channel: "instagram",
      identity: "clinica.sorriso",
      profile_url: "https://instagram.com/clinica.sorriso",
      status: "contacted",
      response_type: "humana",
      evidence: { reasons: ["site_oficial"] },
    }),
    {
      id: 7,
      dealId: 42,
      channel: "instagram",
      identity: "clinica.sorriso",
      profileUrl: "https://instagram.com/clinica.sorriso",
      matchSource: null,
      matchConfidence: "low",
      status: "contacted",
      lastOpenedAt: null,
      lastOutboundAt: null,
      lastInboundAt: null,
      nextActionAt: null,
      nextActionType: null,
      nextActionNote: null,
      responseType: "humana",
      responseTypeSource: "automatic",
      optedOutAt: null,
      evidence: { reasons: ["site_oficial"] },
    },
  );
});

test("remove undefined ao mapear update para banco", () => {
  assert.deepEqual(
    mapProspectingChannelToRow({
      dealId: 42,
      channel: "instagram",
      status: "ready",
      identity: undefined,
      nextActionAt: null,
    }),
    {
      deal_id: 42,
      channel: "instagram",
      status: "ready",
      next_action_at: null,
    },
  );
});
