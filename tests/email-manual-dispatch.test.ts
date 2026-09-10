import assert from "node:assert/strict";
import test from "node:test";
import {
  compileManualEmailSequence,
  renderManualEmail,
  resolveManualDailyCap,
  runManualEmailDispatch,
  type ManualDispatchDependencies,
} from "../src/lib/emailManualDispatch.ts";
import type { EmailAutomationGraph } from "../src/lib/emailAutomationGraph.ts";

function linearGraph(): EmailAutomationGraph {
  const definitions = [
    ["trigger", "trigger.contact_manual", {}],
    ["has-email", "rule.has_email", {}],
    ["confirm-0", "action.confirmation_request", { message: "Aprovar D0" }],
    ["email-0", "action.email_draft", { subject: "Olá {{deal.company}}", body: "Oi {{contact.name}}" }],
    ["wait-2", "action.wait", { amount: 2, unit: "day" }],
    ["confirm-1", "action.confirmation_request", { message: "Aprovar D2" }],
    ["email-1", "action.email_draft", { subject: "Retorno", body: "{{deal.company}} {{email.unsubscribe_url}}" }],
  ] as const;
  return {
    nodes: definitions.map(([id, kind, config], index) => ({
      id,
      type: "automationNode" as const,
      position: { x: index * 100, y: 0 },
      data: { kind, label: id, config },
    })),
    edges: definitions.slice(0, -1).map(([id], index) => ({
      id: `edge-${index}`,
      source: id,
      target: definitions[index + 1][0],
    })),
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

test("compila somente sequencia linear confirmada e acumula as esperas", () => {
  const sequence = compileManualEmailSequence(linearGraph());
  assert.deepEqual(sequence.map((step) => ({ nodeId: step.nodeId, dueAfterMinutes: step.dueAfterMinutes })), [
    { nodeId: "email-0", dueAfterMinutes: 0 },
    { nodeId: "email-1", dueAfterMinutes: 2 * 24 * 60 },
  ]);

  const withoutConfirmation = linearGraph();
  withoutConfirmation.nodes = withoutConfirmation.nodes.filter((node) => node.id !== "confirm-1");
  withoutConfirmation.edges = withoutConfirmation.edges
    .filter((edge) => edge.source !== "confirm-1" && edge.target !== "confirm-1")
    .concat({ id: "edge-direct", source: "wait-2", target: "email-1" });
  assert.throws(() => compileManualEmailSequence(withoutConfirmation), /confirmacao humana/i);

  const branching = linearGraph();
  branching.edges.push({ id: "branch", source: "trigger", target: "email-1" });
  assert.throws(() => compileManualEmailSequence(branching), /linear/i);
});

test("renderiza variaveis com escape e descadastro funcional", () => {
  const step = compileManualEmailSequence(linearGraph())[1];
  const rendered = renderManualEmail(step, {
    contact: { name: "Ana <script>" },
    deal: { company: "ACME & Filhos" },
    recipientEmail: "ana@example.com",
    unsubscribeMailbox: "contato@mydrion.com.br",
  });
  assert.equal(rendered.subject, "Retorno");
  assert.match(rendered.html, /ACME &amp; Filhos/);
  assert.match(rendered.html, /mailto:contato@mydrion\.com\.br\?subject=sair/);
  assert.doesNotMatch(rendered.html, /<script>/);
});

test("limite diario nasce em 20 e nunca ultrapassa o teto duro de 250", () => {
  assert.equal(resolveManualDailyCap(undefined), 20);
  assert.equal(resolveManualDailyCap("30"), 30);
  assert.equal(resolveManualDailyCap("999"), 250);
  assert.equal(resolveManualDailyCap("0"), 20);
});

test("executor prioriza follow-up, envia uma etapa por contato e respeita claim atomico", async () => {
  const order: string[] = [];
  let claims = 0;
  const dependencies: ManualDispatchDependencies = {
    getAutomation: async () => ({ id: "automation", version: 4, status: "validated", graph: linearGraph() }),
    getDailyUsage: async () => 18,
    listDueEnrollments: async () => [{
      id: 10, automationId: "automation", automationVersion: 4, dealId: 1, contactId: 2,
      recipientEmail: "followup@example.com", company: "Follow", contactName: "Fabi", nextStep: 1,
    }],
    listNewCandidates: async () => [{
      dealId: 3, contactId: 4, recipientEmail: "new@example.com", company: "Nova", contactName: "Nina",
    }],
    ensureEnrollment: async (candidate) => ({
      id: 11, automationId: "automation", automationVersion: 4, ...candidate, nextStep: 0,
    }),
    suppressionReason: async () => null,
    stopEnrollment: async () => undefined,
    claimDispatch: async (claim) => {
      claims += 1;
      order.push(claim.recipientEmail);
      return claims <= 2 ? { id: claims, idempotencyKey: `key-${claims}` } : null;
    },
    sendEmail: async (message) => ({ messageId: `brevo-${message.recipientEmail}` }),
    completeDispatch: async () => undefined,
    markDispatchUncertain: async () => undefined,
  };

  const result = await runManualEmailDispatch(dependencies, {
    automationId: "automation",
    actor: "admin@example.com",
    confirmed: true,
    now: new Date("2026-09-10T15:00:00.000Z"),
    dailyCap: 20,
  });

  assert.deepEqual(order, ["followup@example.com", "new@example.com"]);
  assert.equal(result.sent, 2);
  assert.equal(result.remaining, 0);
});

test("executor exige confirmacao e automacao validada", async () => {
  const base = {
    getAutomation: async () => ({ id: "automation", version: 1, status: "draft", graph: linearGraph() }),
  } as unknown as ManualDispatchDependencies;
  await assert.rejects(() => runManualEmailDispatch(base, {
    automationId: "automation", actor: "admin@example.com", confirmed: false,
  }), /confirmacao explicita/i);
  await assert.rejects(() => runManualEmailDispatch(base, {
    automationId: "automation", actor: "admin@example.com", confirmed: true,
  }), /validada/i);
});

test("resposta do lead interrompe a inscricao antes de claim ou envio", async () => {
  let stopped = "";
  let claimed = false;
  const enrollment = {
    id: 10, automationId: "automation", automationVersion: 1, dealId: 1, contactId: 2,
    recipientEmail: "respondeu@example.com", company: "Empresa", contactName: "Ana", nextStep: 1,
  };
  const dependencies: ManualDispatchDependencies = {
    getAutomation: async () => ({ id: "automation", version: 1, status: "validated", graph: linearGraph() }),
    getDailyUsage: async () => 0,
    listDueEnrollments: async () => [enrollment],
    listNewCandidates: async () => [],
    ensureEnrollment: async () => enrollment,
    suppressionReason: async () => "lead_replied",
    stopEnrollment: async (_id, reason) => { stopped = reason; },
    claimDispatch: async () => { claimed = true; return null; },
    sendEmail: async () => { throw new Error("nao deveria enviar"); },
    completeDispatch: async () => undefined,
    markDispatchUncertain: async () => undefined,
  };
  const result = await runManualEmailDispatch(dependencies, {
    automationId: "automation", actor: "admin@example.com", confirmed: true,
  });
  assert.equal(stopped, "lead_replied");
  assert.equal(claimed, false);
  assert.equal(result.stopped, 1);
  assert.equal(result.sent, 0);
});

test("falha depois do claim fica incerta e aborta o restante do lote", async () => {
  let uncertainId = 0;
  const enrollment = {
    id: 10, automationId: "automation", automationVersion: 1, dealId: 1, contactId: 2,
    recipientEmail: "falha@example.com", company: "Empresa", contactName: "Ana", nextStep: 0,
  };
  const dependencies: ManualDispatchDependencies = {
    getAutomation: async () => ({ id: "automation", version: 1, status: "validated", graph: linearGraph() }),
    getDailyUsage: async () => 0,
    listDueEnrollments: async () => [enrollment],
    listNewCandidates: async () => { throw new Error("o lote deveria abortar antes"); },
    ensureEnrollment: async () => enrollment,
    suppressionReason: async () => null,
    stopEnrollment: async () => undefined,
    claimDispatch: async () => ({ id: 77, idempotencyKey: "stable-key" }),
    sendEmail: async () => { throw new Error("timeout"); },
    completeDispatch: async () => undefined,
    markDispatchUncertain: async (id) => { uncertainId = id; },
  };
  const result = await runManualEmailDispatch(dependencies, {
    automationId: "automation", actor: "admin@example.com", confirmed: true,
  });
  assert.equal(uncertainId, 77);
  assert.equal(result.sent, 0);
  assert.equal(result.errors.length, 1);
});
