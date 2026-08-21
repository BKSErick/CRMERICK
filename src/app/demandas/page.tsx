"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DemandDialog, type DemandDialogState } from "@/components/DemandDialog";
import { DemandOverview } from "@/components/DemandOverview";
import { DemandTree } from "@/components/DemandTree";
import { DemandWorkspace } from "@/components/DemandWorkspace";
import {
  DEMAND_DESTINATIONS,
  DEMAND_DESTINATION_LABELS,
  DEMAND_PRIORITIES,
  DEMAND_PRIORITY_LABELS,
  buildDemandOverview,
  isClosedDemand,
  isEligibleDemandDeal,
  type ClientDemand,
  type DemandDestination,
  type DemandPriority,
  type DemandStatus,
} from "@/lib/clientDemands";
import {
  ALL_NODE_KEY,
  buildDemandTree,
  demandTreePath,
  findDemandTreeNode,
  flattenFolderOptions,
  isDescendantFolder,
  selectDemandsForNode,
  type DemandFolder,
} from "@/lib/demandFolders";

type DealOption = {
  id: number;
  company: string;
  name?: string | null;
  stage?: string | null;
  status?: string | null;
};

function dueDateToIso(value: string) {
  return value ? new Date(`${value}T23:59:59-03:00`).toISOString() : null;
}

async function responseJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.error ?? fallback);
  return body as T;
}

async function fetchAllDemands() {
  const collected: ClientDemand[] = [];
  const limit = 200;
  let total = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < total; offset += limit) {
    const body = await responseJson<{ demands: ClientDemand[]; total: number }>(
      await fetch(`/api/demands?limit=${limit}&offset=${offset}`, { cache: "no-store" }),
      "Nao foi possivel carregar as demandas.",
    );
    collected.push(...(body.demands ?? []));
    total = Math.max(0, Number(body.total) || collected.length);
    if ((body.demands ?? []).length < limit) break;
  }
  return collected;
}

/**
 * A rota ja devolve DemandFolder pronto (ela roda mapDemandFolder no servidor).
 * Mapear de novo aqui zerava parentId e dealId, porque o mapper le snake_case e o
 * corpo ja vem em camelCase - toda pasta virava raiz na arvore.
 */
async function fetchFolders(): Promise<DemandFolder[]> {
  const body = await responseJson<{ folders: DemandFolder[] }>(
    await fetch("/api/demand-folders", { cache: "no-store" }),
    "Nao foi possivel carregar as pastas.",
  );
  return body.folders ?? [];
}

