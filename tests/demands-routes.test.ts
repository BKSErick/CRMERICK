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

test("mutacao de demanda roda em transacao unica no banco", () => {
  const migration = source("scripts/migrations/20260901_demandas_atomicas.sql");
  const schema = source("scripts/supabase-schema.sql");

  for (const sql of [migration, schema]) {
    for (const fn of ["apply_demand_update_atomic", "purge_demands_atomic"]) {
      assert.match(sql, new RegExp(`create or replace function public\\.${fn}`, "i"));
      assert.match(sql, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]{0,120}to service_role`, "i"));
      assert.match(sql, new RegExp(`revoke all on function public\\.${fn}[\\s\\S]{0,120}anon, authenticated`, "i"));
    }
    // Lock antes de decidir sobre as cobrancas: o billing_type lido solto pela rota
    // podia estar velho na hora do update.
    assert.match(sql, /where id = p_demand_id for update/i);
    assert.match(sql, /delete from public\.client_demand_charges where demand_id = p_demand_id/i);
    assert.match(sql, /insert into public\.client_demand_events/i);
  }
});

test("rota de demandas nao mexe em cobrancas nem no bucket fora da transacao", () => {
  const route = source("src/app/api/demands/route.ts");
  const server = source("src/lib/demandServer.ts");

  // Apagar parcelas e gravar auditoria sao responsabilidade da RPC.
  assert.doesNotMatch(route, /from\("client_demand_charges"\)[\s\S]{0,40}\.delete\(\)/);
  assert.doesNotMatch(route, /storage[\s\S]{0,60}\.remove\(/);
  assert.match(route, /applyDemandUpdate/);
  assert.match(route, /purgeDemands/);

  // No hard delete o banco vem primeiro; o Storage e limpo depois do commit e a falha
  // dele nao derruba a requisicao (arquivo orfao e varrivel, demanda fantasma nao e).
  const purge = server.slice(server.indexOf("export async function purgeDemands"));
  assert.ok(purge.indexOf("purge_demands_atomic") < purge.indexOf(".remove("), "RPC deve rodar antes do remove");
  assert.match(purge, /orphanedPaths/);
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
  // Orfa = sem cliente E sem deal. So com o cliente a demanda continua editavel.
  assert.match(server, /isOrphanDemand/);
  assert.match(server, /!demand\.deal_id && !demand\.client_id/);
  for (const file of mutationRoutes) {
    assert.match(source(file), /assertDemandWritable/);
  }
  assert.match(source("src/app/api/demands/route.ts"), /isOrphanDemand\(current\.data\)/);
});
