import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInstallments,
  currentMonthKey,
  demandBillingMonth,
  demandBillsInMonth,
  demandPaidInMonth,
  demandValueInMonth,
  formatDemandCurrency,
  installmentSummary,
  isMonthKey,
  isMonthPaid,
  monthKeyFromIso,
  monthsBetween,
  nullableMonthKey,
  parseDemandValue,
  recurringMonthsUntil,
  shiftMonthKey,
  sumDemandValues,
  type BillableDemand,
  type DemandCharge,
} from "../src/lib/clientDemands.ts";

function billable(overrides: Partial<BillableDemand> = {}): BillableDemand {
  return {
    status: "todo",
    value: 1000,
    billingType: "one_off",
    billingMonth: null,
    billingUntil: null,
    dueAt: null,
    createdAt: "2026-08-10T12:00:00.000Z",
    ...overrides,
  };
}

test("competencia escolhida na mao vence prazo e data de criacao", () => {
  assert.equal(demandBillingMonth(billable({ billingMonth: "2026-09" , dueAt: "2026-08-20T23:59:59-03:00" })), "2026-09");
  assert.equal(demandBillingMonth(billable({ dueAt: "2026-08-20T23:59:59-03:00" })), "2026-08");
  assert.equal(demandBillingMonth(billable()), "2026-08");
});

test("prazo perto da virada do mes usa o dia de Sao Paulo, nao o UTC", () => {
  // 31/08 23:59 em Sao Paulo e 01/09 02:59 em UTC: a competencia continua sendo agosto.
  assert.equal(monthKeyFromIso("2026-09-01T02:59:00.000Z"), "2026-08");
  assert.equal(monthKeyFromIso(null), null);
  assert.equal(monthKeyFromIso("nao e data"), null);
});

test("pontual entra so na competencia dela", () => {
  const demand = billable({ billingMonth: "2026-08" });
  assert.equal(demandBillsInMonth(demand, "2026-08"), true);
  assert.equal(demandBillsInMonth(demand, "2026-09"), false);
  assert.equal(demandValueInMonth(demand, "2026-08"), 1000);
  assert.equal(demandValueInMonth(demand, "2026-07"), 0);
});

test("mensal repete a partir da competencia e para no fim da recorrencia", () => {
  const demand = billable({ billingType: "monthly", billingMonth: "2026-08", value: 1500 });
  assert.equal(demandValueInMonth(demand, "2026-07"), 0);
  assert.equal(demandValueInMonth(demand, "2026-08"), 1500);
  assert.equal(demandValueInMonth(demand, "2027-02"), 1500);

  const encerrada = billable({ billingType: "monthly", billingMonth: "2026-08", billingUntil: "2026-10", value: 1500 });
  assert.equal(demandValueInMonth(encerrada, "2026-10"), 1500);
  assert.equal(demandValueInMonth(encerrada, "2026-11"), 0);
});

test("demanda cancelada nao fatura em mes nenhum", () => {
  const pontual = billable({ status: "cancelled", billingMonth: "2026-08" });
  const mensal = billable({ status: "cancelled", billingType: "monthly", billingMonth: "2026-08" });
  assert.equal(demandValueInMonth(pontual, "2026-08"), 0);
  assert.equal(demandValueInMonth(mensal, "2026-09"), 0);
});

test("demanda entregue continua contando: o trabalho foi feito e a nota sai", () => {
  const entregue = billable({ status: "done", billingMonth: "2026-08" });
  assert.equal(demandValueInMonth(entregue, "2026-08"), 1000);
});

test("soma do mes junta pontuais da competencia com as mensais vivas", () => {
  const demands = [
    billable({ billingMonth: "2026-08", value: 800 }),
    billable({ billingMonth: "2026-07", value: 500 }),
    billable({ billingType: "monthly", billingMonth: "2026-06", value: 1200 }),
    billable({ billingType: "monthly", billingMonth: "2026-06", billingUntil: "2026-07", value: 300 }),
  ];
  assert.equal(sumDemandValues(demands, "2026-08"), 2000);
  assert.equal(sumDemandValues(demands, "2026-07"), 2000);
});

function parcels(demandId: number, items: Array<Partial<DemandCharge>>): DemandCharge[] {
  return items.map((item, index) => ({
    id: demandId * 100 + index,
    demandId,
    number: index + 1,
    billingMonth: "2026-08",
    value: 1000,
    paidAt: null,
    ...item,
  }));
}

