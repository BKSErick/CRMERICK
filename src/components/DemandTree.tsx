"use client";

import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_NODE_KEY,
  filterDemandTree,
  folderSubtreeIds,
  type DemandTreeNode,
} from "@/lib/demandFolders";

export const DEMAND_DRAG_TYPE = "application/x-demand";
export const FOLDER_DRAG_TYPE = "application/x-demand-folder";

type DemandTreeProps = {
  nodes: DemandTreeNode[];
  totalOpen: number;
  selectedKey: string;
  busy: boolean;
  onSelect: (key: string) => void;
  onCreateFolder: (parentId: number | null) => void;
  onRenameFolder: (id: number, currentName: string) => void;
  /** Move por menu, sem depender de acertar o arrasto. */
  onMoveFolder: (id: number, currentName: string) => void;
  onDeleteFolder: (id: number, currentName: string) => void;
  onDropDemands: (demandIds: number[], folderId: number | null) => void;
  onDropFolder: (folderId: number, parentId: number | null) => void;
  onDeleteDemands: (demandIds: number[], label: string) => void;
};

/** Tamanho aproximado do painel de acoes (4 itens): decide o lado em que ele abre. */
const MENU_HEIGHT = 148;
const MENU_WIDTH = 156;

function payloadType(event: DragEvent) {
  const types = Array.from(event.dataTransfer.types);
  if (types.includes(DEMAND_DRAG_TYPE)) return DEMAND_DRAG_TYPE;
  if (types.includes(FOLDER_DRAG_TYPE)) return FOLDER_DRAG_TYPE;
  return null;
}

