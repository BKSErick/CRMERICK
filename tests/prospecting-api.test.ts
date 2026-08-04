import assert from "node:assert/strict";
import test from "node:test";

import { parseImportRequest, parseSearchRequest, safePublicHttpUrl } from "../src/lib/prospectingApi.ts";

test("valida e normaliza payload da busca", () => {
  assert.deepEqual(parseSearchRequest({ city: "  Belo Horizonte ", uf: "mg", vertical: "odontologia" }), {
    city: "Belo Horizonte",
    uf: "MG",
    vertical: "odontologia",
  });
  assert.throws(() => parseSearchRequest({ city: "BH", uf: "MG", vertical: "industrial" }), /vertical/i);
  assert.throws(() => parseSearchRequest({ city: "", uf: "MG", vertical: "estetica" }), /cidade/i);
  assert.throws(() => parseSearchRequest({ city: "Contagem", uf: "Minas", vertical: "estetica" }), /UF/);
});

test("importacao Instagram exige candidato e perfil validos", () => {
  const result = parseImportRequest({
    vertical: "estetica",
    candidate: {
      name: "Clinica Pele",
      city: "Contagem",
      uf: "MG",
      instagramUrl: "https://instagram.com/clinica.pele",
      matchConfidence: "medium",
      matchSource: "serper_search",
    },
  });
  assert.equal(result.candidate.instagramUsername, "clinica.pele");
  assert.throws(
    () => parseImportRequest({ vertical: "estetica", candidate: { name: "Clinica Pele" } }),
    /Instagram/i,
  );
});

test("bloqueia URL local ou protocolo nao HTTP antes de enriquecer site", () => {
  assert.equal(safePublicHttpUrl("https://clinica.com.br/sobre"), "https://clinica.com.br/sobre");
  assert.equal(safePublicHttpUrl("http://localhost:3000/admin"), null);
  assert.equal(safePublicHttpUrl("http://127.0.0.1/private"), null);
  assert.equal(safePublicHttpUrl("http://192.168.1.2/private"), null);
  assert.equal(safePublicHttpUrl("file:///etc/passwd"), null);
});