test("parcelamento distribui o total e joga a sobra de centavos na primeira", () => {
  assert.deepEqual(buildInstallments(3000, 3, "2026-08"), [
    { number: 1, billingMonth: "2026-08", value: 1000 },
    { number: 2, billingMonth: "2026-09", value: 1000 },
    { number: 3, billingMonth: "2026-10", value: 1000 },
  ]);

  const quebrado = buildInstallments(1000, 3, "2026-11");
  assert.deepEqual(quebrado.map((item) => item.value), [333.34, 333.33, 333.33]);
  // A soma das parcelas nunca pode fugir do total vendido.
  assert.equal(quebrado.reduce((total, item) => total + item.value, 0), 1000);
  // E a sequencia atravessa a virada do ano.
  assert.deepEqual(quebrado.map((item) => item.billingMonth), ["2026-11", "2026-12", "2027-01"]);
});

test("parcelamento recusa contagem e mes invalidos", () => {
  assert.throws(() => buildInstallments(1000, 0, "2026-08"), /parcelas invalido/);
  assert.throws(() => buildInstallments(1000, 61, "2026-08"), /parcelas invalido/);
  assert.throws(() => buildInstallments(1000, 3, "agosto"), /Mes da primeira parcela/);
});

test("no parcelado o mes vale a parcela, nao o total", () => {
  const demand = billable({
    billingType: "installment",
    value: 3000,
    billingMonth: "2026-08",
    charges: parcels(1, [
      { billingMonth: "2026-08", value: 1000, paidAt: "2026-08-05T12:00:00.000Z" },
      { billingMonth: "2026-09", value: 1000 },
      { billingMonth: "2026-10", value: 1000 },
    ]),
  });

  assert.equal(demandValueInMonth(demand, "2026-08"), 1000);
  assert.equal(demandValueInMonth(demand, "2026-09"), 1000);
  assert.equal(demandValueInMonth(demand, "2026-11"), 0);
  assert.equal(demandBillsInMonth(demand, "2026-10"), true);
  assert.equal(demandBillsInMonth(demand, "2026-12"), false);
});

test("baixa de pagamento so conta a parcela paga do mes", () => {
  const demand = billable({
    billingType: "installment",
    value: 3000,
    charges: parcels(2, [
      { billingMonth: "2026-08", value: 1000, paidAt: "2026-08-05T12:00:00.000Z" },
      { billingMonth: "2026-09", value: 2000 },
    ]),
  });

  assert.equal(demandPaidInMonth(demand, "2026-08"), 1000);
  assert.equal(demandPaidInMonth(demand, "2026-09"), 0);
  // Pontual nao tem baixa por parcela: nao inventa pagamento.
  assert.equal(demandPaidInMonth(billable({ billingMonth: "2026-08" }), "2026-08"), 0);
});

test("duas parcelas no mesmo mes somam (entrada + primeira)", () => {
  const demand = billable({
    billingType: "installment",
    value: 3000,
    charges: parcels(3, [
      { billingMonth: "2026-08", value: 1500 },
      { billingMonth: "2026-08", value: 500 },
      { billingMonth: "2026-09", value: 1000 },
    ]),
  });
  assert.equal(demandValueInMonth(demand, "2026-08"), 2000);
});

test("resumo do parcelamento aponta a proxima parcela em aberto", () => {
  const summary = installmentSummary(billable({
    billingType: "installment",
    value: 3000,
    charges: parcels(4, [
      { billingMonth: "2026-08", value: 1000, paidAt: "2026-08-05T12:00:00.000Z" },
      { billingMonth: "2026-09", value: 1000 },
      { billingMonth: "2026-10", value: 1000 },
    ]),
  }));

  assert.equal(summary.count, 3);
  assert.equal(summary.paidCount, 1);
  assert.equal(summary.paidValue, 1000);
  assert.equal(summary.openValue, 2000);
  assert.equal(summary.nextOpen?.billingMonth, "2026-09");
});

test("parcelado cancelado nao fatura nem aparece como pago", () => {
  const demand = billable({
    status: "cancelled",
    billingType: "installment",
    value: 3000,
    charges: parcels(5, [{ billingMonth: "2026-08", value: 1000, paidAt: "2026-08-05T12:00:00.000Z" }]),
  });
  assert.equal(demandValueInMonth(demand, "2026-08"), 0);
  assert.equal(demandPaidInMonth(demand, "2026-08"), 0);
});

