import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildDemandOverview,
  type ClientDemand,
  type DemandPriority,
  type DemandStatus,
} from "../src/lib/clientDemands.ts";
import {
  buildDemandTree,
  demandTreePath,
  filterDemandTree,
  findDemandTreeNode,
  flattenFolderOptions,
  folderSubtreeIds,
  isDescendantFolder,
  mapDemandFolder,
  selectDemandsForNode,
  type DemandFolder,
} from "../src/lib/demandFolders.ts";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

let nextId = 1;

function demand(overrides: Partial<ClientDemand> = {}): ClientDemand {
  return {
    id: nextId++,
    dealId: 1,
    folderId: null,
    title: "Demanda",
    description: "",
    copyText: "",
    status: "todo" as DemandStatus,
    priority: "normal" as DemandPriority,
    assignee: "Erick",
    destinationType: "other",
    destinationLabel: "",
    startsAt: null,
    dueAt: null,
    completedAt: null,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    deal: { id: 1, company: "BFT" },
    checklistItems: [],
    links: [],
    attachments: [],
    events: [],
    ...overrides,
  };
}

/** 23:59:59 em America/Sao_Paulo, como o formulario grava o prazo. */
function due(dateKey: string) {
  return new Date(`${dateKey}T23:59:59-03:00`).toISOString();
}

// BFT (raiz, cliente) > Social Media > Agosto, e BFT > Midia Paga.
const folders: DemandFolder[] = [
  { id: 1, parentId: null, dealId: 1, name: "BFT", position: 0 },
  { id: 2, parentId: 1, dealId: null, name: "Social Media", position: 0 },
  { id: 3, parentId: 2, dealId: null, name: "Agosto", position: 0 },
  { id: 4, parentId: 1, dealId: null, name: "Midia Paga", position: 1 },
  { id: 5, parentId: null, dealId: null, name: "Jotta", position: 1 },
];

test("contagem sobe da folha ate a raiz e ignora entregues", () => {
  const demands = [
    demand({ folderId: 3, status: "todo" }),
    demand({ folderId: 3, status: "in_progress" }),
    demand({ folderId: 3, status: "done" }),
    demand({ folderId: 4, status: "review" }),
    demand({ folderId: 1, status: "todo" }),
  ];

  const nodes = buildDemandTree(folders, demands);
  assert.equal(findDemandTreeNode(nodes, "folder:3")?.openCount, 2);
  assert.equal(findDemandTreeNode(nodes, "folder:2")?.openCount, 2);
  assert.equal(findDemandTreeNode(nodes, "folder:4")?.openCount, 1);
  // BFT soma a propria demanda + Social Media (2) + Midia Paga (1).
  assert.equal(findDemandTreeNode(nodes, "folder:1")?.openCount, 4);
  assert.equal(findDemandTreeNode(nodes, "folder:5")?.openCount, 0);
});

test("selecionar pasta intermediaria traz as demandas dela e das descendentes", () => {
  const demands = [
    demand({ folderId: 1 }),
    demand({ folderId: 2 }),
    demand({ folderId: 3 }),
    demand({ folderId: 4 }),
    demand({ folderId: null }),
  ];
  const nodes = buildDemandTree(folders, demands);

  assert.deepEqual(folderSubtreeIds(findDemandTreeNode(nodes, "folder:2")!), [2, 3]);
  assert.equal(selectDemandsForNode(demands, findDemandTreeNode(nodes, "folder:2")).length, 2);
  // A raiz varre tudo que esta abaixo dela.
  assert.equal(selectDemandsForNode(demands, findDemandTreeNode(nodes, "folder:1")).length, 4);
  assert.equal(selectDemandsForNode(demands, findDemandTreeNode(nodes, "folder:3")).length, 1);
  assert.equal(selectDemandsForNode(demands, null).length, 5);
});

test("demanda sem pasta cai no no virtual, agrupada por cliente", () => {
  const demands = [
    demand({ folderId: 3 }),
    demand({ folderId: null, dealId: 7, deal: { id: 7, company: "METALTHEC" } }),
    demand({ folderId: null, dealId: 7, deal: { id: 7, company: "METALTHEC" } }),
  ];

  const nodes = buildDemandTree(folders, demands);
  const unfiled = findDemandTreeNode(nodes, "unfiled");
  assert.equal(unfiled?.openCount, 2);
  assert.equal(unfiled?.children[0].label, "METALTHEC");

  const scoped = selectDemandsForNode(demands, unfiled);
  assert.equal(scoped.length, 2);
  assert.ok(scoped.every((item) => item.folderId === null));
});

