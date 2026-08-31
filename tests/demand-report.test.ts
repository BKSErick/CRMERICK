import assert from "node:assert/strict";
import test from "node:test";
import {
  demandBilledTotal,
  demandPaidTotal,
  type ClientDemand,
  type DemandStatus,
} from "../src/lib/clientDemands.ts";
import { buildDemandReport } from "../src/lib/demandReport.ts";

let nextId = 1;

function demand(overrides: Partial<ClientDemand> = {}): ClientDemand {
  return {
    id: nextId++,
    dealId: 1,
    clientId: 1,
    folderId: null,
    title: "Demanda",
    description: "",
    copyText: "",
    status: "done" as DemandStatus,
    priority: "normal",
    assignee: "Erick",
    destinationType: "other",
    destinationLabel: "",
    value: 100,
    billingType: "one_off",
    billingMonth: "2026-08",
    billingUntil: null,
    charges: [],
    startsAt: null,
    dueAt: "2026-08-20T23:59:59.000Z",
    completedAt: "2026-08-20T12:00:00.000Z",
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    client: null,
    deal: { id: 1, company: "BFT" },
    checklistItems: [],
    links: [],
    attachments: [],
    events: [],
    ...overrides,
  };
}

const NOW = new Date("2026-08-31T15:00:00-03:00");

test("relatorio do mes so pega entregue e ignora o resto", () => {
  const report = buildDemandReport([
    demand({ title: "Entregue" }),
    demand({ title: "Em andamento", status: "in_progress" }),
    demand({ title: "Em aprovacao", status: "review" }),
    demand({ title: "Cancelada", status: "cancelled" }),
    demand({ title: "Entregue em outro mes", billingMonth: "2026-07" }),
  ], { month: "2026-08" }, NOW);

  assert.deepEqual(report.lines.map((line) => line.demand.title), ["Entregue"]);
  assert.equal(report.totals.count, 1);
  assert.equal(report.totals.delivered, 100);
  assert.equal(report.totals.paid, 0);
  assert.equal(report.totals.open, 100);
});

test("parcelado cobra a parcela do mes e marca a baixa daquela parcela", () => {
  const parcelada = demand({
    title: "Site em 3x",
    value: 900,
    billingType: "installment",
    billingMonth: "2026-07",
    charges: [
      { id: 1, demandId: 1, number: 1, billingMonth: "2026-07", value: 300, paidAt: "2026-07-10T12:00:00.000Z" },
      { id: 2, demandId: 1, number: 2, billingMonth: "2026-08", value: 300, paidAt: null },
      { id: 3, demandId: 1, number: 3, billingMonth: "2026-09", value: 300, paidAt: null },
    ],
  });

  const agosto = buildDemandReport([parcelada], { month: "2026-08" }, NOW);
  assert.equal(agosto.totals.delivered, 300);
  assert.equal(agosto.totals.paid, 0);
  assert.equal(agosto.lines[0].isPaid, false);

  const julho = buildDemandReport([parcelada], { month: "2026-07" }, NOW);
  assert.equal(julho.totals.delivered, 300);
  assert.equal(julho.totals.paid, 300);
  assert.equal(julho.lines[0].isPaid, true);
  assert.equal(julho.totals.open, 0);
});

test("todo o periodo soma o acumulado de cada regime", () => {
  const pontual = demand({ title: "Pontual", value: 150 });
  const parcelada = demand({
    title: "Parcelado",
    value: 900,
    billingType: "installment",
    charges: [
      { id: 4, demandId: 2, number: 1, billingMonth: "2026-07", value: 450, paidAt: "2026-07-10T12:00:00.000Z" },
      { id: 5, demandId: 2, number: 2, billingMonth: "2026-08", value: 450, paidAt: null },
    ],
  });
  // Mensal viva de junho ate agosto: tres competencias no acumulado.
  const mensal = demand({ title: "Mensal", value: 200, billingType: "monthly", billingMonth: "2026-06" });

  assert.equal(demandBilledTotal(pontual, "2026-08"), 150);
  assert.equal(demandBilledTotal(parcelada, "2026-08"), 900);
  assert.equal(demandPaidTotal(parcelada, "2026-08"), 450);
  assert.equal(demandBilledTotal(mensal, "2026-08"), 600);

  const report = buildDemandReport([pontual, parcelada, mensal], { month: null }, NOW);
  assert.equal(report.scopeLabel, "Todo o periodo");
  assert.equal(report.totals.count, 3);
  assert.equal(report.totals.delivered, 150 + 900 + 600);
  assert.equal(report.totals.paid, 450);
  assert.equal(report.totals.open, report.totals.delivered - report.totals.paid);
});

test("cancelada nao gera cobranca em nenhum dos dois modos", () => {
  const cancelada = demand({ status: "cancelled", value: 500 });
  assert.equal(demandBilledTotal(cancelada, "2026-08"), 0);
  assert.equal(demandPaidTotal(cancelada, "2026-08"), 0);
  assert.equal(buildDemandReport([cancelada], { month: null }, NOW).totals.count, 0);
  assert.equal(buildDemandReport([cancelada], { month: "2026-08" }, NOW).totals.count, 0);
});

test("a cobrar nunca fica negativo e a ordem e da entrega mais recente", () => {
  const report = buildDemandReport([
    demand({ title: "Antiga", completedAt: "2026-08-02T12:00:00.000Z" }),
    demand({ title: "Recente", completedAt: "2026-08-28T12:00:00.000Z" }),
    demand({ title: "Meio", completedAt: "2026-08-15T12:00:00.000Z" }),
  ], { month: "2026-08" }, NOW);

  assert.deepEqual(report.lines.map((line) => line.demand.title), ["Recente", "Meio", "Antiga"]);
  assert.ok(report.totals.open >= 0);
});
