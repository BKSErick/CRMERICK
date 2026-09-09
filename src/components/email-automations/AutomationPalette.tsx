"use client";

import {
  AUTOMATION_NODE_CATALOG,
  type AutomationNodeCategory,
  type EmailAutomationNodeKind,
} from "@/lib/emailAutomationGraph";

type Props = {
  hasTrigger: boolean;
  onAdd: (kind: EmailAutomationNodeKind) => void;
};

const sections: Array<{ category: AutomationNodeCategory; label: string; marker: string }> = [
  { category: "trigger", label: "Gatilhos", marker: "↯" },
  { category: "rule", label: "Regras", marker: "◇" },
  { category: "action", label: "Acoes", marker: "□" },
];

export function AutomationPalette({ hasTrigger, onAdd }: Props) {
  return (
    <aside className="automation-palette" aria-label="Etapas disponiveis">
      <div className="automation-panel-heading">
        <span>Etapas</span>
        <small>clique para adicionar</small>
      </div>
      <label className="automation-palette-search">
        <span aria-hidden="true">⌕</span>
        <input aria-label="Buscar por nome da etapa" placeholder="Buscar por nome da etapa" />
      </label>
      {sections.map((section) => (
        <section className="automation-palette-section" key={section.category}>
          <h3><span aria-hidden="true">{section.marker}</span>{section.label}</h3>
          <div className="automation-palette-items">
            {AUTOMATION_NODE_CATALOG
              .filter((item) => item.category === section.category)
              .map((item) => {
                const disabled = Boolean(item.locked) || (section.category === "trigger" && hasTrigger);
                return (
                  <button
                    className={`automation-palette-item ${item.locked ? "locked" : ""}`}
                    disabled={disabled}
                    key={item.kind}
                    onClick={() => onAdd(item.kind)}
                    title={item.locked ? "Bloqueado: nenhum e-mail sera enviado" : item.description}
                    type="button"
                  >
                    <span className={`automation-palette-dot ${section.category}`} aria-hidden="true" />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.locked ? "Bloqueado nesta versao" : item.description}</small>
                    </span>
                    <span className="automation-palette-add" aria-hidden="true">{item.locked ? "⌁" : "+"}</span>
                  </button>
                );
              })}
          </div>
        </section>
      ))}
    </aside>
  );
}

