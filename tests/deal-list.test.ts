import assert from "node:assert/strict";
import test from "node:test";
import type { Deal } from "../src/lib/crmRecords.ts";
import {
  filterDeals,
  paginateDeals,
  sortDeals,
} from "../src/lib/dealList.ts";

function deal(overrides: Partial<Deal> & Pick<Deal, "id" | "company">): Deal {
  return {
    stage: "prospect",
    value: 0,
    ...overrides,
    id: overrides.id,
    company: overrides.company,
  };
}

const deals = [
  deal({
    id: 1,
    company: "Metalthec",
    title: "Automacao comercial",
    stage: "proposal",
    owner: "Erick",
    value: 12000,
    dealHealthScore: 81,
    nextActionAt: "2026-08-26T12:00:00.000Z",
    updated_at: "2026-08-24T12:00:00.000Z",
  }),
  deal({
    id: 2,
    company: "Jotta",
    title: "Site institucional",
    stage: "qualified",
    assignee: "Pri",
    value: 5000,
    dealHealthScore: 62,
    nextActionAt: "2026-08-25T12:00:00.000Z",
    updated_at: "2026-08-25T12:00:00.000Z",
  }),
  deal({
    id: 3,
    company: "OStrack",
    title: "Expansao SaaS",
    stage: "proposal",
    ownerName: "Erick",
    value: 18000,
    dealHealthScore: 45,
    updated_at: "2026-08-23T12:00:00.000Z",
  }),
];

test("combina busca textual, etapa e responsavel sem diferenciar maiusculas", () => {
  assert.deepEqual(
    filterDeals(deals, { query: "autoMACAO", stage: "proposal", owner: "erick" }).map((item) => item.id),
    [1],
  );

  assert.deepEqual(
    filterDeals(deals, { query: "", stage: "proposal", owner: "Erick" }).map((item) => item.id),
    [1, 3],
  );
});

test("ordena valores presentes e mantem dados ausentes no fim com desempate por id", () => {
  assert.deepEqual(sortDeals(deals, "nextAction", "asc").map((item) => item.id), [2, 1, 3]);
  assert.deepEqual(sortDeals(deals, "value", "desc").map((item) => item.id), [3, 1, 2]);
  assert.deepEqual(sortDeals(deals, "health", "asc").map((item) => item.id), [3, 2, 1]);

  const sameCompany = [deal({ id: 8, company: "BFT" }), deal({ id: 4, company: "BFT" })];
  assert.deepEqual(sortDeals(sameCompany, "company", "asc").map((item) => item.id), [4, 8]);
});

test("pagina 50 itens e corrige pagina fora do intervalo", () => {
  const manyDeals = Array.from({ length: 121 }, (_, index) => deal({ id: index + 1, company: `Deal ${index + 1}` }));

  assert.deepEqual(paginateDeals(manyDeals, 2), {
    items: manyDeals.slice(50, 100),
    page: 2,
    pageSize: 50,
    total: 121,
    totalPages: 3,
    start: 51,
    end: 100,
  });

  const clamped = paginateDeals(manyDeals.slice(0, 3), 9);
  assert.equal(clamped.page, 1);
  assert.equal(clamped.start, 1);
  assert.equal(clamped.end, 3);
});
