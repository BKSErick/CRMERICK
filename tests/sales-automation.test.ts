import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import salesPlaybookModule from "../src/lib/salesPlaybook.mjs";
import { buildRunPlan } from "../scripts/prospeccao-runner.mjs";
import { mensagemDecisorIndicado } from "../src/lib/followup.ts";

// regenerate-copies.js e CommonJS (usa `return` de topo e module.exports), entao entra por
// createRequire, do mesmo jeito que scripts/generate-copies-db.mjs faz.
const requireCjs = createRequire(import.meta.url);
const { gerarCopy } = requireCjs("../scripts/regenerate-copies.js");

const {
  SALES_PLAYBOOK,
  calculateEntryOfferEconomics,
  copyAssignmentForLead,
  detectVariantFromCopy,
  renderEntryOfferMessage,
  renderFollowupMessage,
} = salesPlaybookModule;

test("playbook versiona oferta, copy e experimento ativo", () => {
  assert.match(SALES_PLAYBOOK.copyVersion, /^copy-/);
  assert.match(SALES_PLAYBOOK.offer.version, /^offer-/);
  assert.equal(SALES_PLAYBOOK.offer.setupPrice, 1000);
  assert.equal(SALES_PLAYBOOK.offer.monthlyPrice, 150);
  assert.equal(SALES_PLAYBOOK.experiment.variants.length, 2);
});

test("Base Industrial e produto separado, com escopo e preco fechados", () => {
  const entry = SALES_PLAYBOOK.entryOffer;
  assert.equal(entry.name, "Base Industrial");
  assert.equal(entry.setupPrice, 600);
  assert.equal(entry.monthlyPrice, 80);
  assert.equal(entry.eligibility.capacityTier, "micro");
  assert.equal(entry.eligibility.offerTrack, "entrada");
  assert.equal(entry.scope.maxServices, 5);
  assert.equal(entry.scope.maxPhotos, 6);
  assert.ok(entry.exclusions.includes("Pedido Pronto"));
  assert.equal(entry.pilot.maxLeads, 20);
  assert.equal(entry.upgrade.credit, 300);
});

test("Base Industrial preserva pelo menos 60% de contribuicao nos limites aprovados", () => {
  const economics = calculateEntryOfferEconomics();
  assert.equal(economics.setup.productionHours, 2);
  assert.equal(economics.monthly.productionMinutes, 10);
  assert.ok(economics.setup.contributionMargin >= 0.6, JSON.stringify(economics.setup));
  assert.ok(economics.monthly.contributionMargin >= 0.6, JSON.stringify(economics.monthly));
  assert.ok(economics.setup.contribution > 0);
  assert.ok(economics.monthly.contribution > 0);
});

test("mensagem da entrada oferece preco, prazo e vaga sem pedir permissao", () => {
  const message = renderEntryOfferMessage({ company: "Metal Forte", nextSlot: "sexta" });
  assert.match(message, /Base Industrial/);
  assert.match(message, /Metal Forte/);
  assert.match(message, /R\$\s*600/);
  assert.match(message, /R\$\s*80\/m[eê]s/);
  assert.match(message, /3 dias [uú]teis/);
  assert.match(message, /Minha pr[oó]xima entrada/);
  assert.doesNotMatch(message, /posso|quer que|faz sentido|topa|desconto/i);
});

test("atribuicao A/B e deterministica e registra as versoes usadas", () => {
  const first = copyAssignmentForLead({ id: 42, company: "Metal Teste" });
  const repeat = copyAssignmentForLead({ id: 42, company: "Metal Teste" });
  assert.deepEqual(first, repeat);
  assert.ok(first.variant === "A" || first.variant === "B");
  assert.equal(first.copyVersion, SALES_PLAYBOOK.copyVersion);
  assert.equal(first.offerVersion, SALES_PLAYBOOK.offer.version);
  assert.equal(first.experimentId, SALES_PLAYBOOK.experiment.id);
});

test("a variante persistida acompanha a abertura realmente enviada", () => {
  assert.equal(detectVariantFromCopy("Fala! Erick aqui, texto"), "B");
  assert.equal(detectVariantFromCopy("Oi, tudo bem? Erick aqui, texto"), "A");
  assert.equal(
    copyAssignmentForLead({ id: 8, company: "Empresa", copyText: "Fala! Erick aqui" }).variant,
    "B",
  );
});

test("follow-ups saem do playbook compartilhado e cada toque traz angulo novo", () => {
  const m1 = renderFollowupMessage({ tier: "M1", company: "Acme Usinagem", segment: "usinagem" });
  const m2 = renderFollowupMessage({ tier: "M2", company: "Acme Usinagem", segment: "usinagem", city: "Joao Monlevade" });
  const m3 = renderFollowupMessage({ tier: "M3", company: "Acme Usinagem", segment: "usinagem" });
  assert.match(m1, /or[cç]amento|Material/i);
  // O mecanismo virou "Pedido Pronto" no reposicionamento; "Ficha de Escopo" morreu
  // e o site e a fonte da verdade. Este teste tinha ficado para tras da copy.
  assert.match(m2, /Pedido Pronto/i);
  assert.match(m3, /[uú]ltima mensagem/i);
  assert.equal(new Set([m1, m2, m3]).size, 3);
});

