import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildEmailFunnel,
  classifyButton,
  filterRecipients,
  normalizeEvent,
  parseRecipientFromDescription,
  type BrevoEvent,
  type EmailSendRecord,
} from "../src/lib/emailFunnel.ts";
import { paginate } from "../src/lib/tablePaging.ts";

const envio = (email: string, sentAt = "2026-09-09T11:50:00.000Z"): EmailSendRecord => ({
  email,
  company: email.split("@")[0],
  dealId: 1,
  sentAt,
});

const evento = (email: string, event: string, link?: string): BrevoEvent => ({ email, event, link: link ?? null });

test("o e-mail do destinatario sai da descricao da activity", () => {
  assert.equal(
    parseRecipientFromDescription("E-mail enviado para Alguem@Empresa.com.br: Uma pergunta"),
    "alguem@empresa.com.br",
  );
  assert.equal(parseRecipientFromDescription("texto sem endereco"), null);
});

test("nomes de evento do Brevo normalizam entre plural e camelCase", () => {
  // A API devolve `hardBounces` em um endpoint e `hard_bounce` em outro; sem
  // normalizar, metade dos bounces passaria despercebida.
  assert.equal(normalizeEvent("hardBounces"), "hard_bounce");
  assert.equal(normalizeEvent("hard_bounce"), "hard_bounce");
  assert.equal(normalizeEvent("uniqueOpened"), "opened");
  assert.equal(normalizeEvent("clicks"), "click");
  assert.equal(normalizeEvent("loadedByProxy"), "proxy");
  assert.equal(normalizeEvent("coisa-inventada"), "");
});

test("clique identifica qual botao foi tocado", () => {
  assert.equal(classifyButton("https://wa.me/5531991072407?text=oi"), "whatsapp");
  assert.equal(classifyButton("https://mydrion.com.br?utm_source=email"), "site");
  assert.equal(classifyButton("https://x.com/unsubscribe/abc"), "descadastro");
  assert.equal(classifyButton(null), "outro");
});

test("problema de entrega vence engajamento na classificacao", () => {
  // Endereco que quicou E abriu conta como bounce: o que decide a reputacao do
  // dominio e o bounce, nao a abertura.
  const report = buildEmailFunnel(
    [envio("morto@x.com.br")],
    [evento("morto@x.com.br", "opened"), evento("morto@x.com.br", "hardBounces")],
  );

  assert.equal(report.recipients[0].status, "Hard bounce");
  assert.equal(report.counts.hardBounce, 1);
});

test("funil conta entrega, abertura, clique e resposta sem duplicar destinatario", () => {
  const sends = [envio("a@x.com.br"), envio("b@x.com.br"), envio("c@x.com.br")];
  const events = [
    evento("a@x.com.br", "delivered"),
    // duas aberturas do mesmo endereco nao viram duas pessoas
    evento("a@x.com.br", "opened"),
    evento("a@x.com.br", "opened"),
    evento("a@x.com.br", "click", "https://wa.me/5531991072407"),
    evento("b@x.com.br", "delivered"),
    evento("c@x.com.br", "delivered"),
    evento("c@x.com.br", "loadedByProxy"),
  ];

  const report = buildEmailFunnel(sends, events, ["a@x.com.br"]);

  assert.equal(report.counts.sent, 3);
  assert.equal(report.counts.delivered, 3);
  assert.equal(report.counts.opened, 2, "proxy conta como abertura estimada");
  assert.equal(report.counts.openedByProxy, 1);
  assert.equal(report.counts.clicked, 1);
  assert.equal(report.counts.replied, 1);
  assert.equal(report.counts.notOpened, 1);
  assert.equal(Math.round(report.rates.delivery), 100);
  assert.equal(report.buttons.find((b) => b.kind === "whatsapp")?.clicks, 1);
  assert.equal(report.buttons.find((b) => b.kind === "site")?.clicks, 0);
});

test("Pareto ordena perdas da maior para a menor e fecha o acumulado em 100%", () => {
  const sends = ["a", "b", "c", "d", "e"].map((n) => envio(`${n}@x.com.br`));
  const events = [
    // 3 entregues sem abrir, 1 aberto sem clicar, 1 hard bounce
    evento("a@x.com.br", "delivered"),
    evento("b@x.com.br", "delivered"),
    evento("c@x.com.br", "delivered"),
    evento("d@x.com.br", "delivered"),
    evento("d@x.com.br", "opened"),
    evento("e@x.com.br", "hardBounces"),
  ];

  const { pareto } = buildEmailFunnel(sends, events);

  assert.equal(pareto[0].label, "Nao abriu");
  assert.equal(pareto[0].value, 3);
  for (let i = 1; i < pareto.length; i += 1) {
    assert.ok(pareto[i].value <= pareto[i - 1].value, "fatias devem descer");
    assert.ok(pareto[i].cumulative >= pareto[i - 1].cumulative, "acumulado nunca desce");
  }
  assert.equal(Math.round(pareto[pareto.length - 1].cumulative), 100);
});

test("saude do dominio acusa hard bounce acima de 2%", () => {
  const limpo = buildEmailFunnel([envio("a@x.com.br")], [evento("a@x.com.br", "delivered")]);
  assert.equal(limpo.health.level, "ok");

  // 1 hard bounce em 5 = 20%, dez vezes o limite seguro do setor.
  const sends = ["a", "b", "c", "d", "e"].map((n) => envio(`${n}@x.com.br`));
  const sujo = buildEmailFunnel(sends, [evento("a@x.com.br", "hardBounces")]);
  assert.equal(sujo.health.level, "critico");
  assert.match(sujo.health.message, /2%/);

  const spam = buildEmailFunnel(sends, [evento("a@x.com.br", "spam")]);
  assert.equal(spam.health.level, "critico");
  assert.match(spam.health.message, /spam/i);
});

