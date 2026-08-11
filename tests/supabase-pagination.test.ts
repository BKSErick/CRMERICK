import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { fetchAllPages } from "../scripts/lib/supabaseRest.mjs";
import {
  cumulativeTargetForSlot,
  createProspectingApproval,
  manifestHash,
  MAX_ATTEMPTS,
  remainingToTarget,
  validateProspectingApproval,
} from "../src/lib/prospectingApproval.ts";

test("pagina 1.420 registros sem confiar em Range alto", async () => {
  const calls: Array<Record<string, string>> = [];
  const rows = Array.from({ length: 1420 }, (_, index) => ({ id: index + 1 }));
  const request = async (_route: string, init: { headers?: Record<string, string> } = {}) => {
    const range = init.headers?.Range ?? "0-999";
    calls.push({ Range: range });
    const [start, end] = range.split("-").map(Number);
    return { ok: true, json: async () => rows.slice(start, end + 1) };
  };

  const result = await fetchAllPages(request, "contacts?select=id");
  assert.equal(result.length, 1420);
  assert.deepEqual(calls, [{ Range: "0-999" }, { Range: "1000-1999" }]);
});

test("paginacao falha fechada quando uma pagina retorna erro", async () => {
  const request = async () => ({ ok: false, status: 503, text: async () => "indisponivel" });
  await assert.rejects(() => fetchAllPages(request, "deals?select=id"), /HTTP 503/);
});

test("meta acumulada fecha 20 pela manha e exatamente 40 no dia", () => {
  assert.equal(cumulativeTargetForSlot("morning"), 20);
  assert.equal(cumulativeTargetForSlot("afternoon"), 40);
  assert.equal(remainingToTarget(0, 20), 20);
  assert.equal(remainingToTarget(17, 20), 3);
  assert.equal(remainingToTarget(23, 40), 17);
  assert.equal(remainingToTarget(40, 40), 0);
  assert.equal(remainingToTarget(41, 40), 0);
});

test("aprovacao pertence ao hash, data e slot e nao pode ser reutilizada", () => {
  const manifest = {
    version: 1 as const,
    date: "2026-08-11",
    slot: "morning" as const,
    cumulativeTarget: 20,
    firstContactIds: [10, 11],
    followupIds: [20, 21],
    createdAt: "2026-08-10T20:00:00.000Z",
  };
  const approval = createProspectingApproval(manifest, "2026-08-10T20:05:00.000Z");
  assert.equal(approval.manifestHash, manifestHash(manifest));
  assert.deepEqual(validateProspectingApproval(manifest, approval, "2026-08-11"), { ok: true, resuming: false });
  assert.equal(validateProspectingApproval({ ...manifest, firstContactIds: [99] }, approval, "2026-08-11").ok, false);
  assert.equal(validateProspectingApproval(manifest, { ...approval, consumedAt: "2026-08-11T12:00:00.000Z" }, "2026-08-11").ok, false);
  assert.equal(validateProspectingApproval(manifest, approval, "2026-08-12").ok, false);
});

test("lote interrompido no meio e retomado; lote em andamento nao e duplicado", () => {
  const manifest = {
    version: 1 as const,
    date: "2026-08-11",
    slot: "afternoon" as const,
    cumulativeTarget: 40,
    firstContactIds: [10, 11],
    followupIds: [20, 21],
    createdAt: "2026-08-10T20:00:00.000Z",
  };
  const approval = createProspectingApproval(manifest, "2026-08-11T11:30:00.000Z");
  const now = new Date("2026-08-11T17:20:00.000Z");
  const emAndamento = {
    ...approval,
    attempts: 1,
    lease: { pid: 4321, startedAt: "2026-08-11T17:05:00.000Z", attempt: 1 },
  };

  // Runner vivo: o tick de 5 minutos precisa sair calado, senao dispara em dobro.
  assert.deepEqual(validateProspectingApproval(manifest, emAndamento, "2026-08-11", { now, isRunnerAlive: () => true }), {
    ok: false,
    reason: "em_andamento",
  });
  // Runner morto (foi o caso de 11/08): o proximo tick termina o que faltou.
  assert.deepEqual(validateProspectingApproval(manifest, emAndamento, "2026-08-11", { now, isRunnerAlive: () => false }), {
    ok: true,
    resuming: true,
  });
  // PID reciclado nao pode prender o lote para sempre: lease velho vence pela idade.
  const velho = { ...emAndamento, lease: { pid: 4321, startedAt: "2026-08-11T09:00:00.000Z", attempt: 1 } };
  assert.deepEqual(validateProspectingApproval(manifest, velho, "2026-08-11", { now, isRunnerAlive: () => true }), {
    ok: true,
    resuming: true,
  });
  // Lote que morre sempre no comeco para de retomar antes de queimar o teto do dia.
  const esgotado = { ...emAndamento, attempts: MAX_ATTEMPTS, lease: null };
  assert.equal(validateProspectingApproval(manifest, esgotado, "2026-08-11", { now }).ok, false);
});

test("scripts criticos usam a paginacao compartilhada", () => {
  for (const relative of [
    "../scripts/uazapi-send-batch.mjs",
    "../scripts/uazapi-followup-batch.mjs",
    "../scripts/uazapi-check-numbers.mjs",
  ]) {
    const source = readFileSync(new URL(relative, import.meta.url), "utf8");
    assert.match(source, /fetchAllPages/);
    assert.doesNotMatch(source, /Range:\s*["']0-9999["']/);
  }
});

test("preparacao, aprovacao e dispatcher permanecem separados", () => {
  const prepare = readFileSync(new URL("../scripts/prepare-prospecting-day.mjs", import.meta.url), "utf8");
  const approve = readFileSync(new URL("../scripts/approve-prospecting-day.mjs", import.meta.url), "utf8");
  const dispatch = readFileSync(new URL("../scripts/dispatch-approved-batch.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(prepare, /--go[\s\S]*uazapi-(send|followup)/);
  assert.match(approve, /createProspectingApproval/);
  assert.match(dispatch, /validateProspectingApproval/);
  assert.match(dispatch, /--go/);
  assert.match(dispatch, /uazapi-followup-batch\.mjs/);
  assert.match(dispatch, /uazapi-send-batch\.mjs/);
  assert.doesNotMatch(dispatch, /\/send\/text/);
});

test("dispatcher preserva as travas antibloqueio dos scripts de envio", () => {
  const send = readFileSync(new URL("../scripts/uazapi-send-batch.mjs", import.meta.url), "utf8");
  const followup = readFileSync(new URL("../scripts/uazapi-followup-batch.mjs", import.meta.url), "utf8");
  const dispatch = readFileSync(new URL("../scripts/dispatch-approved-batch.mjs", import.meta.url), "utf8");
  for (const source of [send, followup]) {
    assert.match(source, /fim de semana/);
    assert.match(source, /duas falhas seguidas/i);
    assert.match(source, /TETO_DIA/);
    assert.match(source, /whatsapp_jid/);
    assert.match(source, /whatsapp_site/);
  }
  assert.match(send, /OPT_OUT/);
  assert.match(dispatch, /--strict-ids/);
});
