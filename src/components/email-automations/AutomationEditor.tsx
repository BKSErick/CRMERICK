"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import {
  AUTOMATION_NODE_CATALOG,
  validateEmailAutomationGraph,
  type EmailAutomationGraph,
  type EmailAutomationNodeKind,
  type EmailAutomationSimulationResult,
} from "@/lib/emailAutomationGraph";
import type { EmailAutomationRow, EmailAutomationStatus } from "@/lib/emailAutomationRepository";
import { AutomationInspector } from "./AutomationInspector";
import { AutomationNode, type AutomationFlowNode } from "./AutomationNode";
import { AutomationPalette } from "./AutomationPalette";

type Props = {
  initialAutomation: EmailAutomationRow;
  onChanged: (automation: EmailAutomationRow) => void;
  onExit: () => void;
};

type ApiBody = {
  ok: boolean;
  error?: string;
  issues?: Array<{ message: string }>;
  automation?: EmailAutomationRow;
  result?: EmailAutomationSimulationResult;
  dispatch?: {
    dailyCap: number;
    usedBefore: number;
    sent: number;
    stopped: number;
    skipped: number;
    remaining: number;
    errors: string[];
  };
};

const nodeTypes = { automationNode: AutomationNode };

function statusLabel(status: EmailAutomationStatus) {
  if (status === "validated") return "Validada";
  if (status === "archived") return "Arquivada";
  return "Rascunho";
}

