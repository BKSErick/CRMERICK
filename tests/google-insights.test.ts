import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildGoogleInsights,
  dedupeEvents,
  fillDailyGaps,
  normalizeEventKey,
  shortPageLabel,
} from "../src/lib/googleInsights.ts";

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

test("CTA Mydrion usa taxonomia explicita sem misturar outras origens", () => {
  const { analytics } = buildGoogleInsights({
    ...base,
    events: [
      { eventName: "page_view", eventCount: 258, activeUsers: 143 },
      { eventName: "click", eventCount: 14, activeUsers: 10 },
      { eventName: "blog_internal_link_click", eventCount: 3, activeUsers: 3 },
      { eventName: "OStrackAcimonCta", eventCount: 1, activeUsers: 1 },
      { eventName: "ostrack_acimon_cta", eventCount: 1, activeUsers: 1 },
      { eventName: "diagnostico_whatsapp_click", eventCount: 2, activeUsers: 2 },
      { eventName: "diagnostico_link_click", eventCount: 8, activeUsers: 7 },
      { eventName: "mydrion_cta_click", eventCount: 4, activeUsers: 3 },
      { eventName: "organic_cta_click", eventCount: 2, activeUsers: 2 },
      { eventName: "blog_cta_click", eventCount: 1, activeUsers: 1 },
      { eventName: "generate_lead", eventCount: 2, activeUsers: 2 },
    ],
  });

  assert.equal(analytics.ctaClicks, 7, "canonico 4 + organico legado 2 + blog legado 1");
  assert.equal(analytics.leads, 2, "somente generate_lead da Mydrion");
  assert.equal(analytics.views, 258);
});

