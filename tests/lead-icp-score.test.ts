import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { normalizarDecisaoIcpIa } from "../src/lib/icpAiClassification.mjs";

const require = createRequire(import.meta.url);
const { applyIcpPoints, diagnoseLead, icpPoints } = require("../src/lib/leadScoring.js");
const { carregarRegrasIcp, elegibilidadeNaEntrada, icpNaEntrada } = require("../scripts/lib/leadIngest.js");

test("ICP soma 15 dentro, tira 25 fora e nao mexe no indefinido", () => {
  assert.equal(icpPoints(true), 15);
  assert.equal(icpPoints(false), -25);
  assert.equal(icpPoints(null), 0);
});

test("ajuste de ICP e idempotente e reversivel pela parcela gravada", () => {
  const primeira = applyIcpPoints(60, 0, true);
  assert.deepEqual(primeira, { points: 75, icp_points: 15 });
  assert.deepEqual(applyIcpPoints(primeira.points, primeira.icp_points, true), primeira, "rodar de novo nao soma outra vez");
  assert.deepEqual(applyIcpPoints(75, 15, false), { points: 35, icp_points: -25 }, "virar fora do ICP desconta o bonus antigo");
  assert.deepEqual(applyIcpPoints(75, 15, null), { points: 60, icp_points: 0 }, "indefinido volta a nota base");
});

test("nota nunca fica negativa e a parcela gravada e a aplicada de fato", () => {
  const baixa = applyIcpPoints(10, 0, false);
  assert.deepEqual(baixa, { points: 0, icp_points: -10 });
  assert.deepEqual(applyIcpPoints(baixa.points, baixa.icp_points, null), { points: 10, icp_points: 0 }, "volta exata para a base");
  assert.deepEqual(applyIcpPoints(baixa.points, baixa.icp_points, false), baixa, "idempotente mesmo no piso");
});

test("lookalike acha o segmento pela chave canonica do perfil vencedor", () => {
  const perfil = {
    geradoEm: "2026-09-24", amostra: 100, quentes: 10, taxaGeral: 0.1, priorPeso: 5, minAmostra: 5,
    dimensoes: { segment: { usinagem: { total: 30, quentes: 5, taxa: 0.16, lift: 1.5 } } },
  };
  const lead = { name: "Usinagem Silva Ltda", phone: "31988887777" };
  assert.equal(diagnoseLead(lead, perfil).lookalike_bonus, 0, "sem a chave canonica o perfil nao casava (bug antigo)");
  const comCanonico = diagnoseLead({ ...lead, segment_canonico: "usinagem" }, perfil);
  assert.equal(comCanonico.lookalike_bonus, 10);
  assert.match(comCanonico.lookalike_reasons.join(" "), /segment=usinagem/);
});

test("ICP na entrada usa a mesma regra do classify-icp e pula casa de evento", async () => {
  const regras = await carregarRegrasIcp();
  assert.equal(icpNaEntrada(regras, "Usinagem Silva", "usinagem"), true);
  assert.equal(icpNaEntrada(regras, "Serralheria Boa Vista", "caldeiraria"), false);
  assert.equal(icpNaEntrada(regras, "Buffet Quintal da Vila", "eventos"), null);
});

test("lead novo materializa a regua de capacidade antes de gravar o deal", async () => {
  const resultado = await elegibilidadeNaEntrada(
    {
      name: "Metal Forte Usinagem Industrial",
      website: "https://metalforte.example",
      porte: "EPP",
      capital_social: 250_000,
      cnae_descricao: "Servicos de usinagem, tornearia e solda",
    },
    true,
    "usinagem",
  );

  assert.equal(resultado.capacity_tier, "governante");
  assert.equal(resultado.offer_track, "projeto");
  assert.match(resultado.eligibility_reason, /ICP confirmado/i);
});

test("lead novo anti-ICP ja nasce retido, ainda que a busca o encontre", async () => {
  const resultado = await elegibilidadeNaEntrada(
    {
      name: "Serralheria Boa Vista",
      website: "https://serralheria.example",
      porte: "EPP",
      capital_social: 250_000,
      cnae_descricao: "Fabricacao de estruturas de metal",
    },
    true,
    "caldeiraria",
  );

  assert.equal(resultado.eligible, false);
  assert.equal(resultado.offer_track, "nenhuma");
});

