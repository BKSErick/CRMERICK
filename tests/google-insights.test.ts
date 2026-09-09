import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildGoogleInsights, dedupeEvents, normalizeEventKey } from "../src/lib/googleInsights.ts";

const base = {
  gaConfigured: true,
  gscConfigured: true,
  events: [],
  pages: [],
  daily: [],
  sources: [],
  devices: [],
  gscTotals: null,
  gscQueries: [],
  gscPages: [],
  gscDaily: [],
};

const consulta = (key: string, impressions: number, clicks = 0, position = 5) => ({
  key,
  impressions,
  clicks,
  ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
  position,
});

test("o mesmo evento em PascalCase e snake_case nao conta duas vezes", () => {
  // Caso real medido em 09/09/2026: a propriedade recebe os dois nomes com a
  // MESMA contagem. Somar dobraria; por isso o grupo vale o maior, nao a soma.
  assert.equal(normalizeEventKey("OStrackInstitutionalScenario"), normalizeEventKey("ostrack_institutional_scenario"));

  const unicos = dedupeEvents([
    { eventName: "OStrackInstitutionalScenario", eventCount: 31, activeUsers: 20 },
    { eventName: "ostrack_institutional_scenario", eventCount: 31, activeUsers: 20 },
    { eventName: "page_view", eventCount: 258, activeUsers: 143 },
  ]);

  assert.equal(unicos.length, 2);
  assert.equal(unicos.find((e) => normalizeEventKey(e.eventName).startsWith("ostrack"))?.eventCount, 31);
});

test("clique e lead sao classificados por padrao, nao por lista fixa de nomes", () => {
  // A lista fixa era `diagnostico_*` e esta propriedade nunca recebeu nenhum:
  // o funil mostrava 0 clique enquanto existiam click, blog_internal_link_click
  // e ostrack_acimon_cta no periodo.
  const { analytics } = buildGoogleInsights({
    ...base,
    events: [
      { eventName: "page_view", eventCount: 258, activeUsers: 143 },
      { eventName: "click", eventCount: 14, activeUsers: 10 },
      { eventName: "blog_internal_link_click", eventCount: 3, activeUsers: 3 },
      { eventName: "OStrackAcimonCta", eventCount: 1, activeUsers: 1 },
      { eventName: "ostrack_acimon_cta", eventCount: 1, activeUsers: 1 },
      { eventName: "diagnostico_whatsapp_click", eventCount: 2, activeUsers: 2 },
      { eventName: "blog_index_view", eventCount: 9, activeUsers: 8 },
      { eventName: "organic_page_view", eventCount: 25, activeUsers: 20 },
    ],
  });

  assert.equal(analytics.ctaClicks, 18, "click 14 + blog link 3 + cta 1, sem dobrar o par PascalCase/snake");
  assert.equal(analytics.leads, 2, "whatsapp click e lead, nao clique");
  assert.equal(analytics.views, 258, "so o page_view padrao: *_view customizado inflaria a base");
});

test("funil do GA4 soma os eventos certos por passo", () => {
  const { analytics } = buildGoogleInsights({
    ...base,
    events: [
      { eventName: "page_view", eventCount: 100, activeUsers: 62 },
      { eventName: "diagnostico_view", eventCount: 20, activeUsers: 15 },
      { eventName: "diagnostico_link_click", eventCount: 8, activeUsers: 7 },
      { eventName: "diagnostico_report_click", eventCount: 2, activeUsers: 2 },
      { eventName: "diagnostico_whatsapp_click", eventCount: 3, activeUsers: 3 },
      { eventName: "purchase", eventCount: 1, activeUsers: 1 },
    ],
    daily: [
      { date: "2026-09-08", sessions: 30, activeUsers: 22 },
      { date: "2026-09-09", sessions: 40, activeUsers: 30 },
    ],
  });

  assert.equal(analytics.views, 100, "so o page_view: somar diagnostico_view contaria a mesma visita duas vezes");
  assert.equal(analytics.ctaClicks, 10, "link 8 + report 2; o whatsapp_click e lead, nao clique");
  assert.equal(analytics.leads, 3);
  assert.equal(analytics.sales, 1);
  assert.equal(analytics.sessions, 70, "sessoes vem da serie diaria, nao dos eventos");
  assert.equal(analytics.users, 62, "usuarios ativos do page_view");
  assert.deepEqual(analytics.funnel.map((f) => f.value), [100, 10, 3, 1]);
});

