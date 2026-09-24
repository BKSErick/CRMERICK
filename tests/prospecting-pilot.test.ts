import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { metricasDoPiloto } from "../src/lib/pilotMetrics.mjs";
import {
  manifestHash,
  pilotAuditIssues,
  type PilotAudit,
  type PilotLead,
  type ProspectingManifestV1,
  type ProspectingManifestV2,
} from "../src/lib/prospectingApproval.ts";

const lead = (id: number, tier: PilotLead["tier"], copy = "Oi, tudo bem? O pedido chega com medida e prazo?"): PilotLead => ({
  id,
  company: `Empresa ${id}`,
  tier,
  evidence: ["porte EPP"],
  decisionAccess: "incerto",
  decisor: null,
  copy,
  offer: { key: tier === "governante" ? "projectOffer" : "offer", name: "x", version: "v1", priceInMessage: tier !== "governante" },
  gates: {
    willian: { aprovado: true, pendenteManual: ["cercadinho"], criterios: [] },
    finch: { aprovado: true, criterios: [] },
  },
});

const manifesto = (leads: PilotLead[]): ProspectingManifestV2 => ({
  version: 2,
  kind: "pilot",
  pilotVersion: "pilot-tier-ab-2026-09-28.1",
  date: "2026-09-28",
  slot: "morning",
  cumulativeTarget: leads.length,
  firstContactIds: leads.map((item) => item.id),
  followupIds: [],
  createdAt: "2026-09-24T20:00:00.000Z",
  leads,
});

const auditoria = (m: ProspectingManifestV2, aprovado: boolean | null, confirmado: boolean | null): PilotAudit => ({
  version: 1,
  date: m.date,
  pilotVersion: m.pilotVersion,
  manifestHashes: { morning: manifestHash(m) },
  auditadoPor: "erick",
  leads: m.leads.map((item) => ({
    id: item.id,
    slot: "morning" as const,
    pendentesManuais: ["cercadinho"],
    confirmacoes: { cercadinho: confirmado },
    aprovado,
  })),
});

const MANHA_25 = new URL("../logs/prospecting-batches/2026-09-25-morning.manifest.json", import.meta.url);

// logs/ e local (gitignored): em outra maquina o teste nao tem o que conferir e pula.
test("P8: v1 mantem o hash; fila congelada de 25/09 continua valida", { skip: !existsSync(MANHA_25) }, () => {
  const manha = JSON.parse(readFileSync(MANHA_25, "utf8")) as ProspectingManifestV1;
  const aprovacao = JSON.parse(readFileSync(new URL("../logs/prospecting-batches/2026-09-25-morning.approval.json", import.meta.url), "utf8"));
  assert.equal(manifestHash(manha), aprovacao.manifestHash);
});

test("P8: copy, empresa e oferta entram no hash do manifesto v2", () => {
  const base = manifesto([lead(1, "governante"), lead(2, "estruturado")]);
  const outraCopy = manifesto([lead(1, "governante", "Outra mensagem"), lead(2, "estruturado")]);
  assert.notEqual(manifestHash(base), manifestHash(outraCopy));
});

test("P8: aprovacao exige auditoria completa, na versao exata do manifesto", () => {
  const m = manifesto([lead(1, "governante"), lead(2, "estruturado")]);
  assert.deepEqual(pilotAuditIssues(m, auditoria(m, true, true)), []);
  assert.ok(pilotAuditIssues(m, null).length > 0, "sem auditoria nao aprova");
  assert.ok(pilotAuditIssues(m, auditoria(m, null, null)).some((p) => /pendente/.test(p)));
  assert.ok(pilotAuditIssues(m, auditoria(m, true, null)).some((p) => /cercadinho/.test(p)));
  assert.ok(pilotAuditIssues(m, auditoria(m, false, true)).some((p) => /reprovado/.test(p)));

  const antiga = auditoria(m, true, true);
  const regenerado = manifesto([lead(1, "governante", "texto novo"), lead(2, "estruturado")]);
  assert.ok(pilotAuditIssues(regenerado, antiga).some((p) => /outra versao/.test(p)));

  const gateReprovado = manifesto([{ ...lead(3, "governante"), gates: { willian: { aprovado: false, pendenteManual: [], criterios: [] }, finch: { aprovado: true, criterios: [] } } }]);
  assert.ok(pilotAuditIssues(gateReprovado, auditoria(gateReprovado, true, true)).some((p) => /Willian/.test(p)));
});

test("P8: placar separa Tier A e Tier B e mede avanco, nao so resposta", () => {
  const leads = [
    { id: 1, tier: "governante" },
    { id: 2, tier: "governante" },
    { id: 3, tier: "estruturado" },
  ];
  const deals = [
    { id: 1, stage: "proposal", response_type: "humana", decision_access: "decisor" },
    { id: 2, stage: "abordado", response_type: null },
    { id: 3, stage: "lost", response_type: "humana", loss_reason_code: "preco" },
  ];
  const messages = [
    { deal_id: 1, direction: "sent", content: "Na Metalthec... https://site-metalthec.vercel.app/", created_at: "2026-09-28T12:00:00Z" },
    { deal_id: 1, direction: "received", content: "acontece sim", ai_intent: "sinal_forte", created_at: "2026-09-28T13:00:00Z" },
    { deal_id: 3, direction: "sent", content: "R$ 1.000 a página", created_at: "2026-09-28T12:00:00Z" },
    { deal_id: 3, direction: "received", content: "caro", ai_intent: null, created_at: "2026-09-28T14:00:00Z" },
  ];
  const r = metricasDoPiloto({ leads, deals, messages, meetings: [], agoraIso: "2026-09-29T12:00:00Z" });
  assert.equal(r.tiers.governante.leads, 2);
  assert.equal(r.tiers.governante.reconhecimento, 1);
  assert.equal(r.tiers.governante.case_aceito, 1);
  assert.equal(r.tiers.governante.decisor_alcancado, 1);
  assert.equal(r.tiers.governante.proposta, 1);
  assert.equal(r.tiers.estruturado.preco_apresentado, 1);
  assert.deepEqual(r.tiers.estruturado.motivo_perda, { preco: 1 });
  assert.equal(r.tiers.estruturado.pendentesClassificacao, 1, "resposta sem leitura segura o proximo lote");
  assert.equal(r.encerrado, false);
});

test("P8: kill de reconhecimento so vale com a janela do piloto encerrada", () => {
  const leads = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, tier: "governante" }));
  const deals = leads.map((item) => ({ id: item.id, stage: "abordado" }));
  const primeiroEnvio = Object.fromEntries(leads.map((item) => [item.id, "2026-09-28T12:00:00Z"]));
  const aberto = metricasDoPiloto({ leads, deals, messages: [], meetings: [], primeiroEnvio, agoraIso: "2026-10-01T12:00:00Z" });
  assert.equal(aberto.tiers.governante.kill, false);
  const fechado = metricasDoPiloto({ leads, deals, messages: [], meetings: [], primeiroEnvio, agoraIso: "2026-10-09T12:00:00Z" });
  assert.equal(fechado.tiers.governante.kill, true);
});
