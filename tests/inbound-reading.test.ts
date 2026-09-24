import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { cardCriteria, readInboundByRules, readInboundMessage, renderReadingLine } from "../src/lib/inboundReading.mjs";
import type { DecideInput, DecideResult } from "../src/lib/typedDecision.mjs";

const PLAYBOOK = JSON.parse(readFileSync(new URL("../content/sales-playbook.json", import.meta.url), "utf8"));

function decisao(answers: Record<string, unknown>, evidencia = ""): (input: DecideInput) => Promise<DecideResult> {
  return async () => ({ ok: true, answers: answers as never, invalid: [], evidencia, provider: "Groq", model: "teste", decidedBy: "llm", attempts: [] });
}

const naoChamar = async (): Promise<DecideResult> => {
  throw new Error("regra deveria ter decidido sem modelo");
};

test("cartas saem do playbook, sem a nota interna, com as tres da msg 2", () => {
  const cards = cardCriteria(PLAYBOOK);
  for (const key of Object.keys(PLAYBOOK.postResponse.cartas).filter((key: string) => !key.startsWith("_"))) {
    assert.ok(cards[key], `carta ${key} deveria estar na lista`);
  }
  assert.equal("_nota" in cards, false);
  assert.ok(cards.msg2 && cards.msg2Ponte && cards.msg2Preco);
  assert.ok(cards.nenhuma);
});

test("playbook mudou, lista mudou: carta nova entra sem mexer em codigo", () => {
  const alterado = structuredClone(PLAYBOOK);
  alterado.postResponse.cartas.naoAgoraSoAno = { quando: "Lead disse que so ano que vem", texto: "..." };
  assert.ok(cardCriteria(alterado).naoAgoraSoAno);
});

test("bot e encaminhamento decidem por regra, sem carta de venda", async () => {
  const bot = await readInboundMessage({ company: "X", history: [{ direction: "received", content: "Obrigado pelo contato, responderemos em breve" }], responseType: "bot", playbook: PLAYBOOK, decideFn: naoChamar });
  assert.deepEqual(bot, { ok: true, intent: "automatica", objection: "nenhuma", card: "nenhuma", evidence: "", decidedBy: "regra" });
  const enc = readInboundByRules({ text: "fala com meu superior", responseType: "encaminhamento", playbook: PLAYBOOK });
  assert.equal(enc?.intent, "encaminhamento");
  assert.equal(enc?.card, "nenhuma");
});

test("sinal forte do playbook vai direto pra msg 2, sem modelo", async () => {
  const leitura = await readInboundMessage({
    company: "Usinagem Exemplo",
    history: [
      { direction: "sent", content: "Oi, tudo bem? Erick aqui." },
      { direction: "received", content: "Acontece sim, quanto custa?" },
    ],
    responseType: "humana",
    playbook: PLAYBOOK,
    decideFn: naoChamar,
  });
  assert.equal(leitura.ok, true);
  if (!leitura.ok) return;
  assert.equal(leitura.intent, "sinal_forte");
  assert.equal(leitura.card, "msg2");
  assert.equal(leitura.decidedBy, "regra");
});

test("sim fraco so vale em resposta curta", () => {
  assert.equal(readInboundByRules({ text: "Diferente!", responseType: "humana", playbook: PLAYBOOK })?.card, "msg2Ponte");
  assert.equal(readInboundByRules({ text: "ok", responseType: "humana", playbook: PLAYBOOK })?.intent, "sinal_fraco");
  assert.equal(
    readInboundByRules({ text: "sim, mas agora estamos focados em outra coisa e nao da pra olhar isso", responseType: "humana", playbook: PLAYBOOK }),
    null,
  );
});

test("fora da regra, a decisao tipada escolhe intencao, objecao e carta", async () => {
  let recebido: DecideInput | null = null;
  const leitura = await readInboundMessage({
    company: "Caldeiraria Y",
    history: [
      { direction: "sent", content: "Oi, Erick aqui." },
      { direction: "received", content: "A gente ja tem um rapaz que cuida do nosso site" },
    ],
    responseType: "humana",
    playbook: PLAYBOOK,
    decideFn: async (input) => {
      recebido = input;
      return decisao({
        intent: { type: "choice", choice: "objecao" },
        objection: { type: "choice", choice: "ja_tem_fornecedor" },
        card: { type: "choice", choice: "naoJaTem" },
      }, "ja tem um rapaz que cuida do nosso site")(input);
    },
  });
  assert.equal(leitura.ok, true);
  if (!leitura.ok) return;
  assert.equal(leitura.card, "naoJaTem");
  assert.equal(leitura.objection, "ja_tem_fornecedor");
  assert.equal(leitura.decidedBy, "llm");
  assert.ok(recebido);
  const input = recebido as unknown as DecideInput;
  assert.deepEqual(input.evidence?.from, ["A gente ja tem um rapaz que cuida do nosso site"], "evidencia so pode sair da fala do lead");
  assert.ok("naoJaTem" in (input.questions.card as { criteria: Record<string, string> }).criteria);
});