test("origens agrupam por canal em vez de listar cada source cru", () => {
  // Sem agrupar, "google"/"google.com"/"l.instagram.com" viram cinco linhas e
  // ninguem enxerga que o canal organico e o dominante.
  const { analytics } = buildGoogleInsights({
    ...base,
    sources: [
      { channel: "Organic Search", source: "google", sessions: 40, activeUsers: 30 },
      { channel: "Organic Search", source: "bing", sessions: 5, activeUsers: 4 },
      { channel: "Direct", source: "(direct)", sessions: 20, activeUsers: 18 },
      { channel: "", source: "desconhecido", sessions: 2, activeUsers: 2 },
    ],
  });

  assert.deepEqual(analytics.channels.map((c) => c.label), ["Organic Search", "Direct", "Nao classificado"]);
  assert.equal(analytics.channels[0].value, 45);
  assert.equal(Math.round(analytics.channels[0].share), 67);
});

test("oportunidade e consulta com impressao e zero clique, ordenada por impressao", () => {
  const { search } = buildGoogleInsights({
    ...base,
    gscTotals: { clicks: 1, impressions: 100, ctr: 1, position: 12 },
    gscQueries: [
      consulta("sites para industria", 25, 0, 45),
      consulta("manutencao industrial", 40, 0, 14),
      consulta("mydrion", 10, 1, 2),
      consulta("pedido pronto", 8, 0, 6),
    ],
  });

  assert.deepEqual(
    search.opportunities.map((o) => o.query),
    ["manutencao industrial", "sites para industria", "pedido pronto"],
    "quem tem clique sai da lista; o resto desce por impressao",
  );
  // O motivo muda com a posicao porque a acao muda: subir no ranking e uma coisa,
  // reescrever titulo e descricao e outra.
  assert.match(search.opportunities[0].motivo, /Segunda pagina/);
  assert.match(search.opportunities[1].motivo, /Longe demais/);
  assert.match(search.opportunities[2].motivo, /titulo e a descricao/);
});

test("Pareto das consultas desce e fecha o acumulado em 100%", () => {
  const { search } = buildGoogleInsights({
    ...base,
    gscQueries: [consulta("a", 10), consulta("b", 60), consulta("c", 30)],
  });

  assert.deepEqual(search.pareto.map((p) => p.label), ["b", "c", "a"]);
  assert.equal(Math.round(search.pareto[0].share), 60);
  assert.equal(Math.round(search.pareto[1].cumulative), 90);
  assert.equal(Math.round(search.pareto[search.pareto.length - 1].cumulative), 100);
});

test("diagnostico acusa impressao sem clique e CTR baixo", () => {
  const semClique = buildGoogleInsights({
    ...base,
    gscTotals: { clicks: 0, impressions: 44, ctr: 0, position: 68 },
    gscQueries: [consulta("sites para industria", 25, 0, 68)],
  });
  assert.equal(semClique.diagnosis[0].level, "critico");
  assert.match(semClique.diagnosis[0].title, /ninguem clica/);
  // Posicao 68 tambem dispara o alerta de ranqueamento.
  assert.ok(semClique.diagnosis.some((d) => /Posicao media/.test(d.title)));

  const ctrBaixo = buildGoogleInsights({
    ...base,
    gscTotals: { clicks: 1, impressions: 500, ctr: 0.2, position: 8 },
  });
  assert.ok(ctrBaixo.diagnosis.some((d) => /CTR/.test(d.title)));

  const saudavel = buildGoogleInsights({
    ...base,
    gscTotals: { clicks: 50, impressions: 500, ctr: 10, position: 4 },
  });
  assert.equal(saudavel.diagnosis[0].level, "ok");
});

test("fonte desligada vira aviso, nao numero falso", () => {
  const report = buildGoogleInsights({ ...base, gaConfigured: false, gscConfigured: false });

  assert.ok(report.diagnosis.some((d) => /GA4 desligado/.test(d.title)));
  assert.ok(report.diagnosis.some((d) => /Search Console desligado/.test(d.title)));
  assert.equal(report.search.totals.impressions, 0);
  assert.equal(report.analytics.sessions, 0);
  assert.deepEqual(report.search.pareto, []);
});

