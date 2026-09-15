import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanEmailText,
  emailPreview,
  normalizeSubject,
  parseAddress,
  parsePtBrDate,
  splitQuotedEmail,
} from "../src/lib/emailThread.ts";

const respostaOutlook = [
  "Bom dia. Grato pelo contato, mas não temos interesse.",
  "",
  "",
  "Att.",
  "",
  "Depto. de compras",
  "",
  "usiprol@usiprol.com.br <mailto:usiprol@usiprol.com.br>",
  "",
  "",
  "",
  "De: Erick Sena <contato@mydrion.com.br>",
  "Enviada em: terça-feira, 15 de setembro de 2026 09:07",
  "Para: Usiprol Usinagem Industrial <usiprol@usiprol.com.br>",
  "Assunto: Uma pergunta sobre as indicações da Usiprol Usinagem Industrial",
  "",
  "",
  " <https://r.contato.mydrion.com.br/tr/op/mo19brJOcsT3f0in4ruBPrFXUvCxBvIo_dXGQbTSj7ej>",
  "",
  "Olá, Jairo.",
  "",
  "Erick Sena. Eu construo o endereço próprio de quem vive de indicação.",
].join("\r\n");

test("resposta em cima de e-mail do Outlook separa reply e citacao com cabecalhos", () => {
  const { reply, quoted } = splitQuotedEmail(respostaOutlook);

  assert.equal(reply, "Bom dia. Grato pelo contato, mas não temos interesse.\n\nAtt.\n\nDepto. de compras\n\nusiprol@usiprol.com.br");
  assert.ok(quoted);
  assert.equal(quoted.fromName, "Erick Sena");
  assert.equal(quoted.fromEmail, "contato@mydrion.com.br");
  assert.equal(quoted.to, "Usiprol Usinagem Industrial <usiprol@usiprol.com.br>");
  assert.equal(quoted.subject, "Uma pergunta sobre as indicações da Usiprol Usinagem Industrial");
  assert.equal(quoted.sentAtRaw, "terça-feira, 15 de setembro de 2026 09:07");
  assert.equal(new Date(quoted.sentAt ?? "").getDate(), 15);
  assert.equal(new Date(quoted.sentAt ?? "").getMonth(), 8);
  assert.equal(new Date(quoted.sentAt ?? "").getHours(), 9);
  assert.equal(quoted.body, "Olá, Jairo.\n\nErick Sena. Eu construo o endereço próprio de quem vive de indicação.");
  assert.ok(!quoted.body.includes("/tr/op/"), "o pixel de abertura do Brevo nao vaza no corpo");
});

test("separador -----Mensagem original----- tambem abre o bloco citado", () => {
  const { reply, quoted } = splitQuotedEmail([
    "Pode mandar mais detalhes.",
    "",
    "-----Mensagem original-----",
    "From: Erick Sena <contato@mydrion.com.br>",
    "Sent: Tuesday, September 15, 2026 9:07 AM",
    "Subject: Uma pergunta",
    "",
    "Olá.",
  ].join("\n"));

  assert.equal(reply, "Pode mandar mais detalhes.");
  assert.equal(quoted?.fromEmail, "contato@mydrion.com.br");
  assert.equal(quoted?.subject, "Uma pergunta");
  assert.equal(quoted?.body, "Olá.");
});

test("citacao estilo Gmail (Em ... escreveu:) com linhas > prefixadas", () => {
  const { reply, quoted } = splitQuotedEmail([
    "Obrigado, vou avaliar.",
    "",
    "Em ter., 15 de set. de 2026 às 09:07, Erick Sena <contato@mydrion.com.br> escreveu:",
    "> Olá, Jairo.",
    ">",
    "> Erick Sena aqui.",
  ].join("\n"));

  assert.equal(reply, "Obrigado, vou avaliar.");
  assert.equal(quoted?.fromName, "Erick Sena");
  assert.equal(quoted?.fromEmail, "contato@mydrion.com.br");
  assert.equal(quoted?.sentAtRaw, "ter., 15 de set. de 2026 às 09:07");
  assert.equal(new Date(quoted?.sentAt ?? "").getMonth(), 8);
  assert.equal(quoted?.body, "Olá, Jairo.\n\nErick Sena aqui.");
});

test("so linhas > no rodape viram citacao sem cabecalho", () => {
  const { reply, quoted } = splitQuotedEmail("Fechado.\n\n> texto antigo\n> segunda linha");
  assert.equal(reply, "Fechado.");
  assert.equal(quoted?.fromEmail, null);
  assert.equal(quoted?.body, "texto antigo\nsegunda linha");
});

test("e-mail sem citacao volta inteiro como reply", () => {
  const { reply, quoted } = splitQuotedEmail("Bom dia.\n\nDe onde vocês são?\n\nAbraço");
  assert.equal(quoted, null);
  assert.equal(reply, "Bom dia.\n\nDe onde vocês são?\n\nAbraço");
});

test("um De: solto no texto nao e confundido com cabecalho", () => {
  const { quoted } = splitQuotedEmail("De: quem é essa proposta?\n\nNão entendi bem o assunto.");
  assert.equal(quoted, null);
});

test("helpers: endereco, data pt-BR, assunto normalizado, limpeza e previa", () => {
  assert.deepEqual(parseAddress("Erick Sena <contato@mydrion.com.br>"), { name: "Erick Sena", email: "contato@mydrion.com.br" });
  assert.deepEqual(parseAddress("usiprol@usiprol.com.br <mailto:usiprol@usiprol.com.br>"), { name: null, email: "usiprol@usiprol.com.br" });
  assert.deepEqual(parseAddress(""), { name: null, email: null });

  assert.equal(new Date(parsePtBrDate("15/09/2026 14:30") ?? "").getHours(), 14);
  assert.equal(parsePtBrDate("sem data nenhuma"), null);

  assert.equal(normalizeSubject("RES: RE: Uma pergunta sobre as indicações"), "uma pergunta sobre as indicacoes");
  assert.equal(normalizeSubject("Uma pergunta sobre as indicações"), "uma pergunta sobre as indicacoes");

  assert.equal(cleanEmailText("a\r\n\r\n\r\n\r\nb <mailto:b@x.com>"), "a\n\nb");
  assert.equal(emailPreview("linha um\n\nlinha dois", 12), "linha um li…");
});
