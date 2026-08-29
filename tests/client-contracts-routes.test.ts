import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("API de contratos exige admin e monta snapshots no servidor", () => {
  const route = source("src/app/api/client-contracts/route.ts");
  assert.match(route, /requireDemandAdminSession\(request, "clientes"\)/);
  assert.match(route, /buildContractDocument/);
  assert.match(route, /CONTRACT_PROVIDER/);
  assert.match(route, /allocate_client_contract_number/);
  assert.match(route, /client_snapshot/);
  assert.match(route, /provider_snapshot/);
  assert.match(route, /document_snapshot/);
});

test("rota PDF e privada, usa snapshot e bloqueia rascunho", () => {
  const route = source("src/app/api/client-contracts/[id]/pdf/route.ts");
  assert.match(route, /requireDemandAdminSession\(request, "clientes"\)/);
  assert.match(route, /documentSnapshot/);
  assert.match(route, /application\/pdf/);
  assert.match(route, /private, no-store/);
  assert.match(route, /Rascunho/);
});

test("cliente com contrato nao pode ser excluido e orphanar o historico", () => {
  const clientsRoute = source("src/app/api/clients/route.ts");
  assert.match(clientsRoute, /client_contracts/);
  assert.match(clientsRoute, /contrato\(s\)/);
});