test("zero clique nao vira acusacao de comportamento quando pode ser tracking", () => {
  // Nenhum evento de clique no periodo: o numero seria zero mesmo que todo mundo
  // clicasse, porque nada instrumentou o botao. Afirmar "a pagina nao pede acao"
  // ai e conclusao errada com cara de dado.
  const semInstrumentacao = buildGoogleInsights({
    ...base,
    gscConfigured: false,
    events: [{ eventName: "page_view", eventCount: 258, activeUsers: 120 }],
  });
  const aviso = semInstrumentacao.diagnosis.find((d) => /Nenhum clique em CTA/.test(d.title));
  assert.ok(aviso, "o alerta existe");
  assert.match(aviso.message, /confira se os botoes/);
  assert.doesNotMatch(aviso.message, /nao esta pedindo acao/);

  // Havendo evento de clique registrado (ainda que de outra pagina), zero passa a
  // ser comportamento de verdade.
  const comInstrumentacao = buildGoogleInsights({
    ...base,
    gscConfigured: false,
    events: [
      { eventName: "page_view", eventCount: 258, activeUsers: 120 },
      { eventName: "click", eventCount: 0, activeUsers: 0 },
    ],
  });
  const aviso2 = comInstrumentacao.diagnosis.find((d) => /Nenhum clique em CTA/.test(d.title));
  assert.ok(aviso2, "o alerta existe");
  assert.match(aviso2.message, /comportamento, nao falta de medicao/);
});

test("clique que nao vira lead e apontado separado", () => {
  const report = buildGoogleInsights({
    ...base,
    gscConfigured: false,
    events: [
      { eventName: "page_view", eventCount: 258, activeUsers: 143 },
      { eventName: "click", eventCount: 18, activeUsers: 12 },
    ],
  });
  const aviso = report.diagnosis.find((d) => /nao vira lead/.test(d.title));
  assert.ok(aviso, "com clique e sem lead, o gargalo mudou de lugar");
  assert.match(aviso.message, /18 clique/);
});

test("a rota mantem GA4 e Search Console degradando separado", () => {
  const route = readFileSync("src/app/api/google-panel/route.ts", "utf8");
  // Uma fonte fora do ar nao pode derrubar a outra.
  assert.match(route, /gaConfigured \? fetchGaEvents/);
  assert.match(route, /gscConfigured \? fetchGscTotals/);
  // Credencial presente com resposta nula e acesso negado, nao ausencia de dado.
  assert.match(route, /gaRespondeu/);
  assert.match(route, /gscRespondeu/);
});

test("o Search Console e consultado com atraso de 2 dias", () => {
  // Pedir ate hoje devolve os ultimos dias zerados e parece que o trafego morreu.
  const lib = readFileSync("src/lib/searchConsole.ts", "utf8");
  assert.match(lib, /2 \* 864e5/);
  assert.match(lib, /SCOPE_SEARCH_CONSOLE/);
});

test("Analytics vem antes do Search Console e fonte desligada nao vira zero na tela", () => {
  const painel = readFileSync("src/components/GooglePanel.tsx", "utf8");

  // Ordem: o Search Console depende de habilitacao externa. Enquanto nao conecta,
  // deixa-lo em cima empurra o que tem dado para baixo da dobra.
  const posAnalytics = painel.indexOf("Dentro do site · Analytics");
  const posBusca = painel.indexOf("Na busca do Google · Search Console");
  assert.ok(posAnalytics > 0 && posBusca > 0, "as duas secoes existem");
  assert.ok(posAnalytics < posBusca, "Analytics precisa vir primeiro");

  // Zero de fonte desligada e indistinguivel de zero real: mostra o passo a passo.
  assert.match(painel, /search\.configured \? \(/);
  assert.match(painel, /<SearchConsoleDesligado erro=\{state\.gscErro\}/);

  // O placar do topo nao pode anunciar CTR 0,0% quando nao existe fonte de CTR.
  assert.match(painel, /search\.configured \? pct\(search\.totals\.ctr\) : inteiro\.format\(analytics\.sessions\)/);
});

test("o motivo da falha do Search Console chega ate a tela", () => {
  // API desabilitada no Cloud, service account sem acesso e GSC_SITE_URL com
  // formato errado pedem acoes diferentes: "nao conectado" generico nao ajuda.
  const lib = readFileSync("src/lib/searchConsole.ts", "utf8");
  assert.match(lib, /export function gscUltimoErro/);
  assert.match(lib, /ultimoErro = `\$\{res\.status\}/);

  const route = readFileSync("src/app/api/google-panel/route.ts", "utf8");
  assert.match(route, /gscErro: gscUltimoErro\(\)/);
});

test("o token e cacheado POR ESCOPO", () => {
  // Analytics e Search Console pedem escopos diferentes com o mesmo service
  // account: um cache unico devolveria o token errado para a segunda API.
  const auth = readFileSync("src/lib/googleServiceAccount.ts", "utf8");
  assert.match(auth, /webmasters\.readonly/);
  assert.match(auth, /analytics\.readonly/);
  assert.match(auth, /new Map<string, \{ value: string; expiresAt: number \}>\(\)/);
  assert.match(auth, /cache\.get\(scope\)/);
});