test("pontual e mensal registram pagamento pela cobranca do mes", () => {
  const pontual = billable({
    billingMonth: "2026-08",
    value: 3000,
    charges: parcels(6, [{ billingMonth: "2026-08", value: 3000, paidAt: "2026-08-27T12:00:00.000Z" }]),
  });
  assert.equal(isMonthPaid(pontual, "2026-08"), true);
  assert.equal(demandPaidInMonth(pontual, "2026-08"), 3000);
  assert.equal(demandPaidInMonth(pontual, "2026-09"), 0);

  const mensal = billable({
    billingType: "monthly",
    billingMonth: "2026-06",
    value: 1500,
    charges: parcels(7, [{ billingMonth: "2026-07", value: 1500, paidAt: "2026-07-05T12:00:00.000Z" }]),
  });
  assert.equal(demandPaidInMonth(mensal, "2026-07"), 1500);
  // Mes sem baixa continua devendo, mesmo com a recorrencia ativa.
  assert.equal(demandValueInMonth(mensal, "2026-08"), 1500);
  assert.equal(demandPaidInMonth(mensal, "2026-08"), 0);
});

test("baixa de pontual segue o preco atual, nao o congelado na cobranca", () => {
  // Valor subiu depois da baixa: o recebido acompanha o que a demanda vale hoje.
  const demand = billable({
    billingMonth: "2026-08",
    value: 4000,
    charges: parcels(8, [{ billingMonth: "2026-08", value: 3000, paidAt: "2026-08-27T12:00:00.000Z" }]),
  });
  assert.equal(demandPaidInMonth(demand, "2026-08"), 4000);
});

test("mensal lista os meses ja vencidos para baixa, do mais novo para o mais antigo", () => {
  const mensal = billable({ billingType: "monthly", billingMonth: "2026-06", value: 1000 });
  assert.deepEqual(recurringMonthsUntil(mensal, "2026-08"), ["2026-08", "2026-07", "2026-06"]);
  // Recorrencia encerrada para de listar no ultimo mes cobrado.
  const encerrada = billable({ billingType: "monthly", billingMonth: "2026-06", billingUntil: "2026-07", value: 1000 });
  assert.deepEqual(recurringMonthsUntil(encerrada, "2026-08"), ["2026-07", "2026-06"]);
  // Competencia no futuro nao gera mes nenhum.
  assert.deepEqual(recurringMonthsUntil(billable({ billingType: "monthly", billingMonth: "2026-12" }), "2026-08"), []);
  // Pontual nao entra nessa lista.
  assert.deepEqual(recurringMonthsUntil(billable({ billingMonth: "2026-08" }), "2026-08"), []);
});

test("distancia entre competencias atravessa o ano e aceita mes invalido", () => {
  assert.equal(monthsBetween("2026-08", "2026-11"), 3);
  assert.equal(monthsBetween("2026-11", "2027-01"), 2);
  assert.equal(monthsBetween("2026-11", "2026-08"), -3);
  assert.equal(monthsBetween("agosto", "2026-08"), 0);
});

test("valor aceita numero, ponto decimal e o formato do teclado brasileiro", () => {
  assert.equal(parseDemandValue(1500.5), 1500.5);
  assert.equal(parseDemandValue("1500.50"), 1500.5);
  assert.equal(parseDemandValue("1.500,50"), 1500.5);
  assert.equal(parseDemandValue("R$ 2.000,00"), 2000);
  assert.equal(parseDemandValue(""), 0);
  assert.equal(parseDemandValue(null), 0);
  assert.throws(() => parseDemandValue("-10"), /invalido/);
  assert.throws(() => parseDemandValue("abc"), /invalido/);
});

test("competencia so aceita AAAA-MM", () => {
  assert.equal(isMonthKey("2026-08"), true);
  assert.equal(isMonthKey("2026-13"), false);
  assert.equal(isMonthKey("2026-8"), false);
  assert.equal(nullableMonthKey("", "Mes"), null);
  assert.equal(nullableMonthKey("2026-08", "Mes"), "2026-08");
  assert.throws(() => nullableMonthKey("agosto", "Mes"), /invalido/);
});

test("navegacao de mes atravessa a virada do ano", () => {
  assert.equal(shiftMonthKey("2026-12", 1), "2027-01");
  assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
  assert.equal(currentMonthKey(new Date("2026-08-27T15:00:00.000Z")), "2026-08");
});

test("moeda sai em real, sem quebrar com valor invalido", () => {
  assert.match(formatDemandCurrency(1500), /1\.500,00/);
  assert.match(formatDemandCurrency(Number.NaN), /0,00/);
});
