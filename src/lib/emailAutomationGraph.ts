export type AutomationNodeCategory = "trigger" | "rule" | "action";

export type EmailAutomationNodeKind =
  | "trigger.contact_manual"
  | "trigger.contact_created"
  | "trigger.email_received"
  | "trigger.deal_stage_changed"
  | "rule.has_email"
  | "rule.stage_equals"
  | "rule.field_compare"
  | "action.wait"
  | "action.task_upsert"
  | "action.alert_create"
  | "action.email_draft"
  | "action.confirmation_request"
  | "action.email_send";

export type EmailAutomationNodeConfig = Record<string, unknown>;

export type EmailAutomationNode = {
  id: string;
  type: "automationNode";
  position: { x: number; y: number };
  data: {
    kind: EmailAutomationNodeKind;
    label: string;
    config: EmailAutomationNodeConfig;
  };
};

export type EmailAutomationEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type EmailAutomationGraph = {
  nodes: EmailAutomationNode[];
  edges: EmailAutomationEdge[];
  viewport: { x: number; y: number; zoom: number };
};

export type AutomationCatalogItem = {
  kind: EmailAutomationNodeKind;
  category: AutomationNodeCategory;
  label: string;
  description: string;
  locked?: boolean;
  defaultConfig: EmailAutomationNodeConfig;
};

