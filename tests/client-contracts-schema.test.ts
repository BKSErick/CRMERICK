import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("migration cria contratos versionados, snapshots, RLS e numeracao atomica", () => {
  const migration = source("scripts/migrations/20260829_client_contracts.sql");
  assert.match(migration, /add column if not exists representative_name/);
  assert.match(migration, /create table if not exists public\.client_contracts/);
  assert.match(migration, /client_snapshot jsonb/);
  assert.match(migration, /provider_snapshot jsonb/);
  assert.match(migration, /document_snapshot jsonb/);
  assert.match(migration, /alter table public\.client_contracts enable row level security/);
  assert.match(migration, /allocate_client_contract_number/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /grant execute[\s\S]*service_role/);
});

test("schema consolidado acompanha a migration", () => {
  const schema = source("scripts/supabase-schema.sql");
  assert.match(schema, /create table if not exists public\.client_contracts/);
  assert.match(schema, /representative_document/);
  assert.match(schema, /CTR-/);
});
