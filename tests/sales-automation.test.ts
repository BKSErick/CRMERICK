import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import salesPlaybookModule from "../src/lib/salesPlaybook.mjs";
import { buildRunPlan } from "../scripts/prospeccao-runner.mjs";

// regenerate-copies.js e CommonJS (usa `return` de topo e module.exports), entao entra por
// createRequire, do mesmo jeito que scripts/generate-copies-db.mjs faz.
const requireCjs = createRequire(import.meta.url);
const { gerarCopy } = requireCjs("../scripts/regenerate-copies.js");

const {
  SALES_PLAYBOOK,
  copyAssignmentForLead,
  detectVariantFromCopy,
  renderFollowupMessage,
} = salesPlaybookModule;

test("playbook versiona oferta, copy e experimento ativo", () => {
  assert.match(SALES_PLAYBOOK.copyVersion, /^copy-/);
  assert.match(SALES_PLAYBOOK.offer.version, /^offer-/);
  assert.equal(SALES_PLAYBOOK.offer.setupPrice, 1000);
  assert.equal(SALES_PLAYBOOK.offer.monthlyPrice, 150);
  assert.equal(SALES_PLAYBOOK.experiment.variants.length, 2);
});

test("atribuicao A/B e deterministica e registra as versoes usadas", () => {
  const first = copyAssignmentForLead({ id: 42, company: "Metal Teste" });
  const repeat = copyAssignmentForLead({ id: 42, company: "Metal Teste" });
  assert.deepEqual(first, repeat);
  assert.ok(first.variant === "A" || first.variant === "B");
  assert.equal(first.copyVersion, SALES_PLAYBOOK.copyVersion);
  assert.equal(first.offerVersion, SALES_PLAYBOOK.offer.version);
  assert.equal(first.experimentId, SALES_PLAYBOOK.experiment.id);
});

test("a variante persistida acompanha a abertura realmente enviada", () => {
  assert.equal(detectVariantFromCopy("Fala! Erick aqui, texto"), "B");
  assert.equal(detectVariantFromCopy("Oi, tudo bem? Erick aqui, texto"), "A");
  assert.equal(
    copyAssignmentForLead({ id: 8, company: "Empresa", copyText: "Fala! Erick aqui" }).variant,
    "B",
  );
});

test("follow-ups saem do playbook compartilhado e cada toque traz angulo novo", () => {
  const m1 = renderFollowupMessage({ tier: "M1", company: "Acme Usinagem", segment: "usinagem" });
  const m2 = renderFollowupMessage({ tier: "M2", company: "Acme Usinagem", segment: "usinagem", city: "Joao Monlevade" });
  const m3 = renderFollowupMessage({ tier: "M3", company: "Acme Usinagem", segment: "usinagem" });
  assert.match(m1, /or[cç]amento|Material/i);
  // O mecanismo virou "Pedido Pronto" no reposicionamento; "Ficha de Escopo" morreu
  // e o site e a fonte da verdade. Este teste tinha ficado para tras da copy.
  assert.match(m2, /Pedido Pronto/i);
  assert.match(m3, /[uú]ltima mensagem/i);
  assert.equal(new Set([m1, m2, m3]).size, 3);
});

// Contrato da doutrina v3 (31/08): a sequencia avanca UM degrau por mensagem e a msg 1
// nao vende. Sem trava, uma edicao bem-intencionada devolve o "quer ver?" para a primeira
// mensagem e o funil volta a pedir oferta antes de o lead reconhecer que tem a dor.
test("msg 1 fecha em pergunta de reconhecimento, nunca em oferta", () => {
  const cenarios = [
    gerarCopy({ empresa: "Acme Usinagem", temSite: true, mapsInfo: "", cidade: "Betim", variante: "A" }),
    gerarCopy({ empresa: "Acme Caldeiraria", temSite: false, mapsInfo: "", cidade: "Betim", variante: "B" }),
    gerarCopy({ empresa: "Acme Manutencoes", temSite: true, mapsInfo: "", cidade: "Joao Monlevade", variante: "A" }),
  ];
  for (const copy of cenarios) {
    assert.ok(copy.trim().endsWith("?"), `nao termina em pergunta: ${copy}`);
    assert.doesNotMatch(copy, /quer ver\?/i);
    assert.doesNotMatch(copy, /faz sentido/i);
    assert.doesNotMatch(copy, /https?:\/\//);
  }
});

// M2 e o unico toque que apresenta a correcao, e ele pergunta prioridade em vez de marcar
// hora. Em lead frio industrial o CTA e pergunta: pedir reuniao antes do reconhecimento
// foi o que fazia o M2 morrer sem resposta.
test("follow-ups testam prioridade sem pedir reuniao", () => {
  const m1 = renderFollowupMessage({ tier: "M1", company: "Acme Usinagem", segment: "usinagem" });
  const m2 = renderFollowupMessage({ tier: "M2", company: "Acme Usinagem", segment: "usinagem", city: "Betim" });
  assert.match(m2, /resolveria um problema real hoje/i);
  for (const copy of [m1, m2]) {
    assert.doesNotMatch(copy, /15 minutos|chamada r[aá]pida|reuni[aã]o/i);
  }
});

test("runner e dry-run por padrao e so propaga --go com autorizacao explicita", () => {
  const dry = buildRunPlan({ go: false, city: "Ipatinga", uf: "MG", limit: 10 });
  assert.ok(dry.length >= 4);
  assert.equal(dry.some((step) => step.args.includes("--go")), false);

  const live = buildRunPlan({ go: true, city: "Ipatinga", uf: "MG", limit: 10 });
  assert.ok(live.every((step) => step.args.includes("--go")));
});

test("scripts de envio registram metadados e usam o playbook compartilhado", () => {
  const send = readFileSync(new URL("../scripts/uazapi-send-batch.mjs", import.meta.url), "utf8");
  const followup = readFileSync(new URL("../scripts/uazapi-followup-batch.mjs", import.meta.url), "utf8");
  assert.match(send, /copyAssignmentForLead/);
  assert.match(send, /metadata/);
  assert.match(followup, /renderFollowupMessage/);
});
