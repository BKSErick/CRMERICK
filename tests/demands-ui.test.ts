import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nav = readFileSync(new URL("../src/lib/navigation.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/demandas/page.tsx", import.meta.url), "utf8");
const tree = readFileSync(new URL("../src/components/DemandTree.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../src/components/DemandDialog.tsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("../src/components/DemandOverview.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/components/DemandWorkspace.tsx", import.meta.url), "utf8");
const dealWorkspace = readFileSync(new URL("../src/components/DealWorkspace.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("navegacao cria aba Demandas em Gestao", () => {
  assert.match(nav, /label:\s*"Demandas"[\s\S]*href:\s*"\/demandas"[\s\S]*group:\s*"Gestao"/);
});

test("pagina liga arvore, overview e deep link sem perder a paginacao", () => {
  assert.match(page, /DemandTree/);
  assert.match(page, /DemandOverview/);
  assert.match(page, /buildDemandTree/);
  assert.match(page, /buildDemandOverview/);
  assert.match(page, /selectDemandsForNode/);
  assert.match(page, /Nova demanda/);
  assert.match(page, /demandId/);
  assert.match(page, /offset/);
  assert.match(page, /folderOptions/);
});

test("arvore expoe busca, contagem e criacao de pasta em qualquer nivel", () => {
  assert.match(tree, /Gestao de demandas/);
  assert.match(tree, /Buscar pasta ou lista/);
  assert.match(tree, /filterDemandTree/);
  assert.match(tree, /demand-tree-count/);
  assert.match(tree, /Nova pasta de cliente/);
  assert.match(tree, /Nova subpasta/);
  assert.match(tree, /aria-expanded/);
  // A hierarquia fixa de tres niveis nao existe mais.
  assert.doesNotMatch(tree, /Novo espaco|Nova lista/);
});

test("cada pasta expoe menu de acoes visivel com subpasta, renomear e excluir", () => {
  assert.match(tree, /demand-tree-menu-btn/);
  assert.match(tree, /aria-haspopup="menu"/);
  assert.match(tree, /role="menuitem"/);
  assert.match(tree, /Renomear/);
  assert.match(tree, /Excluir/);
  // Atalho no topo alem do botao do rodape.
  assert.match(tree, /demand-tree-add/);
  // Criar subpasta em pasta recolhida abre a pasta antes de chamar o modal.
  assert.match(tree, /createSubfolder/);
  assert.match(tree, /setCollapsed\(\(current\) => current\.filter/);
  // O nivel sai do <ul> aninhado: nenhum recuo calculado no style da linha.
  assert.doesNotMatch(tree, /paddingLeft/);
});

test("mover pasta nao depende de arrastar, e o nivel se le por icone e conector", () => {
  assert.match(tree, /Mover para/);
  assert.match(tree, /onMoveFolder/);
  assert.match(tree, /demand-tree-icon/);
  // O arrasto tambem comeca pelo botao do nome, que cobre quase toda a linha.
  assert.match(tree, /className="demand-tree-label"[\s\S]*?draggable/);
  assert.match(tree, /beginDrag/);
  // O destino sai do caminho completo e recusa a propria subarvore.
  assert.match(page, /isDescendantFolder/);
  assert.match(page, /flattenFolderOptions/);
  assert.match(dialog, /mode: "select"/);
});

test("arrastar move demanda e pasta, e bloqueia a propria subarvore", () => {
  assert.match(overview, /draggable/);
  assert.match(overview, /DEMAND_DRAG_TYPE/);
  assert.match(tree, /FOLDER_DRAG_TYPE/);
  assert.match(tree, /onDragOver/);
  assert.match(tree, /onDrop/);
  assert.match(tree, /folderSubtreeIds/);
  assert.match(tree, /drag-over/);
  assert.match(page, /onDropDemands/);
  assert.match(page, /onDropFolder/);
});

test("da para excluir demanda pela linha e o grupo inteiro pela arvore", () => {
  assert.match(overview, /onDeleteDemand/);
  assert.match(overview, /demand-row-action/);
  assert.match(overview, /Excluir demanda/);
  // O botao da linha nao pode abrir o workspace junto.
  assert.match(overview, /event\.stopPropagation\(\); onDeleteDemand/);
  assert.match(tree, /onDeleteDemands\(node\.demandIds/);
  assert.match(page, /hard=1&demandIds=/);
  assert.match(page, /Excluir de vez/);
});

test("grupo de Sem pasta arrasta as demandas dele de uma vez", () => {
  assert.match(tree, /unfiled_client/);
  assert.match(tree, /node\.demandIds\.join\(","\)/);
  assert.match(tree, /raw\.split\(","\)/);
});

test("dialogos sao modais da pagina, nunca do navegador", () => {
  const dialog = readFileSync(new URL("../src/components/DemandDialog.tsx", import.meta.url), "utf8");
  assert.match(dialog, /showModal/);
  assert.match(dialog, /<dialog/);
  for (const file of [page, tree, overview]) {
    assert.doesNotMatch(file, /window\.(prompt|confirm)/);
  }
  assert.match(page, /DemandDialog/);
});

test("overview traz janela 7-14-30, chips de status, entregues e grupos em tabela", () => {
  assert.match(overview, /WINDOW_OPTIONS = \[7, 14, 30\]/);
  assert.match(overview, /Mostrar entregues/);
  assert.match(overview, /Buscar tarefa/);
  assert.match(overview, /Atrasadas/);
  assert.match(overview, /Sem data de entrega/);
  assert.match(overview, /Mais \{overview\.beyondWindow\} tarefa/);
  assert.match(overview, /demand-group-table/);
  assert.match(overview, /<details/);
  for (const column of ["Demanda", "Cliente", "Resp\\.", "Data", "Prioridade", "Status"]) {
    assert.match(overview, new RegExp(`<th scope="col">${column}</th>`));
  }
});

test("rotulos de status vivem so no dominio", () => {
  const domain = readFileSync(new URL("../src/lib/clientDemands.ts", import.meta.url), "utf8");
  assert.match(domain, /DEMAND_STATUS_LABELS/);
  for (const file of [page, overview, workspace]) {
    assert.doesNotMatch(file, /const statusLabels: Record<DemandStatus, string> = \{/);
  }
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

test("estilos cobrem arvore, tabela agrupada, overlay e breakpoint mobile", () => {
  assert.match(css, /\.demands-shell\s*\{/);
  assert.match(css, /\.demand-tree\s*\{/);
  assert.match(css, /\.demand-group-table\s*\{/);
  assert.match(css, /\.demand-table-scroll\s*\{[\s\S]*overflow-x: auto/);
  assert.match(css, /\.demand-workspace-overlay/);
  assert.match(css, /\.demand-workspace-shell/);
  // Fixo na viewport: absoluto era recortado pelo overflow da arvore ao abrir para cima.
  assert.match(css, /\.demand-tree-menu\s*\{[\s\S]*?position: fixed/);
  assert.doesNotMatch(css, /\.demand-tree-menu\.up/);
  // Hierarquia se le pela linha-guia do nivel, nao por padding inline.
  assert.match(css, /\.demand-tree-body ul ul\s*\{[\s\S]*border-left/);
  assert.match(css, /\.demand-tree-body ul ul > li::before/);
  assert.match(css, /\.demand-tree-body ul ul > li:last-child::after/);
  assert.match(css, /\.demand-tree-icon\s*\{/);
  // A linha ancora o painel do menu.
  assert.match(css, /\.demand-tree-row\s*\{[\s\S]*position: relative/);
  // As acoes da pasta nunca nascem invisiveis.
  assert.doesNotMatch(css, /\.demand-tree-action\s*\{[^}]*opacity: 0;/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)[\s\S]*\.demands-shell/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)[\s\S]*\.demand-workspace-shell/);
  // As regras da lista plana antiga saem junto com o markup que as usava.
  assert.doesNotMatch(css, /\.demand-list-row/);
  assert.doesNotMatch(css, /\.demands-toolbar/);
});
