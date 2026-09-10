import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../scripts/migrations/20260909_email_automation_builder.sql", import.meta.url),
  "utf8",
);
const schema = readFileSync(new URL("../scripts/supabase-schema.sql", import.meta.url), "utf8");
const rollback = readFileSync(
  new URL("../scripts/migrations/20260909_email_automation_builder.rollback.sql", import.meta.url),
  "utf8",
);
const dispatchMigration = readFileSync(
  new URL("../scripts/migrations/20260910_email_automation_manual_dispatch.sql", import.meta.url),
  "utf8",
);
const dispatchRollback = readFileSync(
  new URL("../scripts/migrations/20260910_email_automation_manual_dispatch.rollback.sql", import.meta.url),
  "utf8",
);

for (const [label, sql] of [["migration", migration], ["schema", schema]] as const) {
  test(`${label} cria automacoes, revisoes e testes com contratos seguros`, () => {
    for (const table of ["email_automations", "email_automation_revisions", "email_automation_test_runs"]) {
      assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
      assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    }
    const automationTable = sql.match(/create table if not exists public\.email_automations\s*\(([\s\S]*?)\n\);/i)?.[1] ?? "";
    assert.match(automationTable, /status\s+text\s+not null\s+default\s+'draft'[\s\S]*check\s*\(status in \('draft',\s*'validated',\s*'archived'\)\)/i);
    assert.doesNotMatch(automationTable, /'active'|'running'|'enabled'/i);
  });

  test(`${label} versiona o grafo e registra simulacoes`, () => {
    assert.match(sql, /graph\s+jsonb\s+not null/i);
    assert.match(sql, /unique\s*\(automation_id,\s*version\)/i);
    assert.match(sql, /input\s+jsonb\s+not null/i);
    assert.match(sql, /trace\s+jsonb\s+not null/i);
    assert.match(sql, /on delete set null/i);
    assert.match(sql, /email_automations_updated_idx/i);
  });

  test(`${label} salva versao de forma atomica e nao oferece funcao de ativacao`, () => {
    assert.match(sql, /create or replace function public\.save_email_automation/i);
    assert.match(sql, /p_expected_version/i);
    assert.match(sql, /version_conflict/i);
    assert.match(sql, /revoke execute on function public\.save_email_automation/i);
    assert.doesNotMatch(sql, /activate_email_automation|send_email_automation/i);
  });
}

test("rollback remove apenas os objetos da Story 047", () => {
  assert.match(rollback, /drop function if exists public\.save_email_automation/i);
  assert.match(rollback, /drop table if exists public\.email_automation_test_runs/i);
  assert.match(rollback, /drop table if exists public\.email_automation_revisions/i);
  assert.match(rollback, /drop table if exists public\.email_automations/i);
});

for (const [label, sql] of [["migration", dispatchMigration], ["schema", schema]] as const) {
  test(`${label} persiste inscricoes e dispatches do lote manual com RLS`, () => {
    for (const table of ["email_automation_enrollments", "email_automation_dispatches"]) {
      assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
      assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
      assert.match(sql, new RegExp(`revoke all on public\\.${table} from anon, authenticated`, "i"));
    }
    assert.match(sql, /unique\s*\(automation_id,\s*recipient_email\)/i);
    assert.match(sql, /unique\s*\(enrollment_id,\s*step_index\)/i);
  });

  test(`${label} reserva limite e conclui envio em funcoes atomicas`, () => {
    assert.match(sql, /create or replace function public\.claim_email_automation_dispatch/i);
    assert.match(sql, /pg_advisory_xact_lock/i);
    assert.match(sql, /p_daily_cap[\s\S]*between 1 and 250/i);
    assert.match(sql, /metadata->>'dispatch_id'/i);
    assert.match(sql, /create or replace function public\.complete_email_automation_dispatch/i);
    assert.match(sql, /insert into public\.activities/i);
    assert.match(sql, /grant execute[\s\S]*to service_role/i);
  });
}

test("rollback do disparo manual remove somente objetos da Story 054", () => {
  assert.match(dispatchRollback, /drop function if exists public\.complete_email_automation_dispatch/i);
  assert.match(dispatchRollback, /drop function if exists public\.claim_email_automation_dispatch/i);
  assert.match(dispatchRollback, /drop table if exists public\.email_automation_dispatches/i);
  assert.match(dispatchRollback, /drop table if exists public\.email_automation_enrollments/i);
  assert.doesNotMatch(dispatchRollback, /drop table if exists public\.email_automations\s*;/i);
});
