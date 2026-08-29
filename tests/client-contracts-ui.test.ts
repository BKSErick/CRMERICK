import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("workspace do cliente incorpora historico de contratos", () => {
  const workspace = source("src/components/ClientWorkspace.tsx");
  assert.match(workspace, /ClientContracts/);
  assert.match(workspace, /representativeName/);
  assert.match(workspace, /representativeDocument/);
});

test("contratos oferecem quatro modelos, previa e download", () => {
  const contracts = source("src/components/ClientContracts.tsx");
  const dialog = source("src/components/ContractDialog.tsx");
  const preview = source("src/components/ContractPreview.tsx");
  assert.match(contracts, /Novo contrato/);
  assert.match(contracts, /api\/client-contracts/);
  assert.doesNotMatch(contracts, /useEffect\(\(\) => \{ void load/);
  assert.match(dialog, /CONTRACT_TEMPLATES/);
  assert.match(dialog, /Valor \(R\$\)/);
  assert.match(dialog, /Dados cadastrais ausentes/);
  assert.match(preview, /Gerar PDF/);
  assert.match(preview, /\/pdf/);
});

test("estilo cobre pagina A4, lista e dialogo responsivo", () => {
  const css = source("src/app/globals.css");
  assert.match(css, /\.client-contracts/);
  assert.match(css, /\.contract-preview-page/);
  assert.match(css, /@media[\s\S]*\.contract-dialog/);
});
