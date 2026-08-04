import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("rotas protegidas expoem busca, importacao, fila e acoes manuais", () => {
  assert.match(source("../src/app/api/prospecting/search/route.ts"), /searchInstagramProspects/);
  assert.match(source("../src/app/api/prospecting/import/route.ts"), /importInstagramProspect/);
  assert.match(source("../src/app/api/prospecting/actions/route.ts"), /applyProspectingAction/);
  assert.match(source("../src/app/api/prospecting/route.ts"), /getProspectingQueue/);
});

test("rota de acao nao possui integracao de envio automatico", () => {
  const action = source("../src/app/api/prospecting/actions/route.ts");
  assert.doesNotMatch(action, /graph\.facebook|instagram.*send|sendMessage/i);
  assert.match(action, /confirm_sent/);
});

test("fila reaproveita nome e elogio observados na copy personalizada", () => {
  const repository = source("../src/lib/prospectingRepository.ts");
  assert.match(repository, /copyPersonalization/);
  assert.match(repository, /recipientName/);
  assert.match(repository, /compliment/);
  assert.match(repository, /channel\.evidence/);
});