test("cada no carrega os ids que cobre, para arrastar e excluir em lote", () => {
  const naPasta = demand({ folderId: 3 });
  const naRaiz = demand({ folderId: 1 });
  const soltas = [
    demand({ folderId: null, dealId: 7, deal: { id: 7, company: "METALTHEC" } }),
    demand({ folderId: null, dealId: 7, deal: { id: 7, company: "METALTHEC" } }),
  ];
  const nodes = buildDemandTree(folders, [naPasta, naRaiz, ...soltas]);

  // O grupo do cliente em "Sem pasta" entrega os ids das demandas dele.
  const grupo = findDemandTreeNode(nodes, "unfiled-client:7");
  assert.deepEqual(grupo?.demandIds, soltas.map((item) => item.id));

  // A raiz cobre a propria demanda mais a da neta.
  const bft = findDemandTreeNode(nodes, "folder:1");
  assert.deepEqual([...(bft?.demandIds ?? [])].sort((a, b) => a - b), [naPasta.id, naRaiz.id].sort((a, b) => a - b));
  assert.deepEqual(findDemandTreeNode(nodes, "folder:5")?.demandIds, []);
});

test("nao deixa mover uma pasta para dentro dela mesma ou de uma descendente", () => {
  assert.equal(isDescendantFolder(folders, 1, 1), true, "a propria pasta e alvo invalido");
  assert.equal(isDescendantFolder(folders, 2, 1), true, "filha e alvo invalido");
  assert.equal(isDescendantFolder(folders, 3, 1), true, "neta e alvo invalido");
  assert.equal(isDescendantFolder(folders, 5, 1), false, "outra raiz e alvo valido");
  assert.equal(isDescendantFolder(folders, 1, 3), false, "subir a pasta e valido");
  assert.equal(isDescendantFolder(folders, null, 1), false, "voltar para raiz e valido");
});

test("caminho e rotulos de select mostram a hierarquia inteira", () => {
  const nodes = buildDemandTree(folders, [demand({ folderId: 3 })]);
  assert.deepEqual(demandTreePath(nodes, "folder:3").map((node) => node.label), ["BFT", "Social Media", "Agosto"]);

  const options = flattenFolderOptions(folders);
  assert.ok(options.some((option) => option.id === 3 && option.label === "BFT / Social Media / Agosto"));
  assert.ok(options.some((option) => option.id === 1 && option.label === "BFT"));
});

test("busca sem acento acha o no e preserva o ancestral", () => {
  const acentuada: DemandFolder[] = [
    { id: 1, parentId: null, dealId: null, name: "BFT", position: 0 },
    { id: 2, parentId: 1, dealId: null, name: "Manutencao Predial", position: 0 },
  ];
  const filtered = filterDemandTree(buildDemandTree(acentuada, []), "manutencao");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].children[0].label, "Manutencao Predial");
  assert.equal(filterDemandTree(buildDemandTree(folders, []), "inexistente").length, 0);
});

test("arvore sobrevive a um ciclo em dado corrompido", () => {
  const ciclo: DemandFolder[] = [
    { id: 1, parentId: 2, dealId: null, name: "A", position: 0 },
    { id: 2, parentId: 1, dealId: null, name: "B", position: 0 },
    { id: 3, parentId: null, dealId: null, name: "Raiz", position: 0 },
  ];
  const nodes = buildDemandTree(ciclo, []);
  assert.deepEqual(nodes.map((node) => node.label), ["Raiz"]);
});

test("overview separa atrasadas, dias da janela, sem prazo e o que fica alem", () => {
  const now = new Date("2026-08-21T15:00:00-03:00");
  const demands = [
    demand({ dueAt: due("2026-08-18"), title: "Atrasada" }),
    demand({ dueAt: due("2026-08-21"), title: "Hoje" }),
    demand({ dueAt: due("2026-08-22"), title: "Amanha" }),
    demand({ dueAt: due("2026-08-25"), title: "Dentro da janela" }),
    demand({ dueAt: due("2026-09-10"), title: "Fora da janela" }),
    demand({ dueAt: null, title: "Sem prazo" }),
  ];

  const overview = buildDemandOverview(demands, { windowDays: 7, now });

  assert.equal(overview.overdue.length, 1);
  assert.equal(overview.noDue.length, 1);
  assert.equal(overview.beyondWindow, 1);
  assert.deepEqual(overview.days.map((day) => day.dateKey), ["2026-08-21", "2026-08-22", "2026-08-25"]);
  assert.equal(overview.days[0].weekday, "Hoje");
  assert.equal(overview.days[1].weekday, "Amanha");
  assert.equal(overview.days[0].dateLabel, "21 ago");
  assert.equal(overview.scheduledTotal, 4);
});

