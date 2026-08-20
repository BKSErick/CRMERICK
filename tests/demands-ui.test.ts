import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nav = readFileSync(new URL("../src/lib/navigation.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/demandas/page.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/components/DemandWorkspace.tsx", import.meta.url), "utf8");
const dealWorkspace = readFileSync(new URL("../src/components/DealWorkspace.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("navegacao cria aba Demandas em Gestao", () => {
  assert.match(nav, /label:\s*"Demandas"[\s\S]*href:\s*"\/demandas"[\s\S]*group:\s*"Gestao"/);
});

test("lista possui grupos, filtros, criacao e deep link", () => {
  for (const label of ["Atrasadas", "Hoje", "Proximas", "Sem prazo", "Concluidas"]) {
    assert.match(page.normalize("NFD").replace(/[\u0300-\u036f]/g, ""), new RegExp(label, "i"));
  }
  assert.match(page, /Nova demanda/);
  assert.match(page, /demandId/);
  assert.match(page, /groupDemandBySchedule/);
  assert.match(page, /offset/);
  assert.match(page, /priorityFilter/);
  assert.match(page, /destinationFilter/);
  assert.match(page, /assigneeFilter/);
});

test("workspace edita conteudo e mantem deal canonico acessivel", () => {
  for (const label of ["Descricao", "Copy", "Checklist", "Links", "Anexos", "Atividade", "Deal comercial"]) {
    assert.match(workspace.normalize("NFD").replace(/[\u0300-\u036f]/g, ""), new RegExp(label, "i"));
  }
  assert.match(workspace, /DealWorkspace/);
  assert.match(dealWorkspace, /\/pipeline\?dealId=/);
  assert.match(workspace, /createClient/);
  assert.match(workspace, /uploadToSignedUrl/);
  assert.match(workspace, /aria-label/);
});

test("estilos incluem lista densa, overlay e breakpoint mobile", () => {
  assert.match(css, /\.demands-list/);
  assert.match(css, /\.demand-workspace-overlay/);
  assert.match(css, /\.demand-workspace-shell/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)[\s\S]*\.demand-workspace-shell/);
});