test("serie diaria agrupa por dia de envio em ordem cronologica", () => {
  const report = buildEmailFunnel(
    [
      envio("a@x.com.br", "2026-09-09T11:50:00.000Z"),
      envio("b@x.com.br", "2026-09-08T19:11:00.000Z"),
      envio("c@x.com.br", "2026-09-08T19:12:00.000Z"),
    ],
    [evento("b@x.com.br", "delivered")],
  );

  assert.deepEqual(report.daily.map((d) => d.day), ["2026-09-08", "2026-09-09"]);
  assert.equal(report.daily[0].sent, 2);
  assert.equal(report.daily[0].delivered, 1);
  assert.equal(report.daily[1].sent, 1);
});

test("funil vazio nao quebra nem divide por zero", () => {
  const report = buildEmailFunnel([], []);
  assert.equal(report.counts.sent, 0);
  assert.equal(report.rates.delivery, 0);
  assert.equal(report.rates.clickToOpen, 0);
  assert.deepEqual(report.pareto, []);
  assert.equal(report.health.level, "ok");
});

test("busca da tabela procura em empresa, e-mail, status e botao", () => {
  const sends = [envio("compras@indametal.com.br"), envio("sergio@proelt.com.br"), envio("morto@yahoo.com.br")];
  sends[0].company = "INDAMETAL METALURGICA";
  sends[1].company = "Proelt Engenharia";
  sends[2].company = "Vanmar Usinagem";

  const { recipients } = buildEmailFunnel(sends, [
    evento("compras@indametal.com.br", "delivered"),
    evento("sergio@proelt.com.br", "delivered"),
    evento("sergio@proelt.com.br", "click", "https://wa.me/5531991072407"),
    evento("morto@yahoo.com.br", "hardBounces"),
  ]);

  assert.equal(filterRecipients(recipients, { search: "indametal" }).length, 1, "acha pela empresa");
  assert.equal(filterRecipients(recipients, { search: "proelt.com.br" }).length, 1, "acha pelo e-mail");
  assert.equal(filterRecipients(recipients, { search: "hard bounce" }).length, 1, "acha pelo status");
  assert.equal(filterRecipients(recipients, { search: "whatsapp" }).length, 1, "acha pelo botao clicado");
  assert.equal(filterRecipients(recipients, { search: "  INDAMETAL  " }).length, 1, "ignora caixa e espaco");
  assert.equal(filterRecipients(recipients, { search: "nao existe" }).length, 0);
  assert.equal(filterRecipients(recipients).length, 3, "sem termo devolve tudo");
});

test("filtro de problemas inclui quem nao abriu, nao so quem quicou", () => {
  const sends = [envio("a@x.com.br"), envio("b@x.com.br"), envio("c@x.com.br")];
  const { recipients } = buildEmailFunnel(sends, [
    evento("a@x.com.br", "delivered"),
    evento("a@x.com.br", "opened"),
    evento("b@x.com.br", "delivered"),
    evento("c@x.com.br", "hardBounces"),
  ]);

  const problemas = filterRecipients(recipients, { onlyProblems: true });
  assert.deepEqual(problemas.map((r) => r.email).sort(), ["b@x.com.br", "c@x.com.br"]);
});

test("paginacao corrige pagina fora do intervalo em vez de mostrar vazio", () => {
  const linhas = Array.from({ length: 29 }, (_, i) => i);

  const primeira = paginate(linhas, 1, 12);
  assert.deepEqual(primeira.items, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(primeira.totalPages, 3);
  assert.equal(primeira.from, 0);
  assert.equal(primeira.to, 12);

  const ultima = paginate(linhas, 3, 12);
  assert.equal(ultima.items.length, 5, "ultima pagina traz o resto");
  assert.equal(ultima.to, 29);

  // Filtrar encurta a lista: quem estava na pagina 3 nao pode cair num vazio.
  const encolheu = paginate(linhas.slice(0, 5), 3, 12);
  assert.equal(encolheu.page, 1);
  assert.equal(encolheu.items.length, 5);

  const vazio = paginate([], 1, 12);
  assert.equal(vazio.totalPages, 1, "lista vazia ainda tem uma pagina");
  assert.equal(vazio.total, 0);
  assert.deepEqual(vazio.items, []);

  assert.equal(paginate(linhas, 0, 12).page, 1, "pagina zero vira 1");
  assert.equal(paginate(linhas, -5, 12).page, 1, "pagina negativa vira 1");
});

test("a legenda explica hard e soft bounce na tela", () => {
  // Os dois exigem acao oposta (um mata o endereco, o outro so pede descanso),
  // entao a diferenca precisa estar visivel, nao so na cabeca de quem construiu.
  const painel = readFileSync("src/components/EmailFunnelPanel.tsx", "utf8");
  assert.match(painel, /termo: "Hard bounce"/);
  assert.match(painel, /termo: "Soft bounce"/);
  assert.match(painel, /NAO existe/, "hard bounce precisa dizer que o endereco nao existe");
  assert.match(painel, /TEMPORARIA/, "soft bounce precisa dizer que a falha e temporaria");
});

test("a rota le envios das activities, nao do arquivo local do script", () => {
  // sent_log.json e um arquivo da maquina que dispara: no deploy ele nao existe.
  const route = readFileSync("src/app/api/email-events/route.ts", "utf8");
  assert.match(route, /\.eq\("type", "email_sent"\)/);
  assert.doesNotMatch(route, /sent_log\.json['"]/);
  // A API do Brevo recusa endDate no futuro.
  assert.match(route, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});