function AutomationEditorCanvas({ initialAutomation, onChanged, onExit }: Props) {
  const initialNodes = initialAutomation.graph.nodes as AutomationFlowNode[];
  const initialEdges = initialAutomation.graph.edges.map((edge) => ({
    ...edge,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: "#8d5c25" },
  })) as Edge[];
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<AutomationFlowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [viewport, setViewport] = useState<Viewport>(initialAutomation.graph.viewport);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [name, setName] = useState(initialAutomation.name);
  const [description, setDescription] = useState(initialAutomation.description);
  const [version, setVersion] = useState(initialAutomation.version);
  const [status, setStatus] = useState<EmailAutomationStatus>(initialAutomation.status);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"saving" | "testing" | "archiving" | "dispatching" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [showTest, setShowTest] = useState(false);
  const [testInput, setTestInput] = useState({
    contactName: "Ana Silva",
    contactEmail: "ana@empresa.com.br",
    company: "Empresa Exemplo",
    stage: "Proposta",
  });
  const [testResult, setTestResult] = useState<EmailAutomationSimulationResult | null>(null);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const hasTrigger = nodes.some((node) => node.data.kind.startsWith("trigger."));

  const graph = useCallback((): EmailAutomationGraph => ({
    nodes: nodes.map((node) => ({
      id: node.id,
      type: "automationNode",
      position: { x: node.position.x, y: node.position.y },
      data: {
        kind: node.data.kind,
        label: node.data.label,
        config: node.data.config ?? {},
      },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    })),
    viewport,
  }), [edges, nodes, viewport]);

  const onNodesChange = useCallback((changes: NodeChange<AutomationFlowNode>[]) => {
    if (changes.some((change) => change.type !== "select")) setDirty(true);
    onNodesChangeBase(changes);
  }, [onNodesChangeBase]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const target = nodes.find((node) => node.id === connection.target);
    if (target?.data.kind.startsWith("trigger.")) {
      setFeedback("Gatilhos iniciam o fluxo e nao recebem conexoes.");
      return;
    }
    setEdges((current) => addEdge({
      ...connection,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#8d5c25" },
    }, current));
    setDirty(true);
  }, [nodes, setEdges]);

  function addNode(kind: EmailAutomationNodeKind) {
    const item = AUTOMATION_NODE_CATALOG.find((candidate) => candidate.kind === kind);
    if (!item || item.locked || (item.category === "trigger" && hasTrigger)) return;
    const id = `node-${Date.now()}-${nodes.length + 1}`;
    const next: AutomationFlowNode = {
      id,
      type: "automationNode",
      position: { x: 140 + (nodes.length % 3) * 300, y: 140 + Math.floor(nodes.length / 3) * 210 },
      data: { kind: item.kind, label: item.label, config: { ...item.defaultConfig } },
    };
    setNodes((current) => [...current, next]);
    setSelectedNodeId(id);
    setDirty(true);
    setFeedback(null);
  }

  function updateNode(nodeId: string, changes: { label?: string; config?: Record<string, unknown> }) {
    setNodes((current) => current.map((node) => node.id === nodeId ? {
      ...node,
      data: {
        ...node.data,
        ...(changes.label !== undefined ? { label: changes.label } : {}),
        ...(changes.config !== undefined ? { config: changes.config } : {}),
      },
    } : node));
    setDirty(true);
  }

  function deleteNode(nodeId: string) {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNodeId(null);
    setDirty(true);
  }

  async function persist(nextStatus: EmailAutomationStatus = "draft") {
    const currentGraph = graph();
    const validation = validateEmailAutomationGraph(currentGraph);
    if (!validation.valid) {
      setIssues(validation.issues.map((issue) => issue.message));
      setFeedback("Corrija o fluxo antes de salvar.");
      return null;
    }
    if (!name.trim()) {
      setIssues(["Informe o nome da automacao."]);
      return null;
    }

    const response = await fetch(`/api/email-automations/${initialAutomation.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: nextStatus === "archived" ? "archive" : "save",
        expectedVersion: version,
        name: name.trim(),
        description,
        status: nextStatus,
        graph: currentGraph,
      }),
    });
    const body = await response.json() as ApiBody;
    if (!response.ok || !body.ok || !body.automation) throw new Error(body.error || "Nao foi possivel salvar.");
    setVersion(body.automation.version);
    setStatus(body.automation.status);
    setDirty(false);
    setIssues([]);
    onChanged(body.automation);
    return body.automation;
  }

  async function save() {
    setBusy("saving");
    setFeedback(null);
    try {
      await persist("draft");
      setFeedback("Rascunho salvo com uma nova versao.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Nao foi possivel salvar.");
    } finally {
      setBusy(null);
    }
  }

  async function runTest() {
    setBusy("testing");
    setFeedback(null);
    setTestResult(null);
    try {
      const saved = await persist("draft");
      if (!saved) return;
      const response = await fetch("/api/email-automations/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          automationId: saved.id,
          version: saved.version,
          graph: saved.graph,
          input: {
            contact: { name: testInput.contactName, email: testInput.contactEmail },
            deal: { company: testInput.company, stage: testInput.stage },
            email: { subject: "Pedido de informacoes" },
          },
        }),
      });
      const body = await response.json() as ApiBody;
      if (!body.result) throw new Error(body.error || "Nao foi possivel testar.");
      setTestResult(body.result);
      setIssues(body.result.issues.map((issue) => issue.message));
      setFeedback(body.result.status === "passed"
        ? "Teste concluido sem executar nenhuma acao real."
        : "O grafo nao passou na validacao.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Nao foi possivel testar.");
    } finally {
      setBusy(null);
    }
  }

  async function markValidated() {
    setBusy("saving");
    setFeedback(null);
    try {
      const saved = await persist("validated");
      if (saved) setFeedback("Fluxo validado para disparo manual. Nenhuma rotina automatica foi ligada.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Nao foi possivel validar.");
    } finally {
      setBusy(null);
    }
  }

  async function archive() {
    if (!window.confirm("Arquivar esta automacao? O historico sera preservado.")) return;
    setBusy("archiving");
    setFeedback(null);
    try {
      const saved = await persist("archived");
      if (saved) onExit();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Nao foi possivel arquivar.");
    } finally {
      setBusy(null);
    }
  }

  async function dispatchToday() {
    if (status !== "validated" || dirty) return;
    const confirmed = window.confirm(
      "Enviar o lote de hoje agora? O CRM prioriza follow-ups vencidos, completa com novos contatos e respeita o limite diario.",
    );
    if (!confirmed) return;
    setBusy("dispatching");
    setFeedback(null);
    setIssues([]);
    try {
      const response = await fetch(`/api/email-automations/${initialAutomation.id}/dispatch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmed: true, expectedVersion: version }),
      });
      const body = await response.json() as ApiBody;
      if (!body.dispatch) throw new Error(body.error || "Nao foi possivel executar o lote.");
      const summary = `${body.dispatch.sent} enviados · ${body.dispatch.stopped} interrompidos · ${body.dispatch.remaining} disponiveis hoje`;
      setFeedback(body.dispatch.errors.length ? `Lote interrompido com seguranca: ${summary}.` : `Lote concluido: ${summary}.`);
      setIssues(body.dispatch.errors);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Nao foi possivel executar o lote.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="automation-editor-page">
      <header className="automation-editor-header">
        <div className="automation-editor-identity">
          <span className="automation-editor-logo" aria-hidden="true">A</span>
          <div>
            <input
              aria-label="Nome da automacao"
              className="automation-name-input"
              maxLength={160}
              onChange={(event) => { setName(event.target.value); setDirty(true); }}
              value={name}
            />
            <input
              aria-label="Descricao da automacao"
              className="automation-description-input"
              maxLength={1000}
              onChange={(event) => { setDescription(event.target.value); setDirty(true); }}
              placeholder="Descricao opcional"
              value={description}
            />
          </div>
        </div>
        <div className="automation-editor-state">
          <span className={`automation-status ${status}`}>{statusLabel(status)}</span>
          <span className="automation-version">v{version}{dirty ? " · alterada" : ""}</span>
        </div>
        <div className="automation-editor-actions">
          <button className="automation-button subtle" disabled={Boolean(busy)} onClick={archive} type="button">Arquivar</button>
          <button className="automation-button" disabled={Boolean(busy)} onClick={() => setShowTest(true)} type="button">Testar</button>
          <button className="automation-button primary" disabled={Boolean(busy)} onClick={save} type="button">
            {busy === "saving" ? "Salvando..." : "Salvar"}
          </button>
          <button
            className="automation-button safe"
            disabled={Boolean(busy) || status !== "validated" || dirty}
            onClick={dispatchToday}
            title={status !== "validated" || dirty ? "Salve, teste e valide esta versao antes de enviar." : "Executar manualmente o lote diario"}
            type="button"
          >
            {busy === "dispatching" ? "Enviando lote..." : "Enviar lote de hoje"}
          </button>
          <button className="automation-button" disabled={Boolean(busy)} onClick={onExit} type="button">Sair do editor</button>
        </div>
      </header>

      {(feedback || issues.length > 0) ? (
        <div className={`automation-feedback ${issues.length ? "warning" : ""}`} role="status">
          <strong>{feedback}</strong>
          {issues.length ? <ul>{issues.slice(0, 5).map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
        </div>
      ) : null}

      <div className="automation-editor-shell">
        <AutomationPalette hasTrigger={hasTrigger} onAdd={addNode} />
        <div className="automation-canvas-column">
          <ReactFlow<AutomationFlowNode, Edge>
            colorMode="light"
            defaultViewport={initialAutomation.graph.viewport}
            edges={edges}
            fitView={nodes.length === 1}
            maxZoom={1.8}
            minZoom={0.35}
            nodeTypes={nodeTypes}
            nodes={nodes}
            onConnect={onConnect}
            onEdgesChange={(changes) => { onEdgesChange(changes); setDirty(true); }}
            onMoveEnd={(_event, nextViewport) => setViewport(nextViewport)}
            onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
            onNodesChange={onNodesChange}
            onPaneClick={() => setSelectedNodeId(null)}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#d8dbe7" gap={22} size={1.2} variant={BackgroundVariant.Dots} />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              maskColor="rgba(248, 249, 252, 0.72)"
              nodeColor={(node) => {
                const kind = (node as AutomationFlowNode).data.kind;
                const category = AUTOMATION_NODE_CATALOG.find((item) => item.kind === kind)?.category;
                return category === "trigger" ? "#e94383" : category === "rule" ? "#8d5c25" : "#1d9b8a";
              }}
              pannable
              position="bottom-right"
              zoomable
            />
          </ReactFlow>

          {showTest ? (
            <aside className="automation-test-drawer" aria-label="Testar automacao">
              <div className="automation-test-heading">
                <div><span>Modo seguro</span><h2>Testar automacao</h2></div>
                <button aria-label="Fechar teste" onClick={() => setShowTest(false)} type="button">×</button>
              </div>
              <p>Use dados ficticios para percorrer o grafo. Nada sera enviado ou executado.</p>
              <div className="automation-test-grid">
                <label><span>Contato</span><input onChange={(event) => setTestInput((value) => ({ ...value, contactName: event.target.value }))} value={testInput.contactName} /></label>
                <label><span>E-mail</span><input onChange={(event) => setTestInput((value) => ({ ...value, contactEmail: event.target.value }))} value={testInput.contactEmail} /></label>
                <label><span>Empresa</span><input onChange={(event) => setTestInput((value) => ({ ...value, company: event.target.value }))} value={testInput.company} /></label>
                <label><span>Etapa</span><input onChange={(event) => setTestInput((value) => ({ ...value, stage: event.target.value }))} value={testInput.stage} /></label>
              </div>
              <button className="automation-button primary wide" disabled={Boolean(busy)} onClick={runTest} type="button">
                {busy === "testing" ? "Simulando..." : "Executar simulacao"}
              </button>
              {testResult ? (
                <div className="automation-test-result">
                  <strong>{testResult.status === "passed" ? "Fluxo percorrido com sucesso" : "Fluxo invalido"}</strong>
                  <ol>
                    {testResult.trace.map((item) => (
                      <li className={item.status} key={item.nodeId}>
                        <span>{item.label}</span><small>{item.message}</small>
                      </li>
                    ))}
                  </ol>
                  {testResult.status === "passed" && status !== "validated" ? (
                    <button className="automation-button safe" disabled={Boolean(busy)} onClick={markValidated} type="button">Marcar como validada</button>
                  ) : null}
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>
        <AutomationInspector node={selectedNode} onChange={updateNode} onDelete={deleteNode} />
      </div>
    </section>
  );
}

export function AutomationEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <AutomationEditorCanvas {...props} />
    </ReactFlowProvider>
  );
}