test("intencao fora da lista vira falha registravel, nao leitura inventada", async () => {
  const leitura = await readInboundMessage({
    company: "Z",
    history: [{ direction: "received", content: "hmm deixa eu ver com o pessoal aqui depois" }],
    responseType: "humana",
    playbook: PLAYBOOK,
    decideFn: async () => ({ ok: true, answers: { intent: null, objection: null, card: null }, invalid: ["intent", "objection", "card"], evidencia: "", provider: "Groq", model: "t", decidedBy: "llm", attempts: [] }),
  });
  assert.equal(leitura.ok, false);
});

test("modelo sugerindo carta pra bot e corrigido para nenhuma", async () => {
  const leitura = await readInboundMessage({
    company: "Z",
    history: [{ direction: "received", content: "Seja bem vindo a empresa Z, escolha uma opcao" }],
    responseType: "humana",
    playbook: PLAYBOOK,
    decideFn: decisao({
      intent: { type: "choice", choice: "automatica" },
      objection: { type: "choice", choice: "nenhuma" },
      card: { type: "choice", choice: "msg2" },
    }),
  });
  assert.equal(leitura.ok && leitura.card, "nenhuma");
});

test("fora do funil frio a carta e sempre na mao (cliente pediu ligacao, 24/09/2026)", async () => {
  assert.equal(readInboundByRules({ text: "quanto custa?", responseType: "humana", stage: "won", playbook: PLAYBOOK })?.card, "nenhuma");
  assert.equal(readInboundByRules({ text: "quanto custa?", responseType: "humana", stage: "abordado", playbook: PLAYBOOK })?.card, "msg2");
  const leitura = await readInboundMessage({
    company: "Cliente Z",
    stage: "negotiation",
    history: [{ direction: "received", content: "Favor me ligar pra conversarmos sobre." }],
    responseType: "humana",
    playbook: PLAYBOOK,
    decideFn: decisao({
      intent: { type: "choice", choice: "sinal_forte" },
      objection: { type: "choice", choice: "nenhuma" },
      card: { type: "choice", choice: "msg2" },
    }),
  });
  assert.equal(leitura.ok && leitura.intent, "sinal_forte", "a intencao continua valendo");
  assert.equal(leitura.ok && leitura.card, "nenhuma");
});

test("recepcao desviando pro setor de compras com e-mail e encaminhamento por regra (Steel, 24/09/2026)", () => {
  const texto = "Olá como vai?\nPara apresentações ou assuntos relacionados ao setor de compras: Márcio comercialsteelusinagem@gmail.com";
  assert.equal(readInboundByRules({ text: texto, responseType: "humana", playbook: PLAYBOOK })?.intent, "encaminhamento");
  assert.equal(readInboundByRules({ text: "me manda no email joao@x.com quanto custa", responseType: "humana", playbook: PLAYBOOK })?.intent, "sinal_forte", "e-mail sem desvio de setor nao e encaminhamento");
});

test("link sozinho nao e sinal de interesse", () => {
  const leitura = readInboundByRules({ text: "https://drive.google.com/drive/folders/abc", responseType: "humana", playbook: PLAYBOOK });
  assert.deepEqual(leitura, { intent: "outro", objection: "nenhuma", card: "nenhuma", evidence: "", decidedBy: "regra" });
  assert.equal(readInboundByRules({ text: "olha esse https://x.com/y quanto custa algo assim?", responseType: "humana", playbook: PLAYBOOK })?.intent, "sinal_forte");
});

test("leitura reserva metade do prazo para o Groq", async () => {
  let recebido: DecideInput | null = null;
  await readInboundMessage({
    company: "Z",
    history: [{ direction: "received", content: "deixa eu ver com o pessoal aqui e te falo" }],
    responseType: "humana",
    playbook: PLAYBOOK,
    timeoutMs: 20000,
    decideFn: async (input) => {
      recebido = input;
      return { ok: false, reason: "unavailable", detail: "x", failures: [], attempts: [] };
    },
  });
  const input = recebido as unknown as DecideInput;
  assert.equal(input.perProviderTimeoutMs, 10000);
  assert.equal(input.providerPolicy, "free-then-groq");
});

test("linha em portugues para o historico do deal", () => {
  assert.equal(
    renderReadingLine({ intent: "objecao", objection: "ja_tem_fornecedor", card: "naoJaTem", evidence: "ja tem um rapaz" }),
    'Leitura: objecao · objecao: ja tem fornecedor · carta: Ja tem quem faca\nTrecho do lead: "ja tem um rapaz"',
  );
});
