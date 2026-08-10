import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import salesPlaybookModule from "../src/lib/salesPlaybook.mjs";
import { buildRunPlan } from "../scripts/prospeccao-runner.mjs";

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
  assert.match(m2, /Ficha de Escopo/i);
  assert.match(m3, /[uú]ltima mensagem/i);
  assert.equal(new Set([m1, m2, m3]).size, 3);
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
