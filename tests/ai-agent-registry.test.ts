import assert from "node:assert/strict";
import test from "node:test";
import { AI_AGENT_PUBLIC_REGISTRY, agentByAlias } from "../src/lib/aiAgentRegistry.ts";
import { AI_AGENT_PERSONAS } from "../src/server/aiAgentPersonas.generated.mjs";

test("registro contem exatamente os sete especialistas obrigatorios", () => {
  assert.equal(AI_AGENT_PUBLIC_REGISTRY.length, 7);
  assert.deepEqual(AI_AGENT_PUBLIC_REGISTRY.map((agent) => agent.id), [
    "crm-copilot", "copy-chief", "willian-celso", "thiago-finch",
    "alex-hormozi", "webson-vendedor", "data-chief",
  ]);
  assert.equal(agentByAlias("@hormozi")?.id, "alex-hormozi");
  assert.equal(new Set(AI_AGENT_PUBLIC_REGISTRY.map((agent) => agent.alias)).size, 7);
});

test("snapshots server-side possuem versao e hash sem autoridade operacional", () => {
  assert.equal(AI_AGENT_PERSONAS.length, 7);
  for (const persona of AI_AGENT_PERSONAS) {
    assert.match(persona.sourceHash, /^[a-f0-9]{64}$/);
    assert.ok(persona.version);
    assert.ok(persona.identity);
    assert.ok(persona.frameworks.length > 0);
    const privateDna = JSON.stringify(persona);
    assert.doesNotMatch(privateDna, /bypassPermissions|git push|terminal|service.role|api[_ -]?key|commands:/i);
    assert.doesNotMatch(privateDna, /D:\\001Gravity|C:\\Users/i);
  }
});

test("clones sao identificados como IA baseada em metodologia", () => {
  for (const id of ["willian-celso", "thiago-finch", "alex-hormozi"]) {
    const agent = AI_AGENT_PUBLIC_REGISTRY.find((item) => item.id === id);
    assert.equal(agent?.type, "clone");
    assert.match(agent?.disclosure ?? "", /IA baseada na metodologia/i);
  }
});