test("classify-icp nao sobrescreve decisao manual nem de importacao", () => {
  const script = readFileSync(new URL("../scripts/classify-icp.mjs", import.meta.url), "utf8");
  assert.match(script, /regraManda = fonte === null \|\| fonte === "regra" \|\| \(fonte === "ia" && veredito !== null\)/);
  assert.match(script, /ESTAGIOS_PROTEGIDOS/);
  assert.match(script, /brandbook\.json/, "criterio de ICP da IA vem do brandbook, nao do codigo");
  assert.match(script, /providerPolicy: POLITICA/);
  assert.match(script, /groq: "groq-free", openrouter: "free-strict"/, "um provedor gratuito por execucao, sem cascata");
  assert.doesNotMatch(script, /free-then-groq/, "classificador nunca usa cascata entre provedores");
  assert.match(script, /evidence:/);
  assert.doesNotMatch(script, /state:\s*\{\s*empresa:/, "nome da empresa nao sai para o provedor externo");
});

test("IA so aceita sim ou nao com confianca alta e evidencia literal suficiente", () => {
  const deal = {
    company: "Metal Forte Usinagem Industrial",
    segment: "usinagem",
    cnae_descricao: "Servicos de usinagem, tornearia e solda",
    porte: "EPP",
    stage: "prospect",
  };
  const decision = normalizarDecisaoIcpIa({
    deal,
    result: {
      ok: true,
      answers: {
        icp: { type: "choice", choice: "sim" },
        confianca: { type: "score", level: 2, label: "evidencia explicita" },
        segmento: { type: "choice", choice: "usinagem" },
      },
      evidencia: "Servicos de usinagem, tornearia e solda",
      model: "free-model",
    },
  });
  assert.equal(decision.veredito, "sim");
  assert.equal(decision.isIcp, true);
  assert.equal(decision.confidence, 2);
  assert.equal(decision.evidence, "Servicos de usinagem, tornearia e solda");
});

test("IA rebaixa palpite, evidencia curta ou divergente para incerto", () => {
  const deal = { company: "ABC Ltda", segment: "outro", cnae_descricao: "", porte: "", stage: "prospect" };
  for (const [confidence, evidencia] of [[1, "ABC Ltda"], [2, "fabricante aeroespacial inventado"]] as const) {
    const decision = normalizarDecisaoIcpIa({
      deal,
      result: {
        ok: true,
        answers: {
          icp: { type: "choice", choice: "sim" },
          confianca: { type: "score", level: confidence, label: "" },
          segmento: { type: "choice", choice: "outro" },
        },
        evidencia,
        model: "free-model",
      },
    });
    assert.equal(decision.veredito, "incerto");
    assert.equal(decision.isIcp, null);
  }
});

test("IA nunca rebaixa estagio avancado e falha permanece indefinida", () => {
  const respostaFora = {
    ok: true,
    answers: {
      icp: { type: "choice", choice: "nao" },
      confianca: { type: "score", level: 2, label: "evidencia explicita" },
      segmento: { type: "choice", choice: "outro" },
    },
    evidencia: "Serralheria residencial sob medida",
    model: "free-model",
  };
  const protegido = normalizarDecisaoIcpIa({
    deal: { company: "Serralheria XPTO", cnae_descricao: "Serralheria residencial sob medida", stage: "proposal" },
    result: respostaFora,
  });
  assert.equal(protegido.isIcp, null);
  assert.equal(protegido.veredito, "incerto");

  const falha = normalizarDecisaoIcpIa({ deal: { company: "ABC", stage: "prospect" }, result: { ok: false } });
  assert.equal(falha.isIcp, null);
  assert.equal(falha.persist, false);
});

test("tela e prompts nao cortam mais a nota em 10", () => {
  const overlay = readFileSync(new URL("../src/components/DealDetailOverlay.tsx", import.meta.url), "utf8");
  const rotaIa = readFileSync(new URL("../src/app/api/ai/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(overlay, /Math\.min\(10, deal\.points/);
  assert.doesNotMatch(rotaIa, /points \|\| 0\}\/10/);
});