export default function DemandasPage() {
  const [demands, setDemands] = useState<ClientDemand[]>([]);
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [folders, setFolders] = useState<DemandFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [treeBusy, setTreeBusy] = useState(false);
  const [dialog, setDialog] = useState<DemandDialogState | null>(null);

  const [selectedKey, setSelectedKey] = useState<string>(ALL_NODE_KEY);
  const [windowDays, setWindowDays] = useState(7);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<DemandStatus[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [query, setQuery] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedDemandId, setSelectedDemandId] = useState<number | null>(null);
  const [savedScrollY, setSavedScrollY] = useState(0);
  const [newDemand, setNewDemand] = useState({
    dealId: "",
    folderId: "",
    title: "",
    dueDate: "",
    priority: "normal" as DemandPriority,
    assignee: "",
    destinationType: "other" as DemandDestination,
    destinationLabel: "",
  });

  const loadDemands = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDemands(await fetchAllDemands());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([fetchAllDemands(), fetchFolders()])
      .then(([items, folderRows]) => {
        if (!active) return;
        setDemands(items);
        setFolders(folderRows);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    fetch("/api/deals", { cache: "no-store" })
      .then((response) => responseJson<{ deals: DealOption[] }>(response, "Nao foi possivel carregar clientes."))
      .then((body) => {
        if (active) setDeals((body.deals ?? []).filter(isEligibleDemandDeal));
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      });

    const id = Number(new URLSearchParams(window.location.search).get("demandId"));
    if (Number.isInteger(id) && id > 0) {
      window.setTimeout(() => {
        if (active) setSelectedDemandId(id);
      }, 0);
    }
    return () => { active = false; };
  }, []);

  const treeNodes = useMemo(() => buildDemandTree(folders, demands), [demands, folders]);
  const selectedNode = useMemo(() => findDemandTreeNode(treeNodes, selectedKey), [selectedKey, treeNodes]);
  const path = useMemo(() => demandTreePath(treeNodes, selectedKey), [selectedKey, treeNodes]);
  const totalOpen = useMemo(() => demands.filter((demand) => !isClosedDemand(demand)).length, [demands]);
  const folderOptions = useMemo(() => flattenFolderOptions(folders), [folders]);
  const dealOptions = useMemo(
    () => deals.map((deal) => ({ id: deal.id, label: deal.company || deal.name || `Deal #${deal.id}` })),
    [deals],
  );

  const scoped = useMemo(() => selectDemandsForNode(demands, selectedNode), [demands, selectedNode]);

  const assignees = useMemo(
    () => Array.from(new Set(scoped.map((demand) => demand.assignee).filter(Boolean))).sort(),
    [scoped],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return scoped.filter((demand) => {
      const closed = isClosedDemand(demand);
      if (closed && !showCompleted) return false;
      if (!closed && selectedStatuses.length > 0 && !selectedStatuses.includes(demand.status)) return false;
      if (selectedAssignees.length > 0 && !selectedAssignees.includes(demand.assignee)) return false;
      if (!normalizedQuery) return true;
      const haystack = `${demand.title} ${demand.deal?.company ?? ""} ${demand.destinationLabel} ${demand.assignee}`
        .toLocaleLowerCase("pt-BR");
      return haystack.includes(normalizedQuery);
    });
  }, [query, scoped, selectedAssignees, selectedStatuses, showCompleted]);

  const overview = useMemo(() => buildDemandOverview(filtered, { windowDays }), [filtered, windowDays]);

  function openDemand(id: number) {
    setSavedScrollY(window.scrollY);
    setSelectedDemandId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("demandId", String(id));
    window.history.replaceState({}, "", url);
  }

  function closeDemand() {
    setSelectedDemandId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("demandId");
    window.history.replaceState({}, "", url);
    window.setTimeout(() => window.scrollTo({ top: savedScrollY }), 0);
  }

  function toggleAssignee(name: string) {
    setSelectedAssignees((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  }

  function toggleStatus(status: DemandStatus) {
    setSelectedStatuses((current) => current.includes(status) ? current.filter((item) => item !== status) : [...current, status]);
  }

  /** Devolve o corpo da resposta (truthy) ou null no erro, para quem precisa do id criado. */
  async function mutate<T = unknown>(url: string, init: RequestInit, fallback: string, successNotice?: string) {
    setTreeBusy(true);
    setError(null);
    try {
      const body = await responseJson<T>(await fetch(url, init), fallback);
      const [items, folderRows] = await Promise.all([fetchAllDemands(), fetchFolders()]);
      setDemands(items);
      setFolders(folderRows);
      if (successNotice) setNotice(successNotice);
      return body;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      setTreeBusy(false);
    }
  }

  const jsonInit = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  /** Caminho completo da pasta ("BFT / Social Media"), para dizer onde a coisa caiu. */
  function folderPathLabel(id: number | null) {
    if (id == null) return null;
    return folderOptions.find((option) => option.id === id)?.label ?? null;
  }

  function createFolder(parentId: number | null) {
    const isRoot = parentId === null;
    const parentLabel = folderPathLabel(parentId);
    setDialog({
      mode: "prompt",
      title: isRoot ? "Nova pasta de cliente" : `Nova subpasta em ${parentLabel ?? "pasta"}`,
      label: "Nome",
      placeholder: isRoot ? "Ex.: BFT" : "Ex.: Social Media",
      confirmLabel: "Criar",
      select: isRoot
        ? { label: "Cliente (opcional)", options: dealOptions, emptyLabel: "Sem vinculo com deal" }
        : undefined,
      onConfirm: (name, dealId) => {
        void mutate<{ folder?: DemandFolder }>(
          "/api/demand-folders",
          jsonInit("POST", { name, parentId, dealId: dealId || null }),
          "Nao foi possivel criar a pasta.",
          parentLabel ? `Pasta ${name} criada dentro de ${parentLabel}.` : `Pasta ${name} criada.`,
        ).then((body) => {
          // Selecionar a pasta nova mostra o caminho completo dela no painel da direita.
          const id = body?.folder?.id;
          if (id) setSelectedKey(`folder:${id}`);
        });
      },
    });
  }

  function renameFolder(id: number, currentName: string) {
    setDialog({
      mode: "prompt",
      title: "Renomear pasta",
      label: "Nome",
      defaultValue: currentName,
      confirmLabel: "Salvar",
      onConfirm: (name) => {
        if (name === currentName) return;
        void mutate("/api/demand-folders", jsonInit("PATCH", { id, name }), "Nao foi possivel renomear.");
      },
    });
  }

  function deleteFolder(id: number, currentName: string) {
    setDialog({
      mode: "confirm",
      title: `Excluir ${currentName}?`,
      message: "As subpastas somem junto. As demandas nao sao apagadas: elas voltam para Sem pasta.",
      confirmLabel: "Excluir",
      destructive: true,
      onConfirm: () => {
        void mutate(`/api/demand-folders?id=${id}`, { method: "DELETE" }, "Nao foi possivel excluir.")
          .then((ok) => { if (ok) setSelectedKey(ALL_NODE_KEY); });
      },
    });
  }

  function moveDemands(demandIds: number[], folderId: number | null) {
    if (demandIds.length === 0) return;
    void (async () => {
      setTreeBusy(true);
      setError(null);
      try {
        for (const id of demandIds) {
          await responseJson(
            await fetch("/api/demands", jsonInit("PATCH", { id, folderId })),
            "Nao foi possivel mover a demanda.",
          );
        }
        const [items, folderRows] = await Promise.all([fetchAllDemands(), fetchFolders()]);
        setDemands(items);
        setFolders(folderRows);
        if (demandIds.length > 1) setNotice(`${demandIds.length} demandas movidas.`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setTreeBusy(false);
      }
    })();
  }

  function deleteDemands(demandIds: number[], label: string) {
    if (demandIds.length === 0) return;
    const many = demandIds.length > 1;
    setDialog({
      mode: "confirm",
      title: many ? `Excluir ${demandIds.length} demandas de ${label}?` : `Excluir ${label}?`,
      message: many
        ? "As demandas somem de vez, junto com checklist, links, anexos e historico. Nao tem como desfazer."
        : "A demanda some de vez, junto com checklist, links, anexos e historico. Nao tem como desfazer.",
      confirmLabel: "Excluir de vez",
      destructive: true,
      onConfirm: () => {
        void mutate(
          `/api/demands?hard=1&demandIds=${demandIds.join(",")}`,
          { method: "DELETE" },
          "Nao foi possivel excluir.",
          many ? `${demandIds.length} demandas excluidas.` : "Demanda excluida.",
        );
      },
    });
  }

  /** Mover pela lista de destinos, com o caminho escrito por extenso ("BFT / Social Media"). */
  function promptMoveFolder(id: number, currentName: string) {
    const current = folders.find((folder) => folder.id === id);
    setDialog({
      mode: "select",
      title: `Mover ${currentName} para`,
      label: "Pasta de destino",
      // Uma pasta nao pode entrar nela mesma nem em uma descendente: viraria ciclo.
      options: folderOptions.filter((option) => !isDescendantFolder(folders, option.id, id)),
      emptyLabel: "Topo (pasta de cliente)",
      defaultValue: current?.parentId ? String(current.parentId) : "",
      confirmLabel: "Mover",
      onConfirm: (value) => moveFolder(id, value ? Number(value) : null),
    });
  }

  function moveFolder(folderId: number, parentId: number | null) {
    const name = folders.find((folder) => folder.id === folderId)?.name ?? "Pasta";
    const target = folderPathLabel(parentId);
    void mutate(
      "/api/demand-folders",
      jsonInit("PATCH", { id: folderId, parentId }),
      "Nao foi possivel mover a pasta.",
      target ? `${name} agora esta dentro de ${target}.` : `${name} voltou para o topo.`,
    );
  }

  function startCreateDemand() {
    setShowCreate((current) => {
      const next = !current;
      if (next && selectedNode?.kind === "folder" && selectedNode.id) {
        setNewDemand((demand) => ({ ...demand, folderId: String(selectedNode.id) }));
      }
      return next;
    });
  }

  async function createDemand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const body = await responseJson<{ demand: ClientDemand }>(
        await fetch("/api/demands", jsonInit("POST", {
          dealId: Number(newDemand.dealId),
          folderId: newDemand.folderId ? Number(newDemand.folderId) : null,
          title: newDemand.title,
          dueAt: dueDateToIso(newDemand.dueDate),
          priority: newDemand.priority,
          assignee: newDemand.assignee,
          destinationType: newDemand.destinationType,
          destinationLabel: newDemand.destinationLabel,
        })),
        "Nao foi possivel criar a demanda.",
      );
      setDemands((current) => [body.demand, ...current]);
      setNewDemand({
        dealId: "", folderId: "", title: "", dueDate: "", priority: "normal",
        assignee: "", destinationType: "other", destinationLabel: "",
      });
      setShowCreate(false);
      setNotice("Demanda criada.");
      openDemand(body.demand.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="demands-page">
      <div className="demands-shell">
        <DemandTree
          busy={treeBusy}
          nodes={treeNodes}
          onCreateFolder={createFolder}
          onDeleteDemands={deleteDemands}
          onDeleteFolder={deleteFolder}
          onDropDemands={moveDemands}
          onDropFolder={moveFolder}
          onMoveFolder={promptMoveFolder}
          onRenameFolder={renameFolder}
          onSelect={setSelectedKey}
          selectedKey={selectedKey}
          totalOpen={totalOpen}
        />

        <div className="demands-main">
          {notice ? (
            <div className="demands-notice ok">
              {notice}
              <button className="demands-notice-close" onClick={() => setNotice(null)} type="button" aria-label="Fechar aviso">{"×"}</button>
            </div>
          ) : null}
          {error ? (
            <div className="demands-notice">
              {error} <button className="topbar-btn" onClick={() => void loadDemands()} type="button">Tentar novamente</button>
            </div>
          ) : null}

          {showCreate ? (
            <form className="card demand-create-panel" onSubmit={createDemand}>
              <div className="card-header demand-create-heading">
                <div>
                  <div className="card-title">Nova demanda</div>
                  <div className="muted-copy">Selecione um cliente ganho e registre o trabalho.</div>
                </div>
              </div>
              <label>Cliente
                <select required value={newDemand.dealId} onChange={(event) => setNewDemand((current) => ({ ...current, dealId: event.target.value }))}>
                  <option value="">Selecione o deal</option>
                  {deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.company || deal.name || `Deal #${deal.id}`}</option>)}
                </select>
              </label>
              <label>Pasta
                <select value={newDemand.folderId} onChange={(event) => setNewDemand((current) => ({ ...current, folderId: event.target.value }))}>
                  <option value="">Sem pasta</option>
                  {folderOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <label className="demand-create-title">Demanda
                <input required maxLength={240} placeholder="Ex.: Revisar copy da campanha" value={newDemand.title} onChange={(event) => setNewDemand((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label>Prazo
                <input required type="date" value={newDemand.dueDate} onChange={(event) => setNewDemand((current) => ({ ...current, dueDate: event.target.value }))} />
              </label>
              <label>Prioridade
                <select value={newDemand.priority} onChange={(event) => setNewDemand((current) => ({ ...current, priority: event.target.value as DemandPriority }))}>
                  {DEMAND_PRIORITIES.map((priority) => <option key={priority} value={priority}>{DEMAND_PRIORITY_LABELS[priority]}</option>)}
                </select>
              </label>
              <label>Responsavel
                <input required maxLength={160} placeholder="Erick" value={newDemand.assignee} onChange={(event) => setNewDemand((current) => ({ ...current, assignee: event.target.value }))} />
              </label>
              <label>Destino
                <select value={newDemand.destinationType} onChange={(event) => setNewDemand((current) => ({ ...current, destinationType: event.target.value as DemandDestination }))}>
                  {DEMAND_DESTINATIONS.map((destination) => <option key={destination} value={destination}>{DEMAND_DESTINATION_LABELS[destination]}</option>)}
                </select>
              </label>
              <label>Onde vai estar
                <input required maxLength={240} placeholder="Ex.: Feed da Metalthec" value={newDemand.destinationLabel} onChange={(event) => setNewDemand((current) => ({ ...current, destinationLabel: event.target.value }))} />
              </label>
              <button className="topbar-btn primary" disabled={creating || deals.length === 0} type="submit">
                {creating ? "Criando..." : "Criar e abrir"}
              </button>
            </form>
          ) : null}

          {loading ? <div className="card demands-empty">Carregando demandas reais...</div> : (
            <DemandOverview
              assignees={assignees}
              createLabel={showCreate ? "Fechar" : "+ Nova demanda"}
              onCreateDemand={startCreateDemand}
              onDeleteDemand={(demand) => deleteDemands([demand.id], demand.title)}
              onOpenDemand={openDemand}
              onQueryChange={setQuery}
              onShowCompletedChange={setShowCompleted}
              onToggleAssignee={toggleAssignee}
              onToggleStatus={toggleStatus}
              onWindowDaysChange={setWindowDays}
              overview={overview}
              path={path}
              query={query}
              selectedAssignees={selectedAssignees}
              selectedStatuses={selectedStatuses}
              showCompleted={showCompleted}
              windowDays={windowDays}
            />
          )}
        </div>
      </div>

      <DemandDialog onClose={() => setDialog(null)} state={dialog} />

      {selectedDemandId ? (
        <DemandWorkspace
          demandId={selectedDemandId}
          folderOptions={folderOptions}
          onChanged={() => void loadDemands()}
          onClose={closeDemand}
        />
      ) : null}
    </section>
  );
}
