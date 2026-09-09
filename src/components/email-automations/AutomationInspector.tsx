"use client";

import { AUTOMATION_NODE_CATALOG } from "@/lib/emailAutomationGraph";
import type { AutomationFlowNode } from "./AutomationNode";

type Props = {
  node: AutomationFlowNode | null;
  onChange: (nodeId: string, changes: { label?: string; config?: Record<string, unknown> }) => void;
  onDelete: (nodeId: string) => void;
};

type FieldProps = {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: "text" | "number";
};

function Field({ label, value, onChange, multiline, type = "text" }: FieldProps) {
  return (
    <label className="automation-field">
      <span>{label}</span>
      {multiline ? (
        <textarea className="nodrag" onChange={(event) => onChange(event.target.value)} rows={4} value={String(value ?? "")} />
      ) : (
        <input className="nodrag" min={type === "number" ? 1 : undefined} onChange={(event) => onChange(event.target.value)} type={type} value={String(value ?? "")} />
      )}
    </label>
  );
}

export function AutomationInspector({ node, onChange, onDelete }: Props) {
  if (!node) {
    return (
      <aside className="automation-inspector">
        <div className="automation-panel-heading"><span>Configuracao</span></div>
        <div className="automation-inspector-empty">
          <span aria-hidden="true">◇</span>
          <strong>Selecione uma etapa</strong>
          <p>Clique em um node para ajustar seu nome e seus dados de simulacao.</p>
        </div>
      </aside>
    );
  }

  const item = AUTOMATION_NODE_CATALOG.find((candidate) => candidate.kind === node.data.kind);
  const config = node.data.config ?? {};
  const updateConfig = (key: string, value: unknown) => onChange(node.id, { config: { ...config, [key]: value } });

  return (
    <aside className="automation-inspector">
      <div className="automation-panel-heading">
        <span>Configuracao</span>
        <small>{item?.category ?? "etapa"}</small>
      </div>
      <div className="automation-inspector-body">
        <span className={`automation-kind-chip ${item?.category ?? "action"}`}>{item?.label}</span>
        <Field label="Nome da etapa" onChange={(value) => onChange(node.id, { label: value })} value={node.data.label} />

        {node.data.kind === "rule.stage_equals" ? (
          <Field label="Etapa esperada" onChange={(value) => updateConfig("value", value)} value={config.value} />
        ) : null}

        {node.data.kind === "rule.field_compare" ? (
          <>
            <Field label="Campo" onChange={(value) => updateConfig("field", value)} value={config.field} />
            <label className="automation-field">
              <span>Operador</span>
              <select className="nodrag" onChange={(event) => updateConfig("operator", event.target.value)} value={String(config.operator ?? "equals")}>
                <option value="equals">e igual</option>
                <option value="not_equals">e diferente</option>
                <option value="contains">contem</option>
              </select>
            </label>
            <Field label="Valor" onChange={(value) => updateConfig("value", value)} value={config.value} />
          </>
        ) : null}

        {node.data.kind === "action.wait" ? (
          <>
            <Field label="Quantidade" onChange={(value) => updateConfig("amount", Number(value))} type="number" value={config.amount} />
            <label className="automation-field">
              <span>Unidade</span>
              <select className="nodrag" onChange={(event) => updateConfig("unit", event.target.value)} value={String(config.unit ?? "day")}>
                <option value="minute">minuto(s)</option>
                <option value="hour">hora(s)</option>
                <option value="day">dia(s)</option>
              </select>
            </label>
          </>
        ) : null}

        {node.data.kind === "action.task_upsert" ? (
          <>
            <Field label="Titulo da tarefa" onChange={(value) => updateConfig("title", value)} value={config.title} />
            <Field label="Observacao" multiline onChange={(value) => updateConfig("note", value)} value={config.note} />
          </>
        ) : null}

        {node.data.kind === "action.alert_create" || node.data.kind === "action.confirmation_request" ? (
          <Field label="Mensagem" multiline onChange={(value) => updateConfig("message", value)} value={config.message} />
        ) : null}

        {node.data.kind === "action.email_draft" ? (
          <>
            <Field label="Assunto do rascunho" onChange={(value) => updateConfig("subject", value)} value={config.subject} />
            <Field label="Corpo do rascunho" multiline onChange={(value) => updateConfig("body", value)} value={config.body} />
            <p className="automation-safe-note">Cria apenas uma previa na simulacao. Nenhuma mensagem e enviada.</p>
          </>
        ) : null}

        {(item?.category === "trigger" || node.data.kind === "rule.has_email") ? (
          <p className="automation-safe-note">Esta etapa nao precisa de configuracao adicional no modo de teste.</p>
        ) : null}

        <button className="automation-delete-node" onClick={() => onDelete(node.id)} type="button">Remover etapa</button>
      </div>
    </aside>
  );
}

