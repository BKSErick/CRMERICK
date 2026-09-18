import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) { return readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }

const migration = source("scripts/migrations/20260918_ai_chat_smart_retrieval_free.sql");
const rollback = source("scripts/migrations/20260918_ai_chat_smart_retrieval_free.rollback.sql");
const schema = source("scripts/supabase-schema.sql");

for (const [label, sql] of [["migration", migration], ["schema", schema]] as const) {
  test(`${label} adiciona preferencia e telemetria com JSON validado`, () => {
    assert.match(sql, /model_preference\s+jsonb/i);
    assert.match(sql, /jsonb_typeof\s*\(model_preference\)\s*=\s*'object'/i);
    assert.match(sql, /usage\s+jsonb/i);
    assert.match(sql, /provider_attempts\s+jsonb/i);
    assert.match(sql, /routing_plan\s+jsonb/i);
  });

  test(`${label} materializa ultima direcao e cria indices de leitura`, () => {
    assert.match(sql, /last_message_direction/i);
    assert.match(sql, /last_message_id/i);
    assert.match(sql, /email_threads_awaiting_reply_idx/i);
    assert.match(sql, /activities_whatsapp_timeline_idx/i);
  });
}

test("migration preserva RLS e rollback remove somente objetos da story", () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.ai_conversations from anon, authenticated/i);
  assert.match(rollback, /drop index if exists public\.email_threads_awaiting_reply_idx/i);
  assert.match(rollback, /drop column if exists model_preference/i);
  assert.doesNotMatch(rollback, /drop table/i);
});
