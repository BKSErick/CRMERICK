import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { resetCatalogCache } from "../src/lib/aiModelCatalog.mjs";
import { buildDecisionPrompt, decide, evidenciaVemDoLead, extrairJson, parseDecision } from "../src/lib/typedDecision.mjs";

const PERGUNTAS = {
  intencao: { type: "choice", instructions: "O que o lead quer?", criteria: { preco: "pediu valor", exemplo: "pediu exemplo", outro: "outra coisa" } },
  temperatura: { type: "score", instructions: "Quao quente?", criteria: ["frio", "morno", "quente"] },
  decisor: { type: "boolean", instructions: "Quem responde decide?" },
} as const;

async function comModelo(conteudo: string, fn: (chamadas: Array<Record<string, unknown>>) => Promise<void>) {
  const fetchOriginal = globalThis.fetch;
  const groqOriginal = process.env.GROQ_API_KEY;
  const openRouterOriginal = process.env.OPENROUTER_API_KEY;
  process.env.GROQ_API_KEY = "groq-test";
  delete process.env.OPENROUTER_API_KEY;
  const chamadas: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/models")) {
      return new Response(JSON.stringify({ data: [{ id: "groq/modelo", active: true, context_window: 131072 }] }), { status: 200 });
    }
    chamadas.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify({ choices: [{ message: { content: conteudo } }] }), { status: 200 });
  }) as typeof globalThis.fetch;
  try {
    await fn(chamadas);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (groqOriginal === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = groqOriginal;
    if (openRouterOriginal !== undefined) process.env.OPENROUTER_API_KEY = openRouterOriginal;
  }
}

beforeEach(() => resetCatalogCache());

test("parseDecision aceita so valores das listas e marca o resto como invalido", () => {
  const { answers, invalid } = parseDecision({ intencao: "preco", temperatura: 2, decisor: "sim" }, PERGUNTAS);
  assert.deepEqual(answers.intencao, { type: "choice", choice: "preco" });
  assert.deepEqual(answers.temperatura, { type: "score", level: 2, label: "quente" });
  assert.deepEqual(answers.decisor, { type: "boolean", value: true });
  assert.deepEqual(invalid, []);

  const ruim = parseDecision({ intencao: "reuniao", temperatura: 7, decisor: "talvez" }, PERGUNTAS);
  assert.deepEqual(ruim.answers, { intencao: null, temperatura: null, decisor: null });
  assert.deepEqual(ruim.invalid, ["intencao", "temperatura", "decisor"]);
});

test("pergunta mal definida e recusada antes de chamar modelo", () => {
  assert.throws(() => buildDecisionPrompt({ x: { type: "choice", instructions: "?", criteria: { so: "uma" } } }), /duas opcoes/);
  assert.throws(() => buildDecisionPrompt({ "x y": { type: "boolean", instructions: "?" } }), /Chave/);
  assert.throws(() => buildDecisionPrompt({}), /sem perguntas/);
});

test("prompt lista as opcoes exatas e trata o estado como dado nao confiavel", () => {
  const prompt = buildDecisionPrompt(PERGUNTAS);
  assert.match(prompt, /"preco", "exemplo", "outro"/);
  assert.match(prompt, /inteiro de 0 a 2/);
  assert.match(prompt, /nao confiavel/);
});

test("extrairJson tolera cerca de codigo e prosa em volta", () => {
  assert.deepEqual(extrairJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extrairJson('Claro! {"a":2} espero ter ajudado'), { a: 2 });
  assert.throws(() => extrairJson("sem json nenhum"), /JSON/);
});

test("evidencia so vale se sair das falas permitidas", () => {
  const falas = ["Quanto custa uma pagina dessas pra minha usinagem?"];
  assert.equal(evidenciaVemDoLead("quanto custa uma pagina dessas", falas), true);
  assert.equal(evidenciaVemDoLead("Faz sentido pro momento de voces?", falas), false);
  assert.equal(evidenciaVemDoLead("", falas), true);
});

test("decide chama a cascata com temperatura zero e JSON, e devolve respostas tipadas", async () => {
  await comModelo('{"intencao":"exemplo","temperatura":1,"decisor":false}', async (chamadas) => {
    const resultado = await decide({ state: { mensagem: "manda um exemplo" }, questions: PERGUNTAS });
    assert.equal(resultado.ok, true);
    if (!resultado.ok) return;
    assert.deepEqual(resultado.answers.intencao, { type: "choice", choice: "exemplo" });
    assert.equal(resultado.decidedBy, "llm");
    assert.equal(chamadas[0].temperature, 0);
    assert.deepEqual(chamadas[0].response_format, { type: "json_object" });
  });
});

test("decide devolve falha tipada para JSON quebrado", async () => {
  await comModelo("nao sei responder", async () => {
    const resultado = await decide({ state: "x", questions: PERGUNTAS });
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.equal(resultado.reason, "invalid_json");
  });
});

test("decide descarta a decisao inteira quando a evidencia e fala do Erick", async () => {
  await comModelo('{"intencao":"preco","temperatura":2,"decisor":true,"evidencia":"Faz sentido pro momento de voces?"}', async () => {
    const resultado = await decide({
      state: "Erick: Faz sentido pro momento de voces?\nLead: manda o valor",
      questions: PERGUNTAS,
      evidence: { from: ["manda o valor"] },
    });
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.equal(resultado.reason, "evidence_mismatch");
  });
});
