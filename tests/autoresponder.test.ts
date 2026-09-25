import assert from "node:assert/strict";
import test from "node:test";

import { ehRespostaAutomatica } from "../src/lib/autoresponder.mjs";
import { classifyInboundResponse } from "../src/lib/followup.ts";

// Mensagens reais da triagem das 52 "respostas paradas" de 24/09/2026 (Story 067).
const AUTOMATICAS = [
  "Olá, somos da *Power Test!* Para solicitar uma cotação relacionada a calibração ou ensaios, envie os dados",
  "Olá, Você está sendo atendido(a) por Isabelle ou Adriane. Agradecemos pelo seu contato.",
  "Metropolitana assistência técnica especialista em manutenção e consertos.Me chamo Dora! Vou dar continuidade no seu atendimento.",
  "Olá, agradeço o seu contato. Já irei lhe retornar.",
  "Vejo que vc não está mais por aqui e por isso vou encerrar o atendimento. Se precisar de mim é só dar um \"Oi\"",
  "Olá, tudo bem ? Nossa equipe responderá sua mensagem o mais breve possível.",
  "Você já será atendido. Aguarde!",
  "Já conectei você à nossa equipe. Alguém vai analisar sua mensagem em breve.",
  "Já conectei você com a nossa equipe. Alguém deve te responder em breve.",
  "Olá! Aqui é a Laís, gerente comercial da Maqtec Equipamentos. Enquanto isso, fique à vontade para conhecer melhor nossas máquinas",
  "Olá como vai? Para apresentações ou assuntos relacionados ao setor de compras: Márcio",
  "A Arte Manutenção agradece seu contato. Como podemos te ajudar?",
  "Escolha o número da opção desejada: Digite 1 para Comercial",
  "Opa, tudo bem? Entraremos em contato em breve.",
];

const HUMANAS = [
  "*Marco Antônio*: Olá!! Bom dia!! Agradecemos pelo seu contato!! No momento não temos interesse!!",
  "Olá Boa tarde Erick, obrigada pelo contato, mas ja temos uma empresa que cuida para nós",
  "*Nelma, disse:* Bom dia , tudo bem ? Vi que você está interessado em algum dos nossos produtos. você é de qual cidade",
  "Boa tarde Erick! Em que posso te ajudar?",
  "Interessante! Pode me enviar, sim",
  "Ah sim, perfeito! muito obrigada pelas informações, irei repassar para o setor responsável",
  "Sou eu mesmo que olho",
];

test("Story 067: saudacao automatica real e reconhecida pela lista unica", () => {
  for (const texto of AUTOMATICAS) {
    assert.equal(ehRespostaAutomatica(texto), true, texto);
    assert.equal(classifyInboundResponse(texto), "bot", `webhook: ${texto}`);
  }
});

test("Story 067: recusa e conversa de gente nunca viram bot", () => {
  for (const texto of HUMANAS) {
    assert.equal(ehRespostaAutomatica(texto), false, texto);
    assert.notEqual(classifyInboundResponse(texto), "bot", `webhook: ${texto}`);
  }
  assert.equal(ehRespostaAutomatica(""), false);
  assert.equal(ehRespostaAutomatica(null), false);
});