export function DemandTree({
  nodes,
  totalOpen,
  selectedKey,
  busy,
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onDropDemands,
  onDropFolder,
  onDeleteDemands,
}: DemandTreeProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [draggingFolder, setDraggingFolder] = useState<DemandTreeNode | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ key: string; top: number; left: number } | null>(null);
  const bodyRef = useRef<HTMLElement>(null);

  const visible = useMemo(() => filterDemandTree(nodes, query), [nodes, query]);
  const searching = query.trim().length > 0;

  // Fecha o menu de acoes no clique fora e no Esc. O listener so existe com menu aberto.
  useEffect(() => {
    if (!menu) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".demand-tree-menu, .demand-tree-menu-btn")) return;
      setMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    function onScroll() {
      setMenu(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    // Painel fixo nao acompanha rolagem: fecha em vez de ficar solto na tela.
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menu]);

  /**
   * O painel e fixo na viewport, nao absoluto dentro da lista: a lista rola com
   * overflow-y e recortava o menu quando ele abria para cima em uma linha do rodape.
   */
  function openMenu(key: string, button: HTMLElement) {
    if (menu?.key === key) {
      setMenu(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const abreParaCima = rect.bottom + MENU_HEIGHT > window.innerHeight;
    const top = abreParaCima
      ? Math.max(8, rect.top - MENU_HEIGHT)
      : Math.min(rect.bottom + 4, window.innerHeight - MENU_HEIGHT - 8);
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setMenu({ key, top, left });
  }

  function runMenuAction(action: () => void) {
    setMenu(null);
    action();
  }

  /** Cria subpasta ja abrindo a pasta pai, senao a nova entra escondida. */
  function createSubfolder(node: DemandTreeNode) {
    if (node.id == null) return;
    setCollapsed((current) => current.filter((item) => item !== node.key));
    onCreateFolder(node.id);
  }

  // Enquanto arrasta uma pasta, a propria subarvore dela deixa de ser alvo valido.
  const blockedIds = useMemo(
    () => new Set(draggingFolder ? folderSubtreeIds(draggingFolder) : []),
    [draggingFolder],
  );

  function toggle(key: string) {
    setCollapsed((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function accepts(node: DemandTreeNode | null, type: string | null) {
    if (!type) return false;
    if (type === DEMAND_DRAG_TYPE) {
      // Demanda vai para uma pasta ou volta para "Sem pasta".
      return !node || node.kind === "folder" || node.kind === "unfiled";
    }
    if (!node) return true; // area vazia da arvore: promove a pasta para raiz
    if (node.kind !== "folder" || node.id == null) return false;
    return !blockedIds.has(node.id);
  }

  function handleDragOver(node: DemandTreeNode | null, event: DragEvent) {
    const type = payloadType(event);
    if (!accepts(node, type)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverKey(node?.key ?? "root");
  }

  function handleDrop(node: DemandTreeNode | null, event: DragEvent) {
    const type = payloadType(event);
    setDragOverKey(null);
    if (!accepts(node, type)) return;
    event.preventDefault();
    event.stopPropagation();
    const raw = event.dataTransfer.getData(type as string);
    const target = node?.kind === "folder" ? node.id : null;
    if (type === DEMAND_DRAG_TYPE) {
      // O payload e uma lista: uma linha arrastada manda um id, um grupo manda varios.
      const ids = raw.split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0);
      if (ids.length > 0) onDropDemands(ids, target);
      return;
    }
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0) onDropFolder(id, target);
  }

  /**
   * O botao do nome cobre quase toda a linha, entao o arrasto tambem comeca por ele:
   * so o <div> da linha ser draggable deixava o gesto sem pegada util.
   */
  function beginDrag(node: DemandTreeNode, event: DragEvent) {
    const isFolder = node.kind === "folder" && node.id != null;
    const isGroup = node.kind === "unfiled_client" && node.demandIds.length > 0;
    if (isGroup) {
      event.stopPropagation();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(DEMAND_DRAG_TYPE, node.demandIds.join(","));
      return;
    }
    if (!isFolder) return;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(FOLDER_DRAG_TYPE, String(node.id));
    setDraggingFolder(node);
  }

  /** Icone de pasta: marca o que e pasta de verdade e mantem a coluna alinhada nos outros nos. */
  function folderIcon(isFolder: boolean) {
    return (
      <span aria-hidden="true" className="demand-tree-icon">
        {isFolder ? (
          <svg viewBox="0 0 16 16" width="13" height="13">
            <path
              d="M1.8 3.4h4l1.3 1.7h7.1c.4 0 .8.3.8.8v6.1c0 .4-.4.8-.8.8H1.8c-.4 0-.8-.4-.8-.8V4.2c0-.5.4-.8.8-.8z"
              fill="currentColor"
            />
          </svg>
        ) : null}
      </span>
    );
  }

  function renderNode(node: DemandTreeNode) {
    const hasChildren = node.children.length > 0;
    const open = searching || !collapsed.includes(node.key);
    const isFolder = node.kind === "folder" && node.id != null;
    // O grupo de um cliente em "Sem pasta" arrasta e apaga as demandas dele de uma vez.
    const isGroup = node.kind === "unfiled_client" && node.demandIds.length > 0;

    return (
      <li key={node.key}>
        <div
          className={`demand-tree-row ${selectedKey === node.key ? "active" : ""} ${dragOverKey === node.key ? "drag-over" : ""}`}
          draggable={isFolder || isGroup}
          onDragEnd={() => { setDraggingFolder(null); setDragOverKey(null); }}
          onDragLeave={() => setDragOverKey((current) => current === node.key ? null : current)}
          onDragOver={(event) => handleDragOver(node, event)}
          onDragStart={(event) => beginDrag(node, event)}
          onDrop={(event) => handleDrop(node, event)}
        >
          <button
            aria-expanded={hasChildren ? open : undefined}
            aria-label={hasChildren ? `${open ? "Recolher" : "Expandir"} ${node.label}` : undefined}
            className={`demand-tree-toggle ${hasChildren ? "" : "empty"}`}
            disabled={!hasChildren}
            onClick={() => toggle(node.key)}
            type="button"
          >
            {/* A pasta guarda o chevron mesmo vazia: a coluna nao pula quando ganha subpasta. */}
            {hasChildren ? (open ? "▾" : "▸") : (isFolder ? "▸" : "")}
          </button>
          {folderIcon(isFolder)}
          <button
            className="demand-tree-label"
            draggable={isFolder || isGroup}
            onClick={() => onSelect(node.key)}
            onDoubleClick={() => { if (isFolder && node.id) onRenameFolder(node.id, node.label); }}
            onDragStart={(event) => beginDrag(node, event)}
            title={isFolder ? `${node.label} (duplo clique renomeia)` : node.label}
            type="button"
          >
            {node.label}
          </button>
          {node.openCount > 0 ? <span className="demand-tree-count">{node.openCount}</span> : null}
          {isFolder ? (
            <>
              <button
                aria-expanded={menu?.key === node.key}
                aria-haspopup="menu"
                aria-label={`Acoes de ${node.label}`}
                className="demand-tree-menu-btn"
                disabled={busy}
                onClick={(event) => openMenu(node.key, event.currentTarget)}
                title="Acoes da pasta"
                type="button"
              >
                {"⋯"}
              </button>
              {menu?.key === node.key ? (
                <div className="demand-tree-menu" role="menu" style={{ top: menu.top, left: menu.left }}>
                  <button
                    onClick={() => runMenuAction(() => createSubfolder(node))}
                    role="menuitem"
                    type="button"
                  >
                    + Nova subpasta
                  </button>
                  <button
                    onClick={() => runMenuAction(() => onRenameFolder(node.id as number, node.label))}
                    role="menuitem"
                    type="button"
                  >
                    Renomear
                  </button>
                  <button
                    onClick={() => runMenuAction(() => onMoveFolder(node.id as number, node.label))}
                    role="menuitem"
                    type="button"
                  >
                    Mover para...
                  </button>
                  <button
                    className="danger"
                    onClick={() => runMenuAction(() => onDeleteFolder(node.id as number, node.label))}
                    role="menuitem"
                    type="button"
                  >
                    Excluir
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
          {isGroup ? (
            <button
              aria-label={`Excluir as demandas de ${node.label}`}
              className="demand-tree-action danger"
              disabled={busy}
              onClick={() => onDeleteDemands(node.demandIds, node.label)}
              title={`Excluir ${node.demandIds.length} demanda(s)`}
              type="button"
            >
              {"×"}
            </button>
          ) : null}
        </div>
        {/* O recuo e a linha-guia vem do <ul> aninhado, nao de padding por nivel. */}
        {hasChildren && open ? <ul>{node.children.map((child) => renderNode(child))}</ul> : null}
      </li>
    );
  }

  return (
    <aside className="demand-tree" aria-label="Gestao de demandas">
      <div className="demand-tree-header">
        <div className="demand-tree-header-top">
          <div className="demand-tree-title">Gestao de demandas</div>
          <button
            aria-label="Nova pasta de cliente"
            className="demand-tree-add"
            disabled={busy}
            onClick={() => onCreateFolder(null)}
            title="Nova pasta de cliente"
            type="button"
          >
            +
          </button>
        </div>
        <label className="demand-tree-search">
          <span className="sr-only">Buscar pasta ou lista</span>
          <input
            placeholder="Buscar pasta ou lista"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <nav
        className={`demand-tree-body ${dragOverKey === "root" ? "drag-over" : ""}`}
        onDragLeave={() => setDragOverKey((current) => current === "root" ? null : current)}
        onDragOver={(event) => handleDragOver(null, event)}
        onDrop={(event) => handleDrop(null, event)}
        onScroll={() => setMenu(null)}
        ref={bodyRef}
      >
        <ul>
          <li>
            <div className={`demand-tree-row ${selectedKey === ALL_NODE_KEY ? "active" : ""}`}>
              <span className="demand-tree-toggle empty" aria-hidden="true" />
              {folderIcon(false)}
              <button className="demand-tree-label" onClick={() => onSelect(ALL_NODE_KEY)} type="button">
                Todas as demandas
              </button>
              {totalOpen > 0 ? <span className="demand-tree-count">{totalOpen}</span> : null}
            </div>
          </li>
          {visible.map((node) => renderNode(node))}
        </ul>
        {visible.length === 0 ? (
          <p className="demand-tree-empty">
            {searching
              ? "Nenhuma pasta com esse nome."
              : "Crie uma pasta de cliente para comecar a organizar."}
          </p>
        ) : null}
        <p className="demand-tree-hint">
          Arraste demandas e pastas entre os itens. Soltar na area vazia leva a pasta de volta ao topo.
        </p>
      </nav>

      <div className="demand-tree-footer">
        <button className="topbar-btn" disabled={busy} onClick={() => onCreateFolder(null)} type="button">
          + Nova pasta de cliente
        </button>
      </div>
    </aside>
  );
}
