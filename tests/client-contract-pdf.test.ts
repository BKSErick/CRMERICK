import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildContractDocument } from "../src/lib/clientContracts.ts";
import { renderContractPdf } from "../src/lib/contractPdf.ts";
import { CONTRACT_PROVIDER } from "../src/lib/contractProvider.ts";

test("renderizador produz PDF A4 nao vazio a partir do snapshot", async () => {
  const snapshot = buildContractDocument({
    clientId: 1,
    templateKey: "visual_identity",
    title: "Identidade visual",
    object: "Criacao de identidade visual.",
    scope: ["Marca principal", "Manual da marca"],
    value: 3500,
    paymentTerms: "50% na entrada e 50% na entrega.",
    startsOn: "2026-09-01",
    endsOn: "2026-10-01",
    signingCity: "Joao Monlevade",
    signingDate: "2026-08-29",
    representativeName: "Cliente Teste",
    representativeDocument: "123.456.789-00",
    notes: "",
  }, {
    id: 1,
    name: "Cliente Teste",
    legalName: "Cliente Teste LTDA",
    cnpj: "11222333000181",
    address: "Rua Teste, 10",
    city: "Joao Monlevade",
    state: "MG",
  }, CONTRACT_PROVIDER);

  const pdf = await renderContractPdf(snapshot, "CTR-2026-0001");
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 5000, `PDF pequeno demais: ${pdf.length} bytes`);
  const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
  assert.ok(pageCount >= 1 && pageCount <= 3, `PDF criou ${pageCount} paginas para um contrato curto`);
  const renderer = readFileSync(new URL("../src/lib/contractPdf.ts", import.meta.url), "utf8");
  assert.match(renderer, /document\.x = 56/);
  assert.match(renderer, /lineBreak: false/);
  assert.match(renderer, /ensurePdfSpace/);
});
