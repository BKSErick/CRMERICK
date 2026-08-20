import assert from "node:assert/strict";
import test from "node:test";

import {
  checklistProgress,
  groupDemandBySchedule,
  isEligibleDemandDeal,
  normalizeHttpUrl,
  transitionDemandStatus,
  validateDemandAttachment,
} from "../src/lib/clientDemands.ts";

test("aceita apenas deals ganhos como clientes elegiveis", () => {
  assert.equal(isEligibleDemandDeal({ stage: "won", status: "open" }), true);
  assert.equal(isEligibleDemandDeal({ stage: "prospect", status: "won" }), true);
  assert.equal(isEligibleDemandDeal({ stage: "negotiation", status: "open" }), false);
  assert.equal(isEligibleDemandDeal({ stage: "lost", status: "lost" }), false);
});

test("agrupa demandas pelo dia de Sao Paulo sem depender do fuso do servidor", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");
  const base = { status: "todo" as const };

  assert.equal(groupDemandBySchedule({ ...base, dueAt: "2026-08-19T23:00:00.000Z" }, now), "overdue");
  assert.equal(groupDemandBySchedule({ ...base, dueAt: "2026-08-20T18:00:00.000Z" }, now), "today");
  assert.equal(groupDemandBySchedule({ ...base, dueAt: "2026-08-21T12:00:00.000Z" }, now), "upcoming");
  assert.equal(groupDemandBySchedule({ ...base, dueAt: null }, now), "no_due");
  assert.equal(groupDemandBySchedule({ status: "done", dueAt: "2026-08-19T12:00:00.000Z" }, now), "completed");
  assert.equal(groupDemandBySchedule({ status: "cancelled", dueAt: null }, now), "completed");
});

test("concluir e reabrir mantem completedAt coerente", () => {
  const completed = transitionDemandStatus("in_progress", "done", "2026-08-20T12:30:00.000Z");
  assert.deepEqual(completed, { status: "done", completedAt: "2026-08-20T12:30:00.000Z" });

  const reopened = transitionDemandStatus("done", "review", "2026-08-21T10:00:00.000Z");
  assert.deepEqual(reopened, { status: "review", completedAt: null });
});

test("calcula progresso real do checklist", () => {
  assert.deepEqual(checklistProgress([]), { completed: 0, total: 0, percentage: 0 });
  assert.deepEqual(
    checklistProgress([{ isDone: true }, { isDone: false }, { isDone: true }]),
    { completed: 2, total: 3, percentage: 67 },
  );
});

test("aceita somente links http e https", () => {
  assert.equal(normalizeHttpUrl("https://example.com/briefing"), "https://example.com/briefing");
  assert.equal(normalizeHttpUrl(" http://example.com "), "http://example.com/");
  assert.throws(() => normalizeHttpUrl("javascript:alert(1)"), /http ou https/i);
  assert.throws(() => normalizeHttpUrl("drive sem url"), /URL valida/i);
});

test("valida tipo e tamanho de anexos", () => {
  assert.deepEqual(
    validateDemandAttachment({ fileName: "layout.png", mimeType: "image/png", sizeBytes: 1024 }),
    { fileName: "layout.png", mimeType: "image/png", sizeBytes: 1024 },
  );
  assert.equal(
    validateDemandAttachment({ fileName: "video.mp4", mimeType: "video/mp4", sizeBytes: 2048 }).mimeType,
    "video/mp4",
  );
  assert.throws(
    () => validateDemandAttachment({ fileName: "script.exe", mimeType: "application/x-msdownload", sizeBytes: 10 }),
    /nao permitido/i,
  );
  assert.throws(
    () => validateDemandAttachment({ fileName: "grande.mp4", mimeType: "video/mp4", sizeBytes: 101 * 1024 * 1024 }),
    /100 MB/i,
  );
});
