import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("migration cria demandas auxiliares, RLS e bucket privado", () => {
  const migration = source("scripts/migrations/20260820_client_demands.sql");
  const schema = source("scripts/supabase-schema.sql");

  for (const sql of [migration, schema]) {
    assert.match(sql, /create table if not exists public\.client_demands/i);
    assert.match(sql, /create table if not exists public\.client_demand_checklist_items/i);
    assert.match(sql, /create table if not exists public\.client_demand_links/i);
    assert.match(sql, /create table if not exists public\.client_demand_attachments/i);
    assert.match(sql, /create table if not exists public\.client_demand_events/i);
    assert.match(sql, /deal_id\s+integer references public\.deals\(id\) on delete set null/i);
    assert.match(sql, /status[\s\S]*todo[\s\S]*in_progress[\s\S]*review[\s\S]*done[\s\S]*cancelled/i);
    assert.match(sql, /alter table public\.client_demands enable row level security/i);
  }

  assert.match(migration, /insert into storage\.buckets/i);
  assert.match(migration, /'demand-attachments'/i);
  assert.match(migration, /false[\s\S]*104857600/i);
  assert.doesNotMatch(migration, /create policy[\s\S]*to anon/i);
});

test("rotas de demandas exigem sessao e usam somente service role no servidor", () => {
  const files = [
    "src/app/api/demands/route.ts",
    "src/app/api/demands/checklist/route.ts",
    "src/app/api/demands/links/route.ts",
    "src/app/api/demands/attachments/route.ts",
    "src/app/api/demands/events/route.ts",
  ];

  for (const file of files) {
    const text = source(file);
    assert.match(text, /requireDemandAdminSession/);
    assert.match(text, /getCrmSupabaseAdmin/);
    assert.doesNotMatch(text, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE|serviceRoleKey/);
  }
});

test("API principal preserva independencia entre demanda e pipeline", () => {
  const text = source("src/app/api/demands/route.ts");
  assert.match(text, /\.from\("client_demands"\)/);
  assert.match(text, /isEligibleDemandDeal/);
  assert.match(text, /completed_at/);
  assert.doesNotMatch(text, /updateDealStage|next_action_at|\.from\("deals"\)\.update/);
});

test("select relacional de demandas usa somente colunas existentes em deals", () => {
  const server = source("src/lib/demandServer.ts");
  const relation = server.match(/deal:deals\(([^)]*)\)/)?.[1] ?? "";

  assert.ok(relation, "DEMAND_SUMMARY_SELECT deve carregar o deal relacionado");
  assert.doesNotMatch(relation, /\btitle\b/, "deals.title nao existe no schema real");
  for (const column of ["id", "company", "name", "stage", "status", "owner", "assignee", "value"]) {
    assert.match(relation, new RegExp(`\\b${column}\\b`));
  }
});

test("anexos usam upload e download assinados no bucket privado", () => {
  const text = source("src/app/api/demands/attachments/route.ts");
  assert.match(text, /createSignedUploadUrl/);
  assert.match(text, /createSignedUrl/);
  assert.match(text, /DEMAND_ATTACHMENTS_BUCKET/);
  assert.match(text, /validateDemandAttachment/);
  assert.match(text, /\.info\(/);
  assert.match(text, /contentType/);
  assert.doesNotMatch(text, /getPublicUrl/);
});

test("demandas orfas preservam historico e bloqueiam mutacoes", () => {
  const server = source("src/lib/demandServer.ts");
  const mutationRoutes = [
    "src/app/api/demands/checklist/route.ts",
    "src/app/api/demands/links/route.ts",
    "src/app/api/demands/attachments/route.ts",
    "src/app/api/demands/events/route.ts",
  ];

  assert.match(server, /assertDemandWritable/);
  assert.match(server, /!demand\.deal_id/);
  for (const file of mutationRoutes) {
    assert.match(source(file), /assertDemandWritable/);
  }
  assert.match(source("src/app/api/demands/route.ts"), /!current\.data\.deal_id/);
});
