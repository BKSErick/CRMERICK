import assert from "node:assert/strict";
import test from "node:test";

import {
  inboxPageWindow,
  normalizeInboxQuery,
  paginateEmailThreads,
} from "../src/lib/emailInbox.ts";

test("pagina threads de dez em dez por padrao", () => {
  const threads = Array.from({ length: 23 }, (_, index) => ({ id: index + 1 }));
  const result = paginateEmailThreads(threads, 2);

  assert.deepEqual(result.items.map((item) => item.id), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 10);
  assert.equal(result.total, 23);
  assert.equal(result.totalPages, 3);
  assert.equal(result.start, 11);
  assert.equal(result.end, 20);
});

test("corrige pagina fora do intervalo", () => {
  const threads = Array.from({ length: 12 }, (_, index) => ({ id: index + 1 }));

  assert.equal(paginateEmailThreads(threads, -2).page, 1);
  assert.equal(paginateEmailThreads(threads, 99).page, 2);
});

test("normaliza busca e limita tamanho", () => {
  assert.equal(normalizeInboxQuery("  ANA@Empresa.COM  "), "ana@empresa.com");
  assert.equal(normalizeInboxQuery("x".repeat(200)).length, 100);
  assert.doesNotMatch(normalizeInboxQuery("ana%),or(id.gt.0"), /[%,()]/);
});

test("calcula range server-side com dez itens", () => {
  assert.deepEqual(inboxPageWindow(2), { page: 2, pageSize: 10, from: 10, to: 19 });
  assert.deepEqual(inboxPageWindow(Number.NaN), { page: 1, pageSize: 10, from: 0, to: 9 });
});
