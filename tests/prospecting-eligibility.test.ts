import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  avaliarElegibilidadeProspeccao,
  compararPrioridadeProspeccao,
} from "../src/lib/prospectingEligibility.mjs";

const industrial = {
  id: 1,
  company: "Metal Forte Usinagem Industrial",
  segment: "usinagem",
  segment_norm: "usinagem",
  is_icp: true,
  porte: "EPP",
  capital_social: 250_000,
  cnae_descricao: "Servicos de usinagem, tornearia e solda",
  site_url: "https://metalforte.example",
};

test("score ordena, mas nao torna anti-ICP elegivel", () => {
  const resultado = avaliarElegibilidadeProspeccao({
    ...industrial,
    company: "Marmoraria Imperial",
    segment: "caldeiraria",
    points: 190,
  });

  assert.equal(resultado.eligible, false);
  assert.equal(resultado.offer_track, "nenhuma");
  assert.match(resultado.eligibility_reason, /anti-ICP/i);
});

test("serralheria, refrigeracao e assistencia residencial ficam fora mesmo com porte", () => {
  for (const company of [
    "Serralheria Boa Vista",
    "Refrigeracao Barbosa - Autorizada Brastemp e Consul",
    "Assistencia Tecnica de Geladeiras Tim",
    "Seguranca Eletronica CFTV Minas",
  ]) {
    const resultado = avaliarElegibilidadeProspeccao({ ...industrial, company });
    assert.equal(resultado.eligible, false, company);
    assert.equal(resultado.capacity_tier, "incerto", company);
  }
});

test("assistencia tecnica industrial comprovada nao e confundida com eletrodomestico", () => {
  const resultado = avaliarElegibilidadeProspeccao({
    ...industrial,
    company: "Tecmaq Assistencia Tecnica Industrial",
    segment: "manutencao",
    cnae_descricao: "Manutencao e reparacao de maquinas e equipamentos industriais",
  });
  assert.equal(resultado.eligible, true);
  assert.equal(resultado.capacity_tier, "governante");
});

test("ICP falso ou indefinido nunca entra na fila industrial", () => {
  assert.equal(avaliarElegibilidadeProspeccao({ ...industrial, is_icp: false }).eligible, false);
  assert.equal(avaliarElegibilidadeProspeccao({ ...industrial, is_icp: null }).eligible, false);
});

test("EPP e DEMAIS industriais sao governantes; ME com evidencia e estruturada", () => {
  const governante = avaliarElegibilidadeProspeccao(industrial);
  assert.equal(governante.eligible, true);
  assert.equal(governante.capacity_tier, "governante");
  assert.equal(governante.offer_track, "projeto");

  const estruturada = avaliarElegibilidadeProspeccao({ ...industrial, porte: "ME", capital_social: 80_000 });
  assert.equal(estruturada.eligible, true);
  assert.equal(estruturada.capacity_tier, "estruturado");
});

test("ME sem lastro, MEI e porte desconhecido nao consomem a fila", () => {
  const pequena = avaliarElegibilidadeProspeccao({ ...industrial, porte: "ME", capital_social: 10_000 });
  assert.equal(pequena.eligible, false);
  assert.equal(pequena.capacity_tier, "micro");
  assert.equal(pequena.offer_track, "entrada");

  assert.equal(avaliarElegibilidadeProspeccao({ ...industrial, porte: "MEI" }).capacity_tier, "micro");
  assert.equal(avaliarElegibilidadeProspeccao({ ...industrial, porte: null, capital_social: null }).capacity_tier, "incerto");
});

test("eventos usam trilha propria e nao passam pela regua industrial", () => {
  const evento = avaliarElegibilidadeProspeccao({
    ...industrial,
    company: "Casa Petra",
    segment: "eventos",
    segment_norm: null,
    is_icp: null,
    porte: null,
    capital_social: null,
  });

  assert.equal(evento.eligible, true);
  assert.equal(evento.offer_track, "projeto");
  assert.match(evento.eligibility_reason, /vertical de eventos/i);
});

test("primeiro contato e follow-up aplicam a mesma regua antes de montar a fila", () => {
  const primeiroContato = readFileSync(new URL("../scripts/uazapi-send-batch.mjs", import.meta.url), "utf8");
  const followup = readFileSync(new URL("../scripts/uazapi-followup-batch.mjs", import.meta.url), "utf8");

  for (const fonte of [primeiroContato, followup]) {
    assert.match(fonte, /avaliarElegibilidadeProspeccao/);
    assert.match(fonte, /is_icp/);
    assert.match(fonte, /capacity_tier/);
    assert.match(fonte, /eligibility_reason/);
  }
});

test("migration persiste os cinco campos auditaveis da decisao", () => {
  const migration = readFileSync(
    new URL("../scripts/migrations/20260924_prospecting_eligibility.sql", import.meta.url),
    "utf8",
  );
  for (const coluna of ["capacity_tier", "capacity_evidence", "decision_access", "offer_track", "eligibility_reason"]) {
    assert.match(migration, new RegExp(`add column if not exists ${coluna}`, "i"));
  }
  assert.match(migration, /governante/);
  assert.match(migration, /estruturado/);
  assert.match(migration, /micro/);
  assert.match(migration, /incerto/);
});

test("sinal, capacidade e score ordenam somente o conjunto que ja passou pelo gate", () => {
  const fila = [
    { id: 1, signalWeight: 0, points: 150, capacity_tier: "estruturado" },
    { id: 2, signalWeight: 0, points: 70, capacity_tier: "governante" },
    { id: 3, signalWeight: 5, points: 20, capacity_tier: "estruturado" },
    { id: 4, signalWeight: 0, points: 110, capacity_tier: "governante" },
  ].sort(compararPrioridadeProspeccao);

  assert.deepEqual(fila.map((lead) => lead.id), [3, 4, 2, 1]);
});

test("scripts automaticos usam score e capacidade, mas ids aprovados preservam a ordem literal", () => {
  const primeiroContato = readFileSync(new URL("../scripts/uazapi-send-batch.mjs", import.meta.url), "utf8");
  const followup = readFileSync(new URL("../scripts/uazapi-followup-batch.mjs", import.meta.url), "utf8");

  assert.match(primeiroContato, /points/);
  assert.match(primeiroContato, /compararPrioridadeProspeccao/);
  assert.match(primeiroContato, /ordemIdsExplicitos/);
  assert.match(followup, /points/);
  assert.match(followup, /ordemIdsExplicitos/);
});

test("Sala de Comando filtra pela mesma elegibilidade e devolve a justificativa operacional", () => {
  const rota = readFileSync(new URL("../src/app/api/comando/route.ts", import.meta.url), "utf8");
  const pagina = readFileSync(new URL("../src/app/comando/page.tsx", import.meta.url), "utf8");

  assert.match(rota, /avaliarElegibilidadeProspeccao/);
  assert.match(rota, /\.filter\(\(d\) => d\.prospectingEligibility\.eligible\)/);
  for (const campo of ["capacity_tier", "capacity_evidence", "decision_access", "offer_track", "eligibility_reason"]) {
    assert.match(rota, new RegExp(campo));
    assert.match(pagina, new RegExp(campo));
  }
});