test("funil do GA4 soma os eventos Mydrion certos por passo", () => {
  const { analytics } = buildGoogleInsights({
    ...base,
    events: [
      { eventName: "page_view", eventCount: 100, activeUsers: 62 },
      { eventName: "mydrion_cta_click", eventCount: 10, activeUsers: 7 },
      { eventName: "generate_lead", eventCount: 3, activeUsers: 3 },
      { eventName: "purchase", eventCount: 1, activeUsers: 1 },
    ],
    daily: [
      { date: "2026-09-08", sessions: 30, activeUsers: 22 },
      { date: "2026-09-09", sessions: 40, activeUsers: 30 },
    ],
  });

  assert.equal(analytics.views, 100);
  assert.equal(analytics.ctaClicks, 10);
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

test("pagina do Search Console vira caminho curto, e host fora do canonico continua visivel", () => {
  // Caso real de 16/09/2026: oito linhas "https://www.mydrion.com.br/..." cortadas
  // por ellipsis ficavam identicas na tela.
  assert.equal(shortPageLabel("https://www.mydrion.com.br/sites-para-industrias/"), "/sites-para-industrias/");
  assert.equal(shortPageLabel("https://www.mydrion.com.br/"), "/");
  // Subdominio e o non-www nao sao o site institucional: o host fica.
  assert.equal(shortPageLabel("https://linkbio.mydrion.com.br/"), "linkbio.mydrion.com.br/");
  assert.equal(shortPageLabel("https://mydrion.com.br/blog/"), "mydrion.com.br/blog/");
  // URL sem TLS indexada e sinal de canonica errada: o esquema precisa aparecer.
  assert.equal(shortPageLabel("http://mydrion.com.br/"), "http://mydrion.com.br/");
  // Lixo nao quebra: devolve como veio.
  assert.equal(shortPageLabel("nao-e-url"), "nao-e-url");

  const { search } = buildGoogleInsights({
    ...base,
    gscPages: [
      { key: "https://www.mydrion.com.br/cases/gt-house/", impressions: 9, clicks: 0, ctr: 0, position: 8 },
      { key: "http://mydrion.com.br/", impressions: 1, clicks: 0, ctr: 0, position: 141 },
    ],
  });
  assert.equal(search.pages[0].label, "/cases/gt-house/");
  assert.equal(search.pages[0].title, "https://www.mydrion.com.br/cases/gt-house/", "a URL inteira sobrevive para o hover");
  assert.equal(search.pages[1].label, "http://mydrion.com.br/");
});

test("dia sem sessao entra como zero na serie, senao o eixo fica torto", () => {
  // O GA4 omite dia com zero sessao. Em 16/09/2026 a serie de 30 dias veio com 21
  // linhas e 01/09 aparecia colado em 06/09, como se fossem dias seguidos.
  const cheia = fillDailyGaps(
    [
      { day: "2026-09-01", sessions: 4, users: 3 },
      { day: "2026-09-06", sessions: 2, users: 2 },
      { day: "2026-09-04", sessions: 1, users: 1 },
    ],
    (day) => ({ day, sessions: 0, users: 0 }),
  );
  assert.deepEqual(
    cheia.map((d) => d.day),
    ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"],
    "ordena e preenche o meio; nao inventa dia antes do primeiro nem depois do ultimo",
  );
  assert.deepEqual(cheia.map((d) => d.sessions), [4, 0, 0, 1, 0, 2]);
  assert.deepEqual(fillDailyGaps([], () => ({ day: "" })), []);

  const { analytics, search } = buildGoogleInsights({
    ...base,
    daily: [
      { date: "2026-09-01", sessions: 4, activeUsers: 3 },
      { date: "2026-09-03", sessions: 2, activeUsers: 2 },
    ],
    gscDaily: [
      { key: "2026-09-01", clicks: 0, impressions: 5, ctr: 0, position: 40 },
      { key: "2026-09-03", clicks: 1, impressions: 2, ctr: 50, position: 8 },
    ],
  });
  assert.deepEqual(analytics.daily.map((d) => d.day), ["2026-09-01", "2026-09-02", "2026-09-03"]);
  assert.equal(analytics.sessions, 6, "o total continua vindo so do que a API devolveu");
  assert.deepEqual(search.daily.map((d) => d.impressions), [5, 0, 2]);
});

test("a serie diaria mostra todos os dias e nao esconde os recentes atras de scroll", () => {
  // Em 16/09/2026 a API devolveu 22 dias e a tela mostrava 14: coluna de largura
  // fixa estourava o cartao e o pico (08/09, 11 impressoes) ficava invisivel.
  const painel = readFileSync("src/components/GooglePanel.tsx", "utf8");
  assert.doesNotMatch(painel, /daily\.slice\(-\d+\)/, "sem recorte de dias no componente");
  assert.match(painel, /painel-serie densa/, "coluna elastica para ate 30 dias");
  assert.match(painel, /valor === 0 \? " zero"/, "barra zerada nao desenha");

  const css = readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /\.painel-serie\.densa \.painel-serie-col \{[^}]*flex: 1 1 0/);
  assert.match(css, /\.painel-serie-bar\.zero \{ min-height: 0; \}/);
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

test("zero clique separa medicao nao confirmada de comportamento observado", () => {
  // O GA4 omite linhas de evento com contagem zero. Ausencia do CTA no relatorio
  // nao prova falta de instrumentacao nem ausencia de clique; o evento de saude
  // da versao atual e quem confirma que o contrato esteve ativo no periodo.
  const semInstrumentacao = buildGoogleInsights({
    ...base,
    gscConfigured: false,
    events: [{ eventName: "page_view", eventCount: 258, activeUsers: 120 }],
  });
  const aviso = semInstrumentacao.diagnosis.find((d) => /Medição de CTA ainda não confirmada/.test(d.title));
  assert.ok(aviso, "o alerta existe");
  assert.match(aviso.message, /não permite concluir/);

  // O evento de prontidao e separado da taxonomia de conversao: confirma a
  // medicao sem criar clique e torna o zero um comportamento observavel.
  const comInstrumentacao = buildGoogleInsights({
    ...base,
    gscConfigured: false,
    events: [
      { eventName: "page_view", eventCount: 258, activeUsers: 120 },
      { eventName: "mydrion_measurement_active", eventCount: 258, activeUsers: 120 },
    ],
  });
  const aviso2 = comInstrumentacao.diagnosis.find((d) => /Nenhum clique de CTA no período/.test(d.title));
  assert.ok(aviso2, "o alerta existe");
  assert.match(aviso2.message, /medição está ativa/);
  assert.equal(comInstrumentacao.analytics.ctaClicks, 0);
});

test("funil descreve exatamente a taxonomia contabilizada", () => {
  const { analytics } = buildGoogleInsights({
    ...base,
    events: [
      { eventName: "page_view", eventCount: 20, activeUsers: 12 },
      { eventName: "mydrion_cta_click", eventCount: 4, activeUsers: 3 },
      { eventName: "generate_lead", eventCount: 1, activeUsers: 1 },
    ],
  });

  assert.deepEqual(analytics.funnel.map((item) => item.helper), [
    "page_view",
    "mydrion_cta_click + CTAs legados aceitos",
    "generate_lead",
    "purchase",
  ]);
});

test("clique que nao vira lead e apontado separado", () => {
  const report = buildGoogleInsights({
    ...base,
    gscConfigured: false,
    events: [
      { eventName: "page_view", eventCount: 258, activeUsers: 143 },
      { eventName: "mydrion_cta_click", eventCount: 18, activeUsers: 12 },
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
