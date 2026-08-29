import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTRACT_STATUSES,
  CONTRACT_TEMPLATES,
  assertContractTransition,
  buildContractDocument,
  formatContractCurrency,
  mapClientContract,
  validateContractDraft,
} from "../src/lib/clientContracts.ts";
import { CONTRACT_PROVIDER } from "../src/lib/contractProvider.ts";

const client = {
  id: 7,
  name: "Cliente Exemplo",
  legalName: "Cliente Exemplo LTDA",
  cnpj: "11222333000181",
  email: "financeiro@cliente.test",
  phone: "31999990000",
  address: "Rua Um, 10",
  city: "Joao Monlevade",
  state: "MG",
  zipCode: "35930000",
  representativeName: "Maria Exemplo",
  representativeDocument: "12345678900",
};

const draft = {
  clientId: 7,
  templateKey: "mydrion_technology" as const,
  title: "Sistema de operacoes",
  object: "Desenvolvimento de sistema web sob medida.",
  scope: ["Descoberta e especificacao", "Implementacao e aceite"],
  value: 12500,
  paymentTerms: "Entrada de 50% e saldo no aceite.",
  startsOn: "2026-09-01",
  endsOn: "2026-11-30",
  signingCity: "Joao Monlevade",
  signingDate: "2026-08-29",
  representativeName: "Maria Exemplo",
  representativeDocument: "12345678900",
  notes: "",
};

test("catalogo inicial possui exatamente os quatro modelos aprovados", () => {
  assert.deepEqual(Object.keys(CONTRACT_TEMPLATES), [
    "general_services",
    "visual_identity",
    "social_media",
    "mydrion_technology",
  ]);
  assert.deepEqual(CONTRACT_STATUSES, ["draft", "generated", "sent", "signed", "cancelled"]);
});

test("rascunho valida campos obrigatorios, valor e datas", () => {
  assert.deepEqual(validateContractDraft(draft), draft);
  assert.throws(() => validateContractDraft({ ...draft, value: 0 }), /maior que zero/i);
  assert.throws(() => validateContractDraft({ ...draft, scope: [] }), /escopo/i);
  assert.throws(() => validateContractDraft({ ...draft, startsOn: "2026-12-01" }), /termino/i);
});

test("status segue ciclo auditavel e nao pula para assinado", () => {
  assert.doesNotThrow(() => assertContractTransition("draft", "generated"));
  assert.doesNotThrow(() => assertContractTransition("generated", "sent"));
  assert.doesNotThrow(() => assertContractTransition("sent", "signed"));
  assert.throws(() => assertContractTransition("draft", "signed"), /transicao/i);
  assert.throws(() => assertContractTransition("signed", "draft"), /transicao/i);
});

test("documento congela cliente, contratada, valor e template", () => {
  const document = buildContractDocument(draft, client, CONTRACT_PROVIDER);
  assert.equal(document.templateKey, "mydrion_technology");
  assert.equal(document.client.legalName, "Cliente Exemplo LTDA");
  assert.equal(document.provider.brandName, "Mydrion");
  assert.match(document.provider.legalName, /ERICK MOREIRA SENA SILVEIRA/i);
  assert.equal(document.value, 12500);
  assert.equal(document.scope.length, 2);
  assert.ok(document.sections.length >= 6);
  assert.equal(formatContractCurrency(12500), "R$ 12.500,00");
});

test("linha do banco vira contrato tipado sem confiar em status invalido", () => {
  const contract = mapClientContract({
    id: 4,
    contract_number: "CTR-2026-0004",
    client_id: 7,
    template_key: "visual_identity",
    template_version: 1,
    status: "qualquer",
    title: "Identidade",
    draft_payload: draft,
    created_at: "2026-08-29T12:00:00.000Z",
    updated_at: "2026-08-29T12:00:00.000Z",
  });
  assert.equal(contract.status, "draft");
  assert.equal(contract.templateKey, "visual_identity");
  assert.equal(contract.clientId, 7);
});
