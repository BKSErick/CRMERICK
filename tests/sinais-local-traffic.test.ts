import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { classifySource, emailDealRef, isTestTrafficUrl, signalEventKind, trafficKindForUrl } from "../src/lib/sinais.ts";

test("identifica hosts locais, loopback e rede privada como trafego de teste", () => {
  for (const url of [
    "http://localhost:4178",
    "http://127.0.0.1:4180/diagnostico",
    "http://127.20.30.40:3000",
    "http://[::1]:3000",
    "http://0.0.0.0:4180",
    "http://10.0.0.8:3000",
    "http://172.16.4.2:3000",
    "http://192.168.1.22:3000",
    "http://preview.local:4178",
  ]) {
    assert.equal(isTestTrafficUrl(url), true, url);
  }
});

test("identifica previews apontando para caminhos locais do Windows", () => {
  for (const url of [
    "/D:/tmp/Lps-atfm-proposta-20260723/propostas/atfm-atf",
    "/D:/tmp/Linkbiopageerick",
    "D:\\tmp\\Linkbiopageerick",
    "file:///D:/tmp/Lps-atfm-proposta-20260723/propostas/atfm-atf/index.html",
    "https://preview.example/D:/tmp/Linkbiopageerick/index.html",
  ]) {
    assert.equal(isTestTrafficUrl(url), true, url);
  }
});

test("preserva dominios e paginas publicas reais", () => {
  for (const url of [
    "https://ostrack.com.br",
    "https://lps-atfm.vercel.app/atfm-manutencao",
    "https://euericksena.com.br/quiz",
    "https://crmerick.vercel.app/huberick-temp/diagnostico.html",
  ]) {
    assert.equal(isTestTrafficUrl(url), false, url);
  }
});

test("API de Sinais descarta teste antes de qualquer agregacao", () => {
  const route = readFileSync(new URL("../src/app/api/sinais/route.ts", import.meta.url), "utf8");
  assert.match(route, /const rows = \(data \?\? \[\]\)\.filter\(\(row\) => !isTestTrafficUrl\(row\.page_url\)\)/);
  assert.equal((route.match(/for \(const row of rows\)/g) ?? []).length, 2);
  assert.doesNotMatch(route, /for \(const row of data \?\? \[\]\)/);
});

test("novos eventos locais sao ignorados antes de Supabase, GA e Meta", () => {
  const route = readFileSync(new URL("../src/app/api/facebook-pixel/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(isTestTrafficUrl\(body\.pageUrl\)\)/);
  assert.match(route, /status:\s*"ignored_test_traffic"/);
});

test("visita ao site vinda do e-mail frio carrega a referencia do deal", () => {
  const email = "https://www.mydrion.com.br/?utm_source=email&utm_medium=cold&utm_campaign=institucional&utm_content=d1234";
  assert.equal(emailDealRef(email), 1234);
  assert.equal(emailDealRef("https://www.mydrion.com.br/?utm_source=email&utm_content=abc"), null);
  assert.equal(emailDealRef("https://www.mydrion.com.br/?utm_content=d"), null);
  assert.equal(emailDealRef("https://www.mydrion.com.br/"), null);
  assert.equal(emailDealRef(""), null);
  assert.equal(emailDealRef(undefined), null);
});

test("site proprio e trafego inbound, salvo quando a visita traz a referencia do e-mail", () => {
  assert.deepEqual(classifySource("www.mydrion.com.br", "/"), { key: "mydrion", label: "Site Mydrion", kind: "inbound" });
  // ostrack.mydrion.com.br continua sendo linha do OStrack.
  assert.equal(classifySource("ostrack.mydrion.com.br", "/").key, "ostrack");

  assert.equal(trafficKindForUrl("https://www.mydrion.com.br/?utm_source=email&utm_content=d77"), "outbound");
  assert.equal(trafficKindForUrl("https://www.mydrion.com.br/?utm_source=instagram"), "inbound");
  assert.equal(trafficKindForUrl("https://www.mydrion.com.br/"), "inbound");
  assert.equal(trafficKindForUrl("https://crmerick.vercel.app/huberick-temp/diagnostico.html"), "outbound");
});

test("o radar le o sufixo do evento, seja Diagnostico* ou MydrionSite*", () => {
  assert.equal(signalEventKind("DiagnosticoView"), "view");
  assert.equal(signalEventKind("MydrionSiteView"), "view");
  assert.equal(signalEventKind("DiagnosticoWhatsAppClick"), "whatsapp");
  assert.equal(signalEventKind("MydrionSiteWhatsAppClick"), "whatsapp");
  assert.equal(signalEventKind("MydrionSiteScrollDepth"), "scroll");
  assert.equal(signalEventKind("MydrionSiteCtaClick"), "click");
  assert.equal(signalEventKind("DiagnosticoLinkClick"), "click");
});

test("beacon do pixel resolve o deal pela referencia antes de gravar", () => {
  const route = readFileSync(new URL("../src/app/api/facebook-pixel/route.ts", import.meta.url), "utf8");
  assert.match(route, /const deal = await resolveSignalDeal\(body\)/);
  assert.match(route, /emailDealRef\(body\.pageUrl\)/);
  // A visita do e-mail grava a empresa do card, para Sinais/Comando agruparem certo.
  assert.match(route, /deal\?\.origin === "email" && deal\.company \? deal\.company/);
});
