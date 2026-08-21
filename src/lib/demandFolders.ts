// Import relativo com extensao: os testes rodam em `node --test` sem o alias "@/",
// e o tsconfig ja liga allowImportingTsExtensions.
import { isClosedDemand, type ClientDemand, type DemandStatus } from "./clientDemands.ts";

export const UNFILED_NODE_KEY = "unfiled";
export const ALL_NODE_KEY = "all";

/**
 * Uma pasta e um no da arvore. Sem parentId ela e raiz - por convencao, o cliente.
 * A profundidade e livre e a demanda pode morar em qualquer nivel, nao so na folha.
 */
export type DemandFolder = {
  id: number;
  parentId: number | null;
  dealId: number | null;
  name: string;
  position: number;
};

export type DemandTreeNodeKind = "folder" | "all" | "unfiled" | "unfiled_client";

export type DemandTreeNode = {
  key: string;
  kind: DemandTreeNodeKind;
  id: number | null;
  label: string;
  /** Demandas abertas da propria pasta somadas as de toda a subarvore. */
  openCount: number;
  /** Ids de tudo que o no cobre - sustenta arrastar e excluir o grupo inteiro. */
  demandIds: number[];
  depth: number;
  dealId: number | null;
  children: DemandTreeNode[];
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Aceita a linha crua do banco (snake_case) e tambem uma pasta ja mapeada (camelCase),
 * para continuar idempotente: aplicar duas vezes zerava parentId e dealId, e a arvore
 * inteira desabava para a raiz.
 */
export function mapDemandFolder(value: unknown): DemandFolder {
  const row = asRecord(value);
  const id = asNumber(row.id);
  const parent = row.parent_id ?? row.parentId;
  const deal = row.deal_id ?? row.dealId;
  return {
    id,
    parentId: parent == null ? null : asNumber(parent),
    dealId: deal == null ? null : asNumber(deal),
    name: asString(row.name, `Pasta #${id}`),
    position: asNumber(row.position),
  };
}

function byPosition(left: DemandFolder, right: DemandFolder) {
  return left.position - right.position || left.id - right.id;
}

/** Monta a arvore de pastas e conta as demandas abertas de cada subarvore. */
export function buildDemandTree(folders: DemandFolder[], demands: ClientDemand[]): DemandTreeNode[] {
  const openByFolder = new Map<number, number>();
  const idsByFolder = new Map<number, number[]>();
  const unfiled: ClientDemand[] = [];
  for (const demand of demands) {
    if (demand.folderId == null) {
      unfiled.push(demand);
      continue;
    }
    const ids = idsByFolder.get(demand.folderId);
    if (ids) ids.push(demand.id);
    else idsByFolder.set(demand.folderId, [demand.id]);
    if (isClosedDemand(demand)) continue;
    openByFolder.set(demand.folderId, (openByFolder.get(demand.folderId) ?? 0) + 1);
  }

  const childrenOf = new Map<number | null, DemandFolder[]>();
  for (const folder of [...folders].sort(byPosition)) {
    const bucket = childrenOf.get(folder.parentId);
    if (bucket) bucket.push(folder);
    else childrenOf.set(folder.parentId, [folder]);
  }

  const seen = new Set<number>();
  function build(folder: DemandFolder, depth: number): DemandTreeNode {
    // Guarda contra ciclo em dado corrompido: uma pasta nunca se repete no caminho.
    seen.add(folder.id);
    const children = (childrenOf.get(folder.id) ?? [])
      .filter((child) => !seen.has(child.id))
      .map((child) => build(child, depth + 1));
    seen.delete(folder.id);
    return {
      key: `folder:${folder.id}`,
      kind: "folder",
      id: folder.id,
      label: folder.name,
      openCount: (openByFolder.get(folder.id) ?? 0) + children.reduce((total, node) => total + node.openCount, 0),
      demandIds: [...(idsByFolder.get(folder.id) ?? []), ...children.flatMap((node) => node.demandIds)],
      depth,
      dealId: folder.dealId,
      children,
    };
  }

  const nodes = (childrenOf.get(null) ?? []).map((folder) => build(folder, 0));

  if (unfiled.length > 0) {
    const byDeal = new Map<number, { label: string; demands: ClientDemand[] }>();
    for (const demand of unfiled) {
      const dealId = demand.dealId ?? 0;
      const entry = byDeal.get(dealId);
      if (entry) entry.demands.push(demand);
      else byDeal.set(dealId, { label: demand.deal?.company ?? "Cliente removido", demands: [demand] });
    }
    const countOpen = (items: ClientDemand[]) => items.filter((item) => !isClosedDemand(item)).length;
    nodes.push({
      key: UNFILED_NODE_KEY,
      kind: "unfiled",
      id: null,
      label: "Sem pasta",
      openCount: countOpen(unfiled),
      demandIds: unfiled.map((demand) => demand.id),
      depth: 0,
      dealId: null,
      children: Array.from(byDeal.entries())
        .sort((left, right) => left[1].label.localeCompare(right[1].label, "pt-BR"))
        .map(([dealId, entry]) => ({
          key: `unfiled-client:${dealId}`,
          kind: "unfiled_client" as const,
          id: null,
          label: entry.label,
          openCount: countOpen(entry.demands),
          demandIds: entry.demands.map((demand) => demand.id),
          depth: 1,
          dealId: dealId || null,
          children: [],
        })),
    });
  }

  return nodes;
}

export function findDemandTreeNode(nodes: DemandTreeNode[], key: string): DemandTreeNode | null {
  for (const node of nodes) {
    if (node.key === key) return node;
    const found = findDemandTreeNode(node.children, key);
    if (found) return found;
  }
  return null;
}

/** Caminho do no ate a raiz, usado no cabecalho ("BFT / Social Media / Agosto"). */
export function demandTreePath(nodes: DemandTreeNode[], key: string): DemandTreeNode[] {
  for (const node of nodes) {
    if (node.key === key) return [node];
    const rest = demandTreePath(node.children, key);
    if (rest.length > 0) return [node, ...rest];
  }
  return [];
}

/** Ids da pasta e de tudo abaixo dela. */
export function folderSubtreeIds(node: DemandTreeNode): number[] {
  const ids = node.id == null ? [] : [node.id];
  for (const child of node.children) ids.push(...folderSubtreeIds(child));
  return ids;
}

export function selectDemandsForNode(demands: ClientDemand[], node: DemandTreeNode | null) {
  if (!node || node.kind === "all") return demands;
  if (node.kind === "unfiled") return demands.filter((demand) => demand.folderId == null);
  if (node.kind === "unfiled_client") {
    return demands.filter((demand) => demand.folderId == null && (demand.dealId ?? 0) === (node.dealId ?? 0));
  }
  const allowed = new Set(folderSubtreeIds(node));
  return demands.filter((demand) => demand.folderId != null && allowed.has(demand.folderId));
}

/**
 * True quando candidateId esta dentro da subarvore de folderId (ou e a propria pasta).
 * Mover uma pasta para um desses alvos criaria um ciclo.
 */
export function isDescendantFolder(folders: DemandFolder[], candidateId: number | null, folderId: number) {
  if (candidateId == null) return false;
  if (candidateId === folderId) return true;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const visited = new Set<number>();
  let current = byId.get(candidateId)?.parentId ?? null;
  while (current != null && !visited.has(current)) {
    if (current === folderId) return true;
    visited.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

/** Rotulos "BFT / Social Media" para os selects de pasta. */
export function flattenFolderOptions(folders: DemandFolder[]) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  return folders
    .map((folder) => {
      const parts: string[] = [];
      const visited = new Set<number>();
      let current: DemandFolder | undefined = folder;
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        parts.unshift(current.name);
        current = current.parentId == null ? undefined : byId.get(current.parentId);
      }
      return { id: folder.id, label: parts.join(" / ") };
    })
    .sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));
}

// Faixa de acentos combinantes escrita por codigo para o arquivo ficar 100% ASCII.
const DIACRITICS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

function normalize(value: string) {
  return value.normalize("NFD").replace(DIACRITICS, "").toLocaleLowerCase("pt-BR");
}

/** Mantem o no que casa com a busca ou que tem descendente casando. */
export function filterDemandTree(nodes: DemandTreeNode[], query: string): DemandTreeNode[] {
  const needle = normalize(query.trim());
  if (!needle) return nodes;
  const result: DemandTreeNode[] = [];
  for (const node of nodes) {
    const children = filterDemandTree(node.children, query);
    const self = normalize(node.label).includes(needle);
    if (self || children.length > 0) {
      result.push({ ...node, children: self ? node.children : children });
    }
  }
  return result;
}

export function demandStatusCounts(demands: ClientDemand[]) {
  const counts = {} as Record<DemandStatus, number>;
  for (const demand of demands) counts[demand.status] = (counts[demand.status] ?? 0) + 1;
  return counts;
}
