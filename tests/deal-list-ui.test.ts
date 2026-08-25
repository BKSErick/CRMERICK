import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/app/lista/page.tsx", import.meta.url), "utf8");
const nav = readFileSync(new URL("../src/lib/navigation.ts", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
const pipeline = readFileSync(new URL("../src/app/pipeline/page.tsx", import.meta.url), "utf8");
const overlay = readFileSync(new URL("../src/components/DealDetailOverlay.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const normalizedPage = page.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

test("navegacao oferece Lista imediatamente depois de Pipeline", () => {
  assert.match(nav, /label:\s*"Pipeline"[\s\S]*?label:\s*"Lista",\s*href:\s*"\/lista"/);
  assert.match(sidebar, /lista:/);
});

test("rota usa a fonte canonica, dominio de lista e estados visiveis", () => {
  assert.match(page, /fetch\("\/api\/crm-data"\)/);
  assert.match(page, /filterDeals/);
  assert.match(page, /sortDeals/);
  assert.match(page, /paginateDeals/);
  assert.match(page, /Carregando deals/);
  assert.match(normalizedPage, /Nao foi possivel carregar/);
  assert.match(page, /Nenhum deal encontrado/);
});

test("tabela traz as sete colunas operacionais e controles combinaveis", () => {
  for (const column of ["Deal / empresa", "Etapa", "Responsavel", "Valor", "Saude", "Proxima acao", "Atualizado"]) {
    assert.match(normalizedPage, new RegExp(column, "i"));
  }
  assert.match(page, /Todas as etapas/);
  assert.match(normalizedPage, /Todos os responsaveis/);
  assert.match(page, /50 por pagina/);
  assert.match(normalizedPage, /Pagina \{pagination\.page\} de \{pagination\.totalPages\}/);
});

test("linha e deep link abrem o overlay compartilhado com gate de perda", () => {
  assert.match(page, /URLSearchParams/);
  assert.match(page, /dealId/);
  assert.match(page, /DealDetailOverlay/);
  assert.match(page, /LossReasonDialog/);
  assert.match(page, /updateDealStage/);
  assert.doesNotMatch(page, /function DealDetailOverlay/);
  assert.match(pipeline, /from "@\/components\/DealDetailOverlay"/);
  assert.match(overlay, /export function DealDetailOverlay/);
  assert.match(overlay, /export function LossReasonDialog/);
});

test("estilos mantem tabela legivel e cria cartoes no mobile", () => {
  assert.match(css, /\.deal-list-table/);
  assert.match(css, /\.deal-list-pagination/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)[\s\S]*\.deal-list-table/);
});
