import assert from "node:assert/strict";
import test from "node:test";

import { auditarCopy, casesCitados, resumoGate } from "../src/lib/copyGate.mjs";

test("P5: bloqueios literais reprovam a mensagem", () => {
  const casos = [
    "Isso acontece aí hoje? Faz sentido pra vocês?",
    "Separei um exemplo do pedido de orçamento. Quer ver?",
    "Posso te mostrar como o pedido chega?",
    "O orçamento sai na primeira resposta. Se quiser ver como ficou, te mando o link.",
    "A Ficha de Escopo organiza o pedido.",
  ];
  for (const texto of casos) {
    assert.equal(auditarCopy(texto, { degrau: "M2" }).aprovado, false, texto);
  }
});

test("P5: elogio generico, presenca digital solta e dois cases reprovam", () => {
  assert.equal(auditarCopy("Vi que vocês têm uma operação de verdade aí. O pedido chega definido?").aprovado, false);
  assert.equal(auditarCopy("Erick aqui, eu trabalho com presença digital de indústria. Bom trabalho.").aprovado, false);

  const doisCases = auditarCopy("Fiz a página da Jotta Manutenções e da Metalthec. O pedido chega com medida e prazo.", { degrau: "M2" });
  assert.equal(doisCases.aprovado, false);
  assert.deepEqual(casesCitados("Fiz a página da Jotta e da Metalthec"), ["metalthec", "jotta"]);
});

test("P5: presenca digital com mecanismo ou consequencia passa", () => {
  const msg1 = auditarCopy(
    "Oi, tudo bem? Erick aqui, eu trabalho com presença digital de indústria. Quem recebe indicação costuma pesquisar antes de chamar, e uma parte não chega. Isso acontece aí hoje?",
    { degrau: "msg1" },
  );
  assert.equal(msg1.aprovado, true, msg1.violacoes.join(" | "));
});

test("P5: emoji e show so reprovam com empresa Tier A", () => {
  const texto = "Show! O pedido chega com serviço, medida e prazo 🙂";
  assert.equal(auditarCopy(texto, { tier: "governante", degrau: "msg2Ponte" }).aprovado, false);
  assert.equal(auditarCopy(texto, { tier: "estruturado", degrau: "msg2Ponte" }).aprovado, true);
});

test("P6: pedido de desculpa e licenca reprovam o criterio do Governante", () => {
  const resultado = auditarCopy("Foi mal, cheguei no lugar errado. Obrigado por avisar e desculpa o incômodo.", { degrau: "naoForaIcp" });
  assert.equal(resultado.aprovado, false);
  assert.equal(resultado.criterios.find((c) => c.id === "governante")?.status, "falha");
});

test("P6: Mago nao fala preco; msg 2 do Governante pode", () => {
  const comPreco = "Isso mesmo. O orçamento sai sem a ida e volta. R$ 1000 a página, mais R$ 150/mês.";
  assert.equal(auditarCopy(comPreco, { degrau: "msg2Ponte" }).criterios.find((c) => c.id === "mago")?.status, "falha");
  assert.equal(auditarCopy(comPreco, { degrau: "msg2" }).criterios.find((c) => c.id === "mago")?.status, "ok");
  assert.equal(auditarCopy("{{setupPrice}} a página", { degrau: "M2" }).aprovado, false);
});

test("P6: termo morto, call e travessao reprovam o dono falando com dono", () => {
  for (const texto of [
    "O pedido chega definido. Podemos agendar uma call rápida?",
    "O pedido chega definido — sem ida e volta.",
    "R$ 150/mês de manutenção da página do pedido.",
    "Faço landing page para o pedido de orçamento.",
  ]) {
    assert.equal(auditarCopy(texto, { degrau: "msg2" }).aprovado, false, texto);
  }
});

test("P6: palavra a evitar vem do brandbook", () => {
  const resultado = auditarCopy("Um método revolucionario para o pedido de orçamento.", { degrau: "msg2" });
  assert.equal(resultado.aprovado, false);
  assert.match(resultado.violacoes.join(" "), /revolucionario/);
});

test("P6: criterio que regex nao decide fica manual, nunca aprovado por padrao", () => {
  const resultado = auditarCopy("Oi! Tudo certo por aí?", { degrau: "M3" });
  assert.equal(resultado.aprovado, true);
  assert.deepEqual(resultado.pendenteManual, ["cercadinho", "operacao"]);
  assert.match(resumoGate(resultado), /^MANUAL/);
});
