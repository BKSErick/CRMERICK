import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getApiErrorMessage } from "../src/lib/apiError.ts";

test("preserva mensagens, atividades e reunioes ao excluir um deal", () => {
  const migration = readFileSync(
    new URL("../scripts/migrations/20260729_fix_deal_deletion.sql", import.meta.url),
    "utf8",
  );
  const schema = readFileSync(new URL("../scripts/supabase-schema.sql", import.meta.url), "utf8");

  assert.match(
    migration,
    /alter table public\.messages[\s\S]*foreign key \(deal_id\)[\s\S]*on delete set null/i,
  );
  assert.match(
    migration,
    /alter table public\.activities[\s\S]*foreign key \(deal_id\)[\s\S]*on delete set null/i,
  );
  const setNullDealReferences =
    schema.match(/deal_id\s+integer references public\.deals\(id\) on delete set null/gi) ?? [];
  assert.ok(setNullDealReferences.length >= 5);
  assert.match(
    schema,
    /create table if not exists public\.calendar_events[\s\S]*deal_id\s+integer references public\.deals\(id\) on delete set null/i,
  );
  assert.match(
    schema,
    /create table if not exists public\.commercial_events[\s\S]*deal_id\s+integer references public\.deals\(id\) on delete set null/i,
  );
  assert.match(
    schema,
    /create table if not exists public\.commercial_automation_runs[\s\S]*deal_id\s+integer references public\.deals\(id\) on delete set null/i,
  );
});

test("exibe a mensagem real de erros estruturados do Supabase", () => {
  assert.equal(
    getApiErrorMessage(
      { message: "update or delete on table deals violates foreign key constraint" },
      "Erro inesperado",
    ),
    "update or delete on table deals violates foreign key constraint",
  );
  assert.equal(getApiErrorMessage(new Error("falha real"), "Erro inesperado"), "falha real");
  assert.equal(getApiErrorMessage({ message: "" }, "Erro inesperado"), "Erro inesperado");
});