export type EmailAutomationValidationIssue = {
  code:
    | "invalid_graph"
    | "duplicate_node_id"
    | "duplicate_edge_id"
    | "unsupported_node"
    | "locked_node"
    | "invalid_config"
    | "trigger_count"
    | "trigger_incoming_edge"
    | "invalid_edge"
    | "self_edge"
    | "cycle"
    | "unreachable_node";
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type EmailAutomationSimulationInput = {
  contact?: Record<string, unknown>;
  deal?: Record<string, unknown>;
  email?: Record<string, unknown>;
  event?: Record<string, unknown>;
  [key: string]: unknown;
};

export type EmailAutomationTraceItem = {
  nodeId: string;
  kind: EmailAutomationNodeKind;
  label: string;
  status: "simulated" | "condition_met" | "condition_not_met" | "skipped";
  message: string;
};

export type EmailAutomationSimulationResult = {
  status: "passed" | "failed";
  trace: EmailAutomationTraceItem[];
  issues: EmailAutomationValidationIssue[];
};

export const AUTOMATION_NODE_CATALOG: readonly AutomationCatalogItem[] = [
  {
    kind: "trigger.contact_manual",
    category: "trigger",
    label: "Contato adicionado manualmente",
    description: "Inicia um teste com um contato escolhido pelo operador.",
    defaultConfig: {},
  },
  {
    kind: "trigger.contact_created",
    category: "trigger",
    label: "Contato criado",
    description: "Representa a entrada de um novo contato no CRM.",
    defaultConfig: {},
  },
  {
    kind: "trigger.email_received",
    category: "trigger",
    label: "E-mail recebido",
    description: "Representa uma nova mensagem recebida pela caixa do CRM.",
    defaultConfig: {},
  },
  {
    kind: "trigger.deal_stage_changed",
    category: "trigger",
    label: "Etapa do deal alterada",
    description: "Representa uma mudanca de etapa da oportunidade.",
    defaultConfig: {},
  },
  {
    kind: "rule.has_email",
    category: "rule",
    label: "Contato possui e-mail",
    description: "Continua somente quando o contato possui um e-mail valido.",
    defaultConfig: {},
  },
  {
    kind: "rule.stage_equals",
    category: "rule",
    label: "Etapa e igual",
    description: "Continua quando a etapa atual corresponde ao valor definido.",
    defaultConfig: { value: "Proposta" },
  },
  {
    kind: "rule.field_compare",
    category: "rule",
    label: "Comparar campo",
    description: "Compara um campo do contato, deal, e-mail ou evento.",
    defaultConfig: { field: "deal.stage", operator: "equals", value: "Proposta" },
  },
  {
    kind: "action.wait",
    category: "action",
    label: "Aguardar",
    description: "Simula uma espera sem criar agendamento ou worker.",
    defaultConfig: { amount: 1, unit: "day" },
  },
  {
    kind: "action.task_upsert",
    category: "action",
    label: "Criar tarefa",
    description: "Descreve uma tarefa que podera ser criada apos confirmacao.",
    defaultConfig: { title: "Revisar contato", note: "" },
  },
  {
    kind: "action.alert_create",
    category: "action",
    label: "Criar alerta",
    description: "Descreve um alerta interno para a equipe.",
    defaultConfig: { message: "Contato precisa de atencao" },
  },
  {
    kind: "action.email_draft",
    category: "action",
    label: "Criar rascunho de e-mail",
    description: "Monta assunto e corpo, mas nao envia a mensagem.",
    defaultConfig: { subject: "Retorno sobre {{deal.company}}", body: "Ola {{contact.name}}," },
  },
  {
    kind: "action.confirmation_request",
    category: "action",
    label: "Solicitar confirmacao",
    description: "Pede aprovacao humana antes de qualquer acao posterior.",
    defaultConfig: { message: "Confirmar proxima acao" },
  },
  {
    kind: "action.email_send",
    category: "action",
    label: "Enviar e-mail",
    description: "Bloqueado nesta versao: o editor nao envia mensagens.",
    locked: true,
    defaultConfig: {},
  },
] as const;

const catalogByKind = new Map(AUTOMATION_NODE_CATALOG.map((item) => [item.kind, item]));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function configIssue(node: EmailAutomationNode): string | null {
  const config = isRecord(node.data.config) ? node.data.config : {};
  switch (node.data.kind) {
    case "rule.stage_equals":
      return nonEmptyString(config.value) ? null : "Defina a etapa comparada.";
    case "rule.field_compare":
      if (!nonEmptyString(config.field)) return "Defina o campo comparado.";
      if (!['equals', 'not_equals', 'contains'].includes(String(config.operator ?? ""))) {
        return "Escolha um operador suportado.";
      }
      return config.value !== undefined && config.value !== null ? null : "Defina o valor comparado.";
    case "action.wait":
      if (!Number.isFinite(Number(config.amount)) || Number(config.amount) <= 0) return "Defina uma espera positiva.";
      return ["minute", "hour", "day"].includes(String(config.unit ?? "")) ? null : "Escolha a unidade da espera.";
    case "action.task_upsert":
      return nonEmptyString(config.title) ? null : "Defina o titulo da tarefa.";
    case "action.alert_create":
    case "action.confirmation_request":
      return nonEmptyString(config.message) ? null : "Defina a mensagem.";
    case "action.email_draft":
      if (!nonEmptyString(config.subject)) return "Defina o assunto do rascunho.";
      return nonEmptyString(config.body) ? null : "Defina o corpo do rascunho.";
    default:
      return null;
  }
}

export function createStarterEmailAutomationGraph(): EmailAutomationGraph {
  return {
    nodes: [
      {
        id: "trigger-1",
        type: "automationNode",
        position: { x: 100, y: 180 },
        data: {
          kind: "trigger.contact_manual",
          label: "Contato adicionado manualmente",
          config: {},
        },
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export function validateEmailAutomationGraph(value: unknown): {
  valid: boolean;
  issues: EmailAutomationValidationIssue[];
} {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    const issues: EmailAutomationValidationIssue[] = [{ code: "invalid_graph", message: "O grafo precisa conter nodes e edges." }];
    return { valid: false, issues };
  }

  const graph = value as unknown as EmailAutomationGraph;
  const issues: EmailAutomationValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const duplicateNodeIds = new Set<string>();
  const supportedNodes: EmailAutomationNode[] = [];

  for (const candidate of graph.nodes) {
    if (!candidate || !nonEmptyString(candidate.id) || !isRecord(candidate.data)) {
      issues.push({ code: "invalid_graph", message: "Existe um node sem identidade ou dados validos." });
      continue;
    }
    if (nodeIds.has(candidate.id)) duplicateNodeIds.add(candidate.id);
    nodeIds.add(candidate.id);

    const item = catalogByKind.get(candidate.data.kind);
    if (!item) {
      issues.push({ code: "unsupported_node", nodeId: candidate.id, message: "Tipo de node nao suportado." });
      continue;
    }
    supportedNodes.push(candidate);
    if (item.locked) {
      issues.push({ code: "locked_node", nodeId: candidate.id, message: "Enviar e-mail esta bloqueado nesta versao." });
    }
    const invalidConfig = configIssue(candidate);
    if (invalidConfig) issues.push({ code: "invalid_config", nodeId: candidate.id, message: invalidConfig });
  }

  for (const id of [...duplicateNodeIds].sort()) {
    issues.push({ code: "duplicate_node_id", nodeId: id, message: `O node ${id} esta duplicado.` });
  }

  const triggers = supportedNodes.filter((node) => catalogByKind.get(node.data.kind)?.category === "trigger");
  if (triggers.length !== 1) {
    issues.push({ code: "trigger_count", message: "A automacao precisa ter exatamente um gatilho." });
  }

  const edgeIds = new Set<string>();
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const id of nodeIds) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }

  for (const edge of graph.edges) {
    if (!edge || !nonEmptyString(edge.id) || !nonEmptyString(edge.source) || !nonEmptyString(edge.target)) {
      issues.push({ code: "invalid_edge", message: "Existe uma conexao incompleta." });
      continue;
    }
    if (edgeIds.has(edge.id)) {
      issues.push({ code: "duplicate_edge_id", edgeId: edge.id, message: `A conexao ${edge.id} esta duplicada.` });
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({ code: "invalid_edge", edgeId: edge.id, message: "A conexao aponta para um node inexistente." });
      continue;
    }
    if (edge.source === edge.target) {
      issues.push({ code: "self_edge", edgeId: edge.id, nodeId: edge.source, message: "Um node nao pode conectar a si mesmo." });
    }
    outgoing.get(edge.source)?.push(edge.target);
    incoming.get(edge.target)?.push(edge.source);
  }

  for (const trigger of triggers) {
    if ((incoming.get(trigger.id)?.length ?? 0) > 0) {
      issues.push({ code: "trigger_incoming_edge", nodeId: trigger.id, message: "O gatilho nao pode receber conexoes." });
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  let cycleFound = false;
  function visit(nodeId: string) {
    if (visiting.has(nodeId)) {
      cycleFound = true;
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const target of outgoing.get(nodeId) ?? []) visit(target);
    visiting.delete(nodeId);
    visited.add(nodeId);
  }
  for (const id of [...nodeIds].sort()) visit(id);
  if (cycleFound) issues.push({ code: "cycle", message: "A automacao nao pode conter ciclos." });

  if (triggers.length === 1) {
    const reachable = new Set<string>();
    const queue = [triggers[0].id];
    while (queue.length) {
      const current = queue.shift() as string;
      if (reachable.has(current)) continue;
      reachable.add(current);
      queue.push(...(outgoing.get(current) ?? []));
    }
    for (const id of [...nodeIds].sort()) {
      if (!reachable.has(id)) {
        issues.push({ code: "unreachable_node", nodeId: id, message: `O node ${id} nao esta ligado ao gatilho.` });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

function valueAtPath(input: EmailAutomationSimulationInput, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, input);
}

function interpolate(value: unknown, input: EmailAutomationSimulationInput): string {
  return String(value ?? "").replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, path: string) => {
    const resolved = valueAtPath(input, path);
    return resolved === undefined || resolved === null ? "" : String(resolved);
  });
}

function evaluateRule(node: EmailAutomationNode, input: EmailAutomationSimulationInput): boolean {
  const config = node.data.config;
  if (node.data.kind === "rule.has_email") return nonEmptyString(valueAtPath(input, "contact.email"));
  if (node.data.kind === "rule.stage_equals") return valueAtPath(input, "deal.stage") === config.value;
  if (node.data.kind === "rule.field_compare") {
    const actual = valueAtPath(input, String(config.field));
    if (config.operator === "not_equals") return actual !== config.value;
    if (config.operator === "contains") return String(actual ?? "").includes(String(config.value ?? ""));
    return actual === config.value;
  }
  return true;
}

function actionMessage(node: EmailAutomationNode, input: EmailAutomationSimulationInput): string {
  const config = node.data.config;
  switch (node.data.kind) {
    case "action.wait":
      return `Simular espera de ${config.amount} ${config.unit}.`;
    case "action.task_upsert":
      return `Simular tarefa: ${interpolate(config.title, input)}.`;
    case "action.alert_create":
      return `Simular alerta: ${interpolate(config.message, input)}.`;
    case "action.email_draft":
      return `Simular rascunho: ${interpolate(config.subject, input)}.`;
    case "action.confirmation_request":
      return `Simular confirmacao: ${interpolate(config.message, input)}.`;
    default:
      return "Simulacao sem efeito externo.";
  }
}

export function simulateEmailAutomationGraph(
  graph: EmailAutomationGraph,
  input: EmailAutomationSimulationInput,
): EmailAutomationSimulationResult {
  const validation = validateEmailAutomationGraph(graph);
  if (!validation.valid) return { status: "failed", trace: [], issues: validation.issues };

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    incoming.get(edge.target)?.push(edge.source);
    outgoing.get(edge.source)?.push(edge.target);
  }
  for (const values of incoming.values()) values.sort();
  for (const values of outgoing.values()) values.sort();

  const indegree = new Map([...incoming].map(([id, values]) => [id, values.length]));
  const queue = [...indegree].filter(([, count]) => count === 0).map(([id]) => id).sort();
  const order: string[] = [];
  while (queue.length) {
    const current = queue.shift() as string;
    order.push(current);
    for (const target of outgoing.get(current) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        queue.push(target);
        queue.sort();
      }
    }
  }

  const continues = new Map<string, boolean>();
  const trace: EmailAutomationTraceItem[] = [];
  for (const nodeId of order) {
    const node = nodeById.get(nodeId) as EmailAutomationNode;
    const item = catalogByKind.get(node.data.kind) as AutomationCatalogItem;
    const predecessors = incoming.get(nodeId) ?? [];
    const active = item.category === "trigger" || predecessors.some((id) => continues.get(id) === true);
    if (!active) {
      continues.set(nodeId, false);
      trace.push({ nodeId, kind: node.data.kind, label: node.data.label, status: "skipped", message: "Ignorado porque o caminho anterior foi interrompido." });
      continue;
    }
    if (item.category === "rule") {
      const matched = evaluateRule(node, input);
      continues.set(nodeId, matched);
      trace.push({
        nodeId,
        kind: node.data.kind,
        label: node.data.label,
        status: matched ? "condition_met" : "condition_not_met",
        message: matched ? "Condicao atendida na simulacao." : "Condicao nao atendida; caminho interrompido.",
      });
      continue;
    }
    continues.set(nodeId, true);
    trace.push({
      nodeId,
      kind: node.data.kind,
      label: node.data.label,
      status: "simulated",
      message: item.category === "trigger" ? "Gatilho simulado com os dados de teste." : actionMessage(node, input),
    });
  }

  return { status: "passed", trace, issues: [] };
}
