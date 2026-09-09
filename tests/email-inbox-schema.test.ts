import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../scripts/migrations/20260908_email_inbox_brevo.sql", import.meta.url),
  "utf8",
);
const schema = readFileSync(new URL("../scripts/supabase-schema.sql", import.meta.url), "utf8");
const rollback = readFileSync(
  new URL("../scripts/migrations/20260908_email_inbox_brevo.rollback.sql", import.meta.url),
  "utf8",
);

for (const [label, sql] of [["migration", migration], ["schema", schema]] as const) {
  test(`${label} cria threads de email com vinculos conservadores`, () => {
    assert.match(sql, /create table if not exists public\.email_threads/i);
    assert.match(sql, /provider_thread_id\s+text\s+not null/i);
    assert.match(sql, /deal_id\s+integer references public\.deals\(id\) on delete set null/i);
    assert.match(sql, /contact_id\s+integer references public\.contacts\(id\) on delete set null/i);
    assert.match(sql, /unique\s*\(provider,\s*provider_thread_id\)/i);
  });

  test(`${label} estende messages sem trocar sua fonte canonica`, () => {
    assert.match(sql, /add column if not exists email_thread_id\s+bigint references public\.email_threads\(id\) on delete set null/i);
    for (const column of [
      "subject",
      "from_email",
      "recipient_emails",
      "cc_emails",
      "bcc_emails",
      "reply_to_email",
      "html_content",
      "source_message_id",
      "attachments",
    ]) {
      assert.match(sql, new RegExp(`add column if not exists ${column}\\b`, "i"));
    }
  });

  test(`${label} habilita RLS e indices da inbox`, () => {
    assert.match(sql, /alter table public\.email_threads enable row level security/i);
    assert.match(sql, /email_threads_last_message_idx/i);
    assert.match(sql, /email_threads_deal_idx/i);
    assert.match(sql, /email_threads_contact_idx/i);
    assert.match(sql, /messages_email_thread_occurred_idx/i);
  });
}

test("migration documenta objetos novos e possui rollback explicito", () => {
  assert.match(migration, /comment on table public\.email_threads/i);
  assert.match(migration, /comment on column public\.messages\.email_thread_id/i);
  assert.match(rollback, /drop column if exists email_thread_id/i);
  assert.match(rollback, /drop table if exists public\.email_threads/i);
});
