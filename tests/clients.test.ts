import assert from "node:assert/strict";
import test from "node:test";

import {
  clientTotals,
  formatCnpj,
  isValidCnpj,
  mapClient,
  normalizeClientName,
  normalizeCnpj,
} from "../src/lib/clients.ts";
import type { ClientDemand } from "../src/lib/clientDemands.ts";

let nextId = 1;

function demand(overrides: Partial<ClientDemand> = {}): ClientDemand {
  return {
    id: nextId++,
    dealId: null,
    clientId: 1,
    folderId: null,
    title: "Demanda",
    description: "",
    copyText: "",
    status: "todo",
    priority: "normal",
    assignee: "Erick",
    destinationType: "other",
    destinationLabel: "",
    value: 0,
    billingType: "one_off",
    billingMonth: null,
    billingUntil: null,
    charges: [],
    startsAt: null,
    dueAt: null,
    completedAt: null,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    client: null,
    deal: null,
    checklistItems: [],
    links: [],
    attachments: [],
    events: [],
    ...overrides,
  };
}

test("CNPJ so passa com digito verificador correto", () => {
  assert.equal(isValidCnpj("11.222.333/0001-81"), true);
  assert.equal(isValidCnpj("11222333000181"), true);
  assert.equal(isValidCnpj("11222333000180"), false);
  assert.equal(isValidCnpj("11111111111111"), false);
  assert.equal(isValidCnpj("1122233300018"), false);
  assert.equal(isValidCnpj(""), false);
  assert.equal(isValidCnpj(null), false);
});

test("CNPJ e guardado so em digito e formatado na saida", () => {
  assert.equal(normalizeCnpj("11.222.333/0001-81"), "11222333000181");
  assert.equal(normalizeCnpj("   "), null);
  assert.equal(normalizeCnpj(undefined), null);
  assert.equal(formatCnpj("11222333000181"), "11.222.333/0001-81");
  assert.equal(formatCnpj(null), "");
});

test("mapClient le a linha do banco e nao inventa status nem origem", () => {
  const client = mapClient({
    id: 7,
    deal_id: 42,
    name: "Jotta Manutencoes",
    legal_name: "Jotta Manutencoes LTDA",
    cnpj: "11.222.333/0001-81",
    status: "lixo",
    source: "outra coisa",
    created_at: "2026-08-01T12:00:00.000Z",
  });

  assert.equal(client.id, 7);
  assert.equal(client.dealId, 42);
  assert.equal(client.cnpj, "11222333000181");
  assert.equal(client.status, "active");
  assert.equal(client.source, "manual");
  assert.equal(client.email, "");
});

test("totais do cliente separam o mes, o recorrente e o que ja foi contratado", () => {
  const demands = [
    demand({ value: 800, billingMonth: "2026-08", status: "done" }),
    demand({ value: 1200, billingType: "monthly", billingMonth: "2026-06" }),
    demand({ value: 500, billingMonth: "2026-07" }),
    demand({ value: 900, billingMonth: "2026-08", status: "cancelled" }),
  ];

  const totals = clientTotals(demands, "2026-08");
  assert.equal(totals.demands, 4);
  assert.equal(totals.monthValue, 2000);
  assert.equal(totals.monthDemands, 2);
  assert.equal(totals.recurringValue, 1200);
  // Cancelada nao entra no contratado; a entregue entra.
  assert.equal(totals.contractedValue, 2500);
});

test("conta como aberta a demanda que nao foi entregue nem cancelada", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");
  const totals = clientTotals([
    demand({ status: "todo", dueAt: "2026-08-20T23:59:59.000Z" }),
    demand({ status: "in_progress", dueAt: "2026-09-10T23:59:59.000Z" }),
    demand({ status: "done", dueAt: "2026-08-01T23:59:59.000Z" }),
    demand({ status: "cancelled" }),
  ], "2026-08", now);

  assert.equal(totals.openDemands, 2);
  assert.equal(totals.overdueDemands, 1);
});

test("cliente sem demanda nao quebra os totais", () => {
  const totals = clientTotals([], "2026-08");
  assert.deepEqual(totals, {
    demands: 0,
    openDemands: 0,
    overdueDemands: 0,
    monthDemands: 0,
    monthValue: 0,
    monthPaidValue: 0,
    recurringValue: 0,
    contractedValue: 0,
    lastDueAt: null,
  });
});

test("venda parcelada entra no mes pela parcela, e o pago aparece separado", () => {
  // O caso real: CRM de 3.000 em 3x, a primeira ja paga.
  const parcelada = demand({
    value: 3000,
    billingType: "installment",
    billingMonth: "2026-07",
    charges: [
      { id: 1, demandId: 1, number: 1, billingMonth: "2026-07", value: 1000, paidAt: "2026-07-10T12:00:00.000Z" },
      { id: 2, demandId: 1, number: 2, billingMonth: "2026-08", value: 1000, paidAt: null },
      { id: 3, demandId: 1, number: 3, billingMonth: "2026-09", value: 1000, paidAt: null },
    ],
  });

  const agosto = clientTotals([parcelada], "2026-08");
  assert.equal(agosto.monthValue, 1000);
  assert.equal(agosto.monthPaidValue, 0);
  assert.equal(agosto.monthDemands, 1);
  // O contratado continua sendo a venda inteira, nao a parcela do mes.
  assert.equal(agosto.contractedValue, 3000);

  const julho = clientTotals([parcelada], "2026-07");
  assert.equal(julho.monthValue, 1000);
  assert.equal(julho.monthPaidValue, 1000);
});

test("dedup de nome ignora acento, caixa e espaco duplo", () => {
  assert.equal(normalizeClientName("  Jotta   Manutenções "), normalizeClientName("JOTTA MANUTENCOES"));
  assert.notEqual(normalizeClientName("Jotta"), normalizeClientName("Jotta Manutencoes"));
});
