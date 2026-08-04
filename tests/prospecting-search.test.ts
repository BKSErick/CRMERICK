import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCandidateAgainstCrm,
  createInstagramMessage,
  rankInstagramEvidence,
} from "../src/lib/prospectingSearch.ts";

const candidate = {
  name: "Clinica Sorriso",
  city: "Belo Horizonte",
  uf: "MG",
  mapsCid: "cid-123",
  phone: "(31) 99999-9999",
  website: "https://clinicasorriso.com.br",
  instagramUrl: "https://instagram.com/clinica.sorriso",
};

test("deduplica candidato por CID antes de nome, telefone e dominio", () => {
  const result = classifyCandidateAgainstCrm(candidate, [
    {
      dealId: 42,
      name: "Outro Nome",
      mapsCid: "cid-123",
      phone: null,
      website: null,
      instagramUsername: null,
    },
  ], []);

  assert.deepEqual(result, { state: "existing", dealId: 42, matchedBy: "maps_cid" });
});

test("bloqueia cliente/case e nao cria deal novo", () => {
  const result = classifyCandidateAgainstCrm(
    { ...candidate, name: "Clinica Jotta Estetica" },
    [],
    ["jotta", "metalthec"],
  );
  assert.deepEqual(result, { state: "blocked", matchedBy: "suppression_list" });
});

test("perfil encontrado sem evidencia forte permanece em revisao", () => {
  assert.deepEqual(
    rankInstagramEvidence({
      companyName: "Clinica Sorriso",
      profileTitle: "Clinica Sorriso (@clinica.sorriso)",
      profileUrl: "https://instagram.com/clinica.sorriso",
      foundOnOfficialWebsite: true,
    }),
    { confidence: "high", requiresReview: false, reasons: ["site_oficial", "nome_compativel"] },
  );
  assert.deepEqual(
    rankInstagramEvidence({
      companyName: "Clinica Sorriso",
      profileTitle: "Sorriso e Saude",
      profileUrl: "https://instagram.com/sorriso.saude",
      foundOnOfficialWebsite: false,
    }),
    { confidence: "medium", requiresReview: true, reasons: ["nome_compativel"] },
  );
});

test("copy Instagram e curta, sem link e sem linguagem industrial", () => {
  for (const vertical of ["odontologia", "estetica"] as const) {
    for (const tier of ["initial", "M1", "M2", "M3"] as const) {
      const text = createInstagramMessage({
        tier,
        vertical,
        company: "Clinica Sorriso",
        city: "Belo Horizonte",
      });
      assert.ok(text.length <= 420);
      assert.doesNotMatch(text, /https?:\/\//i);
      assert.doesNotMatch(text, /industrial|usinagem|metalurg/i);
      assert.doesNotMatch(text, /—|–/);
    }
  }
});

test("abordagem inicial elogia o trabalho, posiciona o site e usa os cases como prova", () => {
  const generic = createInstagramMessage({
    tier: "initial",
    vertical: "odontologia",
    company: "Clinica Sorriso",
    city: "Belo Horizonte",
  });
  assert.match(generic, /dei uma olhada no perfil/i);
  assert.match(generic, /gostei muito|cuidado/i);
  assert.match(generic, /site/i);
  assert.match(generic, /nosso instagram.*cases reais/i);
  assert.match(generic, /posso te mostrar/i);
  assert.doesNotMatch(generic, /nao tem site|perfil fraco|falha/i);

  const personalized = createInstagramMessage({
    tier: "initial",
    vertical: "odontologia",
    company: "Grupo Odontologico Especializado",
    city: "Belo Horizonte",
    recipientName: "Dra. Renata",
    compliment: "gostei muito de como você comunica rejuvenescimento com naturalidade",
  });
  assert.match(personalized, /^Oi, Dra\. Renata!/);
  assert.match(personalized, /rejuvenescimento com naturalidade/i);
  assert.match(personalized, /site/i);
  assert.match(personalized, /cases reais/i);
  assert.ok(personalized.length <= 420);
});