// Contrato da doutrina v3 (31/08): a sequencia avanca UM degrau por mensagem e a msg 1
// nao vende. Sem trava, uma edicao bem-intencionada devolve o "quer ver?" para a primeira
// mensagem e o funil volta a pedir oferta antes de o lead reconhecer que tem a dor.
test("msg 1 fecha em pergunta de reconhecimento, nunca em oferta", () => {
  const cenarios = [
    gerarCopy({ empresa: "Acme Usinagem", temSite: true, mapsInfo: "", cidade: "Betim", variante: "A" }),
    gerarCopy({ empresa: "Acme Caldeiraria", temSite: false, mapsInfo: "", cidade: "Betim", variante: "B" }),
    gerarCopy({ empresa: "Acme Manutencoes", temSite: true, mapsInfo: "", cidade: "Joao Monlevade", variante: "A" }),
  ];
  for (const copy of cenarios) {
    assert.ok(copy.trim().endsWith("?"), `nao termina em pergunta: ${copy}`);
    assert.doesNotMatch(copy, /quer ver\?/i);
    assert.doesNotMatch(copy, /faz sentido/i);
    assert.doesNotMatch(copy, /https?:\/\//);
  }
});

// M2 e o unico toque que apresenta a correcao, e ele pergunta prioridade em vez de marcar
// hora. Em lead frio industrial o CTA e pergunta: pedir reuniao antes do reconhecimento
// foi o que fazia o M2 morrer sem resposta.
test("follow-ups testam prioridade sem pedir reuniao", () => {
  const m1 = renderFollowupMessage({ tier: "M1", company: "Acme Usinagem", segment: "usinagem" });
  const m2 = renderFollowupMessage({ tier: "M2", company: "Acme Usinagem", segment: "usinagem", city: "Betim" });
  assert.match(m2, /resolveria um problema real hoje/i);
  for (const copy of [m1, m2]) {
    assert.doesNotMatch(copy, /15 minutos|chamada r[aá]pida|reuni[aã]o/i);
  }
});

// 17/09/2026: a bifurcacao depois da msg 1 virou degrau fixo. Sim forte -> msg 2 com
// preco; sim fraco -> ponte sem preco, preco no sim seguinte; nao -> carta por tipo,
// uma vez, sem insistir. Este teste trava os termos mortos e as decisoes do Erick
// ("falha minha" saiu, "triagem" fica, nenhuma carta pede permissao, aponta defeito
// ou pede call), para que nenhuma reescrita futura os traga de volta.
const TERMOS_MORTOS =
  /faz sentido|pode ser\?|te mostro em 15|posso te mostrar|quer ver\?|falha minha|valeu por responder|melhor cliente que existe|isso soma ao que|ficha de escopo|landing page|p[aá]gina de vendas|reuni[aã]o|\bcall\b|agendar|hor[aá]rio|—/i;

test("bifurcacao depois da msg 1: sim forte, sim fraco e cartas do nao vivem no playbook", () => {
  const pr = SALES_PLAYBOOK.postResponse;
  assert.ok(pr.sinaisDeSim.forte.length >= 5 && pr.sinaisDeSim.fraco.length >= 5);
  assert.ok(pr.sinaisDeSim.fraco.includes("diferente"), "'Diferente' sozinho e sim fraco");
  assert.ok(pr.sinaisDeSim.fraco.includes("pode mandar"), "'pode mandar' da espaco pro case, nao pro preco");

  // Ponte: bloco 1 da msg 2, termina em pergunta ancorada no case, sem preco.
  assert.match(pr.msg2Ponte, /\{\{caseUrl\}\}/);
  assert.ok(pr.msg2Ponte.trim().endsWith("?"));
  assert.doesNotMatch(pr.msg2Ponte, /\{\{setupPrice\}\}|R\$/);
  // Preco: blocos 2 e 3, fecho pela vaga de producao.
  assert.match(pr.msg2Preco, /\{\{setupPrice\}\}[\s\S]*\{\{monthlyPrice\}\}/);
  assert.match(pr.msg2Preco, /entrada de produção é \{\{proximaEntrada\}\}\. Coloco a \{\{company\}\} nela\?$/);
  assert.doesNotMatch(pr.msg2Preco, /manuten[cç][aã]o/i);

  type Carta = { quando: string; texto: string };
  const cartas = Object.entries(pr.cartas).filter(
    (entrada): entrada is [string, Carta] => !entrada[0].startsWith("_") && typeof entrada[1] === "object",
  );
  const cartaDe = (nome: string) => cartas.find(([k]) => k === nome)?.[1] as Carta;
  assert.deepEqual(
    cartas.map(([k]) => k),
    ["naoReconhecimento", "naoSemInteresse", "naoJaTem", "naoForaIcp", "naoEntendi", "retomadaSemPreco"],
  );
  for (const [nome, carta] of cartas) {
    assert.ok(carta.quando && carta.texto, `${nome} sem quando/texto`);
    assert.ok(carta.texto.length <= 400, `${nome} longa demais: ${carta.texto.length}`);
    assert.doesNotMatch(carta.texto, TERMOS_MORTOS, `${nome} contem termo morto`);
    assert.doesNotMatch(carta.texto, /https?:\/\//, `${nome} nao leva link`);
  }
  // Cartas do nao nao terminam em pergunta: pergunta convida o segundo nao. (Citacao
  // da fala do lead, tipo "quanto custa fazer uma peca?", pode aparecer no meio.)
  for (const nome of ["naoReconhecimento", "naoSemInteresse", "naoJaTem", "naoForaIcp"]) {
    assert.ok(!cartaDe(nome).texto.trim().endsWith("?"), `${nome} nao pode terminar em pergunta`);
  }
  assert.match(pr.cartas.naoJaTem.texto, /triagem/i, "'triagem' fica: palavra-chave do brandbook");
  // Retomada sem preco entrega o preco e o fecho, sem pedir absolvicao.
  assert.match(pr.cartas.retomadaSemPreco.texto, /Faltou eu falar o valor: \{\{setupPrice\}\}/);
  assert.match(pr.cartas.retomadaSemPreco.texto, /Coloco a \{\{company\}\} nela\?$/);
});

test("Comando le as cartas do playbook e nao tem card de reuniao para lead frio", () => {
  const comando = readFileSync(new URL("../src/app/comando/page.tsx", import.meta.url), "utf8");
  assert.match(comando, /SALES_PLAYBOOK\.postResponse\.msg2Ponte/);
  assert.match(comando, /CARTAS\.naoReconhecimento\.texto/);
  assert.match(comando, /CARTAS\.retomadaSemPreco\.texto/);
  assert.doesNotMatch(comando, /puxar pra reuni[aã]o/i);
  assert.doesNotMatch(comando, /n[aã]o [eé] minha inten[cç][aã]o mexer nisso/i);
  assert.match(comando, /entryQueue/);
  assert.match(comando, /Base Industrial/);
});

test("roteamento por gatekeeper e decisor indicado e versionado e nao pede permissao", () => {
  const routing = SALES_PLAYBOOK.routing;
  const mensagens = [
    routing.humanGatekeeper,
    routing.forwardable,
    routing.centralOpening,
    routing.botName,
    routing.botClose,
    routing.referredDecisionMaker,
  ];
  for (const mensagem of mensagens) {
    assert.doesNotMatch(mensagem, /posso|consegue|prefere|quer ver|faz sentido|topa/i);
  }
  assert.equal(
    renderFollowupMessage({ tier: "M1", company: "Metal Forte", responseType: "bot" }),
    routing.botName,
    "o follow-up automatico de bot usa a mesma fala governante do cockpit",
  );

  const indicado = mensagemDecisorIndicado({
    nomeDecisor: "Marcos Silva",
    empresa: "Metal Forte",
    quemIndicou: "Carla",
  });
  assert.match(indicado, /Carla me passou seu contato/);
  assert.match(indicado, /ida e volta/i);
  assert.doesNotMatch(indicado, /quer ver|posso|prefere/i);

  const comando = readFileSync(new URL("../src/app/comando/page.tsx", import.meta.url), "utf8");
  assert.match(comando, /SALES_PLAYBOOK\.routing\.humanGatekeeper/);
  assert.doesNotMatch(comando, /Consegue me direcionar|Consigo mandar aqui ou prefere/);
});

test("runner e dry-run por padrao e so propaga --go com autorizacao explicita", () => {
  const dry = buildRunPlan({ go: false, city: "Ipatinga", uf: "MG", limit: 10 });
  assert.ok(dry.length >= 4);
  assert.equal(dry.some((step) => step.args.includes("--go")), false);

  const live = buildRunPlan({ go: true, city: "Ipatinga", uf: "MG", limit: 10 });
  assert.ok(live.every((step) => step.args.includes("--go")));
});

test("scripts de envio registram metadados e usam o playbook compartilhado", () => {
  const send = readFileSync(new URL("../scripts/uazapi-send-batch.mjs", import.meta.url), "utf8");
  const followup = readFileSync(new URL("../scripts/uazapi-followup-batch.mjs", import.meta.url), "utf8");
  assert.match(send, /copyAssignmentForLead/);
  assert.match(send, /metadata/);
  assert.match(followup, /renderFollowupMessage/);
});