test("janela maior recupera o que estava alem dela", () => {
  const now = new Date("2026-08-21T15:00:00-03:00");
  const demands = [demand({ dueAt: due("2026-09-10") })];

  assert.equal(buildDemandOverview(demands, { windowDays: 7, now }).beyondWindow, 1);
  assert.equal(buildDemandOverview(demands, { windowDays: 30, now }).days.length, 1);
  assert.equal(buildDemandOverview(demands, { windowDays: 30, now }).beyondWindow, 0);
});

test("prazo no fim do dia em Sao Paulo nao vaza para o dia seguinte", () => {
  // 2026-08-21T23:59:59-03:00 e 2026-08-22T02:59:59Z: agrupar em UTC quebraria aqui.
  const overview = buildDemandOverview(
    [demand({ dueAt: due("2026-08-21") })],
    { windowDays: 7, now: new Date("2026-08-21T15:00:00-03:00") },
  );
  assert.equal(overview.days.length, 1);
  assert.equal(overview.days[0].dateKey, "2026-08-21");
  assert.equal(overview.overdue.length, 0);
});

test("migration troca a hierarquia fixa pela arvore sem perder demanda", () => {
  const migration = source("scripts/migrations/20260822_demand_folder_tree.sql");
  const schema = source("scripts/supabase-schema.sql");

  // A trava impede derrubar a estrutura antiga com demanda arquivada dentro dela.
  assert.match(migration, /raise exception/i);
  assert.match(migration, /where list_id is not null/i);
  assert.doesNotMatch(migration, /drop table[^;]*client_demands/i);

  for (const sql of [migration, schema]) {
    assert.match(sql, /parent_id bigint references public\.demand_folders\(id\) on delete cascade/i);
    assert.match(sql, /deal_id integer references public\.deals\(id\) on delete set null/i);
    assert.match(sql, /folder_id bigint references public\.demand_folders\(id\) on delete set null/i);
    assert.match(sql, /alter table public\.demand_folders enable row level security/i);
  }
  assert.doesNotMatch(migration, /create policy/i);
  // A estrutura de 3 niveis nao pode sobreviver no schema canonico.
  assert.doesNotMatch(schema, /create table if not exists public\.demand_spaces/i);
  assert.doesNotMatch(schema, /create table if not exists public\.demand_lists/i);
});

test("rota de pastas exige sessao admin, trava ciclo e nunca expoe service role", () => {
  const route = source("src/app/api/demand-folders/route.ts");
  assert.match(route, /requireDemandAdminSession/);
  assert.match(route, /getCrmSupabaseAdmin/);
  assert.match(route, /isDescendantFolder/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE|serviceRoleKey/);
  assert.doesNotMatch(route, /demand_spaces|demand_lists/);
});

test("API de demandas grava e limpa a pasta da demanda", () => {
  const route = source("src/app/api/demands/route.ts");
  assert.match(route, /folder_id: folderId/);
  assert.match(route, /assertDemandFolderExists/);
  assert.match(route, /updates\.folder_id = null/);
  assert.doesNotMatch(source("src/lib/demandServer.ts"), /demand_lists|demand_spaces/);
});

test("mapDemandFolder e idempotente e a pagina nao remapeia a resposta da rota", () => {
  const row = { id: 8, parent_id: 5, deal_id: 3, name: "Social Media", position: 2 };
  const once = mapDemandFolder(row);
  assert.deepEqual(once, { id: 8, parentId: 5, dealId: 3, name: "Social Media", position: 2 });
  // Aplicar duas vezes zerava parentId e dealId: toda pasta virava raiz na arvore.
  assert.deepEqual(mapDemandFolder(once), once);

  // A rota ja devolve o formato mapeado, entao o cliente le o corpo direto.
  const page = source("src/app/demandas/page.tsx");
  assert.match(page, /return body\.folders \?\? \[\]/);
  assert.doesNotMatch(page, /\.map\(mapDemandFolder\)/);
  assert.doesNotMatch(page, /import[\s\S]*?mapDemandFolder[\s\S]*?from "@\/lib\/demandFolders"/);
});

test("exclusao definitiva limpa o bucket antes de apagar, e o cancelar continua o padrao", () => {
  const route = source("src/app/api/demands/route.ts");
  // hard=1 apaga; sem ele o DELETE historico segue cancelando.
  assert.match(route, /searchParams\.get\("hard"\) === "1"/);
  assert.match(route, /demandIds/);
  assert.match(route, /DEMAND_ATTACHMENTS_BUCKET/);
  assert.match(route, /\.storage\.from\(DEMAND_ATTACHMENTS_BUCKET\)\.remove/);
  assert.match(route, /status: "cancelled"/);
  // A limpeza do storage precisa vir antes do delete, senao os paths somem no cascade.
  const purge = route.match(/async function purgeDemands[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(purge, "purgeDemands deve existir");
  assert.ok(purge.indexOf(".remove(") < purge.indexOf('.from("client_demands").delete()'));
});
