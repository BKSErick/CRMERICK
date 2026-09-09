"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AUTOMATION_NODE_CATALOG, type EmailAutomationNode } from "@/lib/emailAutomationGraph";

export type AutomationFlowNode = Node<EmailAutomationNode["data"], "automationNode">;

const categoryLabel = {
  trigger: "Gatilho",
  rule: "Regra",
  action: "Acao",
} as const;

export function AutomationNode({ data, selected, isConnectable }: NodeProps<AutomationFlowNode>) {
  const catalog = AUTOMATION_NODE_CATALOG.find((item) => item.kind === data.kind);
  const category = catalog?.category ?? "action";
  const locked = Boolean(catalog?.locked);

  return (
    <div className={`automation-node automation-node-${category} ${selected ? "selected" : ""} ${locked ? "locked" : ""}`}>
      {category !== "trigger" ? (
        <Handle className="automation-node-handle" isConnectable={isConnectable} position={Position.Left} type="target" />
      ) : null}
      <div className="automation-node-cap">
        <span className="automation-node-symbol" aria-hidden="true">
          {category === "trigger" ? "↯" : category === "rule" ? "◇" : "□"}
        </span>
        <span>{categoryLabel[category]}</span>
        {locked ? <span className="automation-node-lock">Bloqueado</span> : null}
      </div>
      <strong>{data.label}</strong>
      <p>{catalog?.description ?? "Etapa da automacao."}</p>
      {!locked ? (
        <Handle className="automation-node-handle" isConnectable={isConnectable} position={Position.Right} type="source" />
      ) : null}
    </div>
  );
}

