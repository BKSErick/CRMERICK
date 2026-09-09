import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTOMATION_NODE_CATALOG,
  createStarterEmailAutomationGraph,
  simulateEmailAutomationGraph,
  validateEmailAutomationGraph,
  type EmailAutomationGraph,
} from "../src/lib/emailAutomationGraph.ts";

function validGraph(): EmailAutomationGraph {
  return {
    nodes: [
      {
        id: "trigger-1",
        type: "automationNode",
        position: { x: 80, y: 160 },
        data: { kind: "trigger.email_received", label: "E-mail recebido", config: {} },
      },
      {
        id: "rule-1",
        type: "automationNode",
        position: { x: 380, y: 160 },
        data: { kind: "rule.has_email", label: "Possui e-mail", config: {} },
      },
      {
        id: "action-1",
        type: "automationNode",
        position: { x: 680, y: 160 },
        data: {
          kind: "action.email_draft",
          label: "Criar rascunho",
          config: { subject: "Retorno sobre {{deal.company}}", body: "Ola {{contact.name}}" },
        },
      },
    ],
    edges: [
      { id: "edge-1", source: "trigger-1", target: "rule-1" },
      { id: "edge-2", source: "rule-1", target: "action-1" },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

test("catalogo separa gatilhos, regras, acoes seguras e envio bloqueado", () => {
  assert.equal(AUTOMATION_NODE_CATALOG.filter((item) => item.category === "trigger").length, 4);
  assert.equal(AUTOMATION_NODE_CATALOG.filter((item) => item.category === "rule").length, 3);
  assert.equal(AUTOMATION_NODE_CATALOG.filter((item) => item.category === "action" && !item.locked).length, 5);
  const send = AUTOMATION_NODE_CATALOG.find((item) => item.kind === "action.email_send");
  assert.equal(send?.locked, true);
  assert.match(send?.description ?? "", /bloquead|nao envia/i);
});

test("starter cria somente um gatilho valido", () => {
  const starter = createStarterEmailAutomationGraph();
  assert.equal(starter.nodes.length, 1);
  assert.equal(starter.nodes[0].data.kind, "trigger.contact_manual");
  assert.deepEqual(validateEmailAutomationGraph(starter), { valid: true, issues: [] });
});

test("grafo valido exige um gatilho, integridade, alcance e ausencia de ciclos", () => {
  assert.deepEqual(validateEmailAutomationGraph(validGraph()), { valid: true, issues: [] });

  const twoTriggers = validGraph();
  twoTriggers.nodes.push({
    id: "trigger-2",
    type: "automationNode",
    position: { x: 80, y: 360 },
    data: { kind: "trigger.contact_created", label: "Contato criado", config: {} },
  });
  assert.ok(validateEmailAutomationGraph(twoTriggers).issues.some((issue) => issue.code === "trigger_count"));

  const orphan = validGraph();
  orphan.nodes.push({
    id: "action-orphan",
    type: "automationNode",
    position: { x: 680, y: 360 },
    data: { kind: "action.alert_create", label: "Criar alerta", config: { message: "Revisar" } },
  });
  assert.ok(validateEmailAutomationGraph(orphan).issues.some((issue) => issue.code === "unreachable_node"));

  const cycle = validGraph();
  cycle.edges.push({ id: "edge-cycle", source: "action-1", target: "rule-1" });
  assert.ok(validateEmailAutomationGraph(cycle).issues.some((issue) => issue.code === "cycle"));

  const missingTarget = validGraph();
  missingTarget.edges.push({ id: "edge-missing", source: "trigger-1", target: "missing" });
  assert.ok(validateEmailAutomationGraph(missingTarget).issues.some((issue) => issue.code === "invalid_edge"));
});

test("rejeita ids duplicados, configuracao incompleta e qualquer node de envio", () => {
  const duplicate = validGraph();
  duplicate.nodes[2].id = "rule-1";
  assert.ok(validateEmailAutomationGraph(duplicate).issues.some((issue) => issue.code === "duplicate_node_id"));

  const incomplete = validGraph();
  incomplete.nodes[2].data.config = { body: "Sem assunto" };
  assert.ok(validateEmailAutomationGraph(incomplete).issues.some((issue) => issue.code === "invalid_config"));

  const send = validGraph();
  send.nodes[2].data = { kind: "action.email_send", label: "Enviar e-mail", config: {} };
  assert.ok(validateEmailAutomationGraph(send).issues.some((issue) => issue.code === "locked_node"));
});

test("simulador e deterministico, resolve variaveis e nunca executa efeitos", () => {
  let effects = 0;
  const input = {
    contact: { name: "Ana", email: "ana@example.com" },
    deal: { company: "Acme", stage: "Proposta" },
    onEffect: () => { effects += 1; },
  };
  const first = simulateEmailAutomationGraph(validGraph(), input);
  const repeated = simulateEmailAutomationGraph(validGraph(), input);
  assert.deepEqual(first, repeated);
  assert.equal(first.status, "passed");
  assert.deepEqual(first.trace.map((item) => item.nodeId), ["trigger-1", "rule-1", "action-1"]);
  assert.match(first.trace[2].message, /Retorno sobre Acme/);
  assert.equal(effects, 0);
});

test("regra falsa interrompe os descendentes sem executar acoes", () => {
  const result = simulateEmailAutomationGraph(validGraph(), {
    contact: { name: "Sem Email", email: "" },
    deal: { company: "Acme", stage: "Proposta" },
  });
  assert.equal(result.status, "passed");
  assert.deepEqual(result.trace.map((item) => [item.nodeId, item.status]), [
    ["trigger-1", "simulated"],
    ["rule-1", "condition_not_met"],
    ["action-1", "skipped"],
  ]);
});

