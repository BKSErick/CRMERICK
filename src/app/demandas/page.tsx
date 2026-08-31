"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DemandDialog, type DemandDialogState } from "@/components/DemandDialog";
import { DemandOverview } from "@/components/DemandOverview";
import { DemandTree } from "@/components/DemandTree";
import { DemandWorkspace } from "@/components/DemandWorkspace";
import {
  DEMAND_BILLING_LABELS,
  DEMAND_BILLING_TYPES,
  MAX_DEMAND_INSTALLMENTS,
  DEMAND_DESTINATIONS,
  DEMAND_DESTINATION_LABELS,
  DEMAND_PRIORITIES,
  DEMAND_PRIORITY_LABELS,
  buildDemandOverview,
  currentMonthKey,
  isClosedDemand,
  type ClientDemand,
  type DemandBillingType,
  type DemandDestination,
  type DemandPriority,
  type DemandStatus,
} from "@/lib/clientDemands";
import { normalizeClientName, type ClientWithTotals } from "@/lib/clients";
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

function dueDateToIso(value: string) {
  return value ? new Date(`${value}T23:59:59-03:00`).toISOString() : null;
}

/** Competencia default da demanda nova: o mes do proprio prazo. */
function monthFromDueDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(0, 7) : "";
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
  const [clients, setClients] = useState<ClientWithTotals[]>([]);
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
  // Entregue nasce visivel: escondida por padrao, marcar "Entregue" fazia a demanda
  // sumir da lista, do contador da pasta e do total de uma vez so, e parecia bug de save.
  const [showCompleted, setShowCompleted] = useState(true);
  const [query, setQuery] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedDemandId, setSelectedDemandId] = useState<number | null>(null);
  const [savedScrollY, setSavedScrollY] = useState(0);
  const [newDemand, setNewDemand] = useState({
    clientId: "",
    folderId: "",
    title: "",
    dueDate: "",
    priority: "normal" as DemandPriority,
    assignee: "",
    destinationType: "other" as DemandDestination,
    destinationLabel: "",
    value: "",
    billingType: "one_off" as DemandBillingType,
    billingMonth: "",
    installments: "3",
  });

  /**
   * Recarrega a lista de clientes sob demanda. Existe porque a carga inicial acontece
   * uma vez so: se ela falhar (rota fora do ar, tabela recem-criada), o seletor de
   * cliente fica vazio para sempre ate um F5. Abrir o formulario tenta de novo.
   */
  const refreshClients = useCallback(async () => {
    try {
      const body = await responseJson<{ clients: ClientWithTotals[] }>(
        await fetch("/api/clients", { cache: "no-store" }),
        "Nao foi possivel carregar clientes.",
      );
      const rows = (body.clients ?? []).filter((client) => client.status !== "churned");
      setClients(rows);
      return rows;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return [];
    }
  }, []);

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

    // A lista de clientes ja absorve todo deal ganho (a rota sincroniza na leitura),
    // e ainda traz quem foi cadastrado na mao e nunca passou pelo pipeline.
    fetch("/api/clients", { cache: "no-store" })
      .then((response) => responseJson<{ clients: ClientWithTotals[] }>(response, "Nao foi possivel carregar clientes."))
      .then((body) => {
        if (active) setClients((body.clients ?? []).filter((client) => client.status !== "churned"));
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
  const clientOptions = useMemo(
    () => clients.map((client) => ({ id: client.id, label: client.name })),
    [clients],
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
        ? { label: "Cliente (opcional)", options: clientOptions, emptyLabel: "Sem vinculo com cliente" }
        : undefined,
      onConfirm: (name, clientId) => {
        // A pasta guarda o deal de origem; cliente cadastrado na mao nao tem deal e fica sem vinculo.
        const dealId = clients.find((client) => String(client.id) === clientId)?.dealId ?? null;
        void mutate<{ folder?: DemandFolder }>(
          "/api/demand-folders",
          jsonInit("POST", { name, parentId, dealId }),
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

  /**
   * A pasta raiz e o cliente. Criando a demanda de dentro dela, o cliente ja vem
   * escolhido - antes o formulario abria vazio e o submit travava no campo obrigatorio.
   * Tenta o deal vinculado a pasta, depois o que as demandas de la ja usam, depois o nome.
   */
  function clientIdForSelection() {
    const root = path[0];
    if (!root) return "";

    if (root.dealId) {
      const byDeal = clients.find((client) => client.dealId === root.dealId);
      if (byDeal) return String(byDeal.id);
    }

    const fromDemands = scoped.find((demand) => demand.clientId)?.clientId;
    if (fromDemands && clients.some((client) => client.id === fromDemands)) return String(fromDemands);

    const byName = clients.find((client) => normalizeClientName(client.name) === normalizeClientName(root.label));
    return byName ? String(byName.id) : "";
  }

  function startCreateDemand() {
    setShowCreate((current) => {
      const next = !current;
      if (next) {
        const folderId = selectedNode?.kind === "folder" && selectedNode.id ? String(selectedNode.id) : "";
        const clientId = clientIdForSelection();
        setNewDemand((demand) => ({
          ...demand,
          folderId: folderId || demand.folderId,
          clientId: clientId || demand.clientId,
        }));
        // Lista vazia quase sempre e carga inicial que falhou, nao ausencia de cliente.
        if (clients.length === 0) void refreshClients();
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
          clientId: Number(newDemand.clientId),
          folderId: newDemand.folderId ? Number(newDemand.folderId) : null,
          title: newDemand.title,
          dueAt: dueDateToIso(newDemand.dueDate),
          priority: newDemand.priority,
          assignee: newDemand.assignee,
          destinationType: newDemand.destinationType,
          destinationLabel: newDemand.destinationLabel,
          value: newDemand.value,
          billingType: newDemand.billingType,
          billingMonth: newDemand.billingMonth || monthFromDueDate(newDemand.dueDate) || currentMonthKey(),
        })),
        "Nao foi possivel criar a demanda.",
      );
      // O parcelamento nasce logo depois: as parcelas precisam do id da demanda.
      let created = body.demand;
      if (newDemand.billingType === "installment") {
        await responseJson(
          await fetch("/api/demands/charges", jsonInit("POST", {
            demandId: created.id,
            count: Number(newDemand.installments) || 1,
          })),
          "Demanda criada, mas nao consegui gerar as parcelas.",
        );
        const refreshed = await responseJson<{ demand: ClientDemand }>(
          await fetch(`/api/demands?demandId=${created.id}`, { cache: "no-store" }),
          "Nao foi possivel recarregar a demanda.",
        );
        created = refreshed.demand;
      }

      setDemands((current) => [created, ...current]);
      setNewDemand({
        clientId: "", folderId: "", title: "", dueDate: "", priority: "normal",
        assignee: "", destinationType: "other", destinationLabel: "",
        value: "", billingType: "one_off", billingMonth: "", installments: "3",
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
                <select required value={newDemand.clientId} onChange={(event) => setNewDemand((current) => ({ ...current, clientId: event.target.value }))}>
                  <option value="">Selecione o cliente</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
              </label>
              {!newDemand.clientId && path[0] && clients.length > 0 ? (
                <p className="muted-copy demand-create-title">
                  A pasta {path[0].label} ainda nao tem cliente no cadastro.{" "}
                  <Link href="/clientes">Cadastrar em Clientes</Link> e a demanda ja acha o dono sozinha.
                </p>
              ) : null}
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
              <label>Valor (R$)
                <input inputMode="decimal" min={0} placeholder="0,00" step="0.01" type="number" value={newDemand.value} onChange={(event) => setNewDemand((current) => ({ ...current, value: event.target.value }))} />
              </label>
              <label>Cobranca
                <select value={newDemand.billingType} onChange={(event) => setNewDemand((current) => ({ ...current, billingType: event.target.value as DemandBillingType }))}>
                  {DEMAND_BILLING_TYPES.map((type) => <option key={type} value={type}>{DEMAND_BILLING_LABELS[type]}</option>)}
                </select>
              </label>
              {newDemand.billingType === "installment" ? (
                <label>Parcelas
                  <input
                    max={MAX_DEMAND_INSTALLMENTS}
                    min={1}
                    type="number"
                    value={newDemand.installments}
                    onChange={(event) => setNewDemand((current) => ({ ...current, installments: event.target.value }))}
                  />
                </label>
              ) : null}
              <label>{newDemand.billingType === "installment" ? "Mes da 1a parcela" : "Mes de cobranca"}
                <input
                  type="month"
                  value={newDemand.billingMonth || monthFromDueDate(newDemand.dueDate)}
                  onChange={(event) => setNewDemand((current) => ({ ...current, billingMonth: event.target.value }))}
                />
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
              <button className="topbar-btn primary" disabled={creating || clients.length === 0} type="submit">
                {creating ? "Criando..." : "Criar e abrir"}
              </button>
              {clients.length === 0 ? (
                <p className="muted-copy demand-create-title">
                  Nenhum cliente na lista. Feche um deal no pipeline, cadastre um em{" "}
                  <Link href="/clientes">Clientes</Link> ou{" "}
                  <button className="topbar-btn" onClick={() => void refreshClients()} type="button">tente carregar de novo</button>.
                </p>
              ) : null}
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
