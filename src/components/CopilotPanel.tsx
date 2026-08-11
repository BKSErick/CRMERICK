"use client";

import { useCallback, useState } from "react";

// Story 032: superficie unica do copiloto. A Sala de Comando (prioridades gerais e por
// deal) e o overlay do Pipeline reusam este componente em vez de cada tela inventar o seu
// proprio painel de IA — e nenhuma delas ganha aba ou rota nova por causa disso.
//
// Tres regras que o componente carrega:
// 1. Cada frase aparece rotulada (fato calculado / regra deterministica / sugestao de IA).
// 2. Evidencia e limitacao aparecem junto com a resposta, nunca escondidas.
// 3. Sugestao nao vira acao sozinha: exige clicar em Aplicar e depois confirmar.

type Statement = {
  classification: "fact" | "rule" | "ai_suggestion";
  ruleId?: string | null;
  text: string;
  evidenceKeys?: string[];
};

type Evidence = { key: string; label: string; origin: string; value: string; observedAt: string | null };

type Suggestion = {
  kind: "task" | "draft";
  dealId: number;
  company?: string | null;
  title: string;
  note?: string;
  text?: string;
  nextActionAt?: string;
  nextActionType?: string;
  origin: string;
  requiresConfirmation: boolean;
};

export type CopilotAnswer = {
  question: string;
  questionLabel: string;
  dealId: number | null;
  period: { from: string | null; to: string | null };
  generatedAt: string;
  sources: string[];
  statements: Statement[];
  evidence: Evidence[];
  limitations: string[];
  suggestions: Suggestion[];
  dataAvailable: boolean;
  ai: { status: "ok" | "unavailable" | "skipped"; provider: string | null; model: string | null; error: string | null };
};

const CLASSIFICATION_LABELS: Record<Statement["classification"], string> = {
  fact: "Fato calculado",
  rule: "Regra",
  ai_suggestion: "Sugestao de IA",
};

const CLASSIFICATION_COLORS: Record<Statement["classification"], string> = {
  fact: "#37474f",
  rule: "#2e7d32",
  ai_suggestion: "#6a1b9a",
};

/** Busca uma resposta do copiloto. Erro vira mensagem, nunca excecao na tela. */
export async function fetchCopilotAnswer(
  body: Record<string, unknown>,
): Promise<{ answer: CopilotAnswer | null; error: string | null }> {
  try {
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const parsed = await response.json();
    if (!response.ok || !parsed.ok) throw new Error(parsed.error ?? "Copiloto indisponivel agora.");
    return { answer: parsed.answer as CopilotAnswer, error: null };
  } catch (exception) {
    return { answer: null, error: exception instanceof Error ? exception.message : "Copiloto indisponivel agora." };
  }
}

function ClassificationPill({ statement }: { statement: Statement }) {
  return (
    <span
      className="status-pill"
      title={statement.ruleId ? `Regra: ${statement.ruleId}` : undefined}
      style={{
        background: CLASSIFICATION_COLORS[statement.classification],
        color: "#fff",
        fontSize: "10px",
        marginRight: "6px",
        whiteSpace: "nowrap",
      }}
    >
      {CLASSIFICATION_LABELS[statement.classification]}
    </span>
  );
}

function learningFromAnswer(answer: CopilotAnswer) {
  return [
    `${answer.questionLabel}${answer.dealId ? ` (deal ${answer.dealId})` : ""}`,
    ...answer.statements.map((statement) => `- [${CLASSIFICATION_LABELS[statement.classification]}] ${statement.text}`),
  ].join("\n");
}

type CopilotAnswerBodyProps = {
  answer: CopilotAnswer;
  /** Libera o botao de guardar o aprendizado em Achados (gesto explicito do operador). */
  allowSave?: boolean;
};

/** Corpo da resposta: usado pelo painel e, direto, pela fila da Sala de Comando. */
export function CopilotAnswerBody({ answer, allowSave = false }: CopilotAnswerBodyProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [pendingApply, setPendingApply] = useState<number | null>(null);
  const [applyStatus, setApplyStatus] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  async function applySuggestion(index: number) {
    const suggestion = answer.suggestions[index];
    if (!suggestion) return;
    setApplyStatus(null);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "copilot-apply", suggestion, confirmed: true, question: answer.question }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao aplicar a sugestao.");
      const applied = (body.decisions ?? []).filter((decision: { status: string }) => decision.status === "applied");
      setApplyStatus(
        body.duplicate
          ? "Esta sugestao ja tinha sido aplicada antes."
          : applied.length > 0
            ? `Aplicado pelo motor comercial (${applied.length} acao).`
            : "O motor comercial recebeu, mas nenhuma regra autorizou a acao.",
      );
    } catch (exception) {
      setApplyStatus(exception instanceof Error ? exception.message : "Falha ao aplicar a sugestao.");
    } finally {
      setPendingApply(null);
    }
  }

  async function saveToAchados() {
    setSaveStatus(null);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "copilot-save-learning",
          content: learningFromAnswer(answer),
          confirmed: true,
          dealId: answer.dealId ?? undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Falha ao salvar em Achados.");
      setSaveStatus("Guardado em Achados.");
    } catch (exception) {
      setSaveStatus(exception instanceof Error ? exception.message : "Falha ao salvar em Achados.");
    }
  }

  return (
    <div style={{ fontSize: "12px", lineHeight: 1.5 }}>
      <div className="muted-copy" style={{ fontSize: "11px", marginBottom: "6px" }}>
        {answer.period.from && answer.period.to ? `Periodo ${answer.period.from} a ${answer.period.to} · ` : ""}
        consultado em {new Date(answer.generatedAt).toLocaleString("pt-BR")}
        {answer.sources.length > 0 ? ` · fontes: ${answer.sources.join(", ")}` : ""}
      </div>

      {answer.ai.status === "unavailable" ? (
        <div className="connection-status fallback" style={{ fontSize: "11px", marginBottom: "6px" }}>
          Narrativa da IA indisponivel ({answer.ai.error ?? "sem detalhe"}). O que segue e 100% deterministico.
        </div>
      ) : null}

      {answer.statements.length === 0 ? (
        <div className="connection-status fallback">Sem afirmacao sustentada por dado no periodo consultado.</div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "4px" }}>
          {answer.statements.map((statement, index) => (
            <li key={`${statement.classification}-${index}`}>
              <ClassificationPill statement={statement} />
              {statement.text}
            </li>
          ))}
        </ul>
      )}

      {answer.limitations.length > 0 ? (
        <div className="muted-copy" style={{ fontSize: "11px", marginTop: "8px" }}>
          <strong>Limitacoes:</strong>
          <ul style={{ margin: "2px 0 0 16px" }}>
            {answer.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {answer.evidence.length > 0 ? (
        <div style={{ marginTop: "8px" }}>
          <button
            className="topbar-btn"
            type="button"
            style={{ fontSize: "11px" }}
            onClick={() => setShowEvidence((value) => !value)}
          >
            {showEvidence ? "Ocultar evidencia" : `Ver evidencia (${answer.evidence.length})`}
          </button>
          {showEvidence ? (
            <div className="table-wrap" style={{ marginTop: "6px" }}>
              <table>
                <thead><tr><th>Dado</th><th>Valor</th><th>Origem</th><th>Observado em</th></tr></thead>
                <tbody>
                  {answer.evidence.map((item) => (
                    <tr key={item.key}>
                      <td>{item.label}</td>
                      <td>{item.value}</td>
                      <td><span className="status-pill">{item.origin}</span></td>
                      <td>{item.observedAt ? new Date(item.observedAt).toLocaleString("pt-BR") : "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {answer.suggestions.length > 0 ? (
        <div style={{ marginTop: "10px", display: "grid", gap: "6px" }}>
          <strong style={{ fontSize: "12px" }}>Sugestoes (nenhuma aplicada automaticamente)</strong>
          {answer.suggestions.map((suggestion, index) => (
            <div
              key={`${suggestion.kind}-${suggestion.dealId}-${index}`}
              style={{ background: "var(--color-paper)", border: "1px solid var(--color-cloud)", borderRadius: "6px", padding: "8px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <span>
                  <span className="status-pill" style={{ marginRight: "6px" }}>
                    {suggestion.kind === "task" ? "Tarefa sugerida" : "Rascunho"}
                  </span>
                  {suggestion.title}
                </span>
                {pendingApply === index ? (
                  <span style={{ display: "flex", gap: "6px" }}>
                    <button className="topbar-btn primary" type="button" onClick={() => applySuggestion(index)}>
                      Confirmar
                    </button>
                    <button className="topbar-btn" type="button" onClick={() => setPendingApply(null)}>
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <button className="topbar-btn" type="button" onClick={() => setPendingApply(index)}>
                    Aplicar
                  </button>
                )}
              </div>
              <div className="muted-copy" style={{ fontSize: "11px", marginTop: "4px", whiteSpace: "pre-wrap" }}>
                {suggestion.kind === "task"
                  ? `${suggestion.note ?? ""}${suggestion.nextActionAt ? ` · agendar para ${new Date(suggestion.nextActionAt).toLocaleString("pt-BR")}` : ""}`
                  : suggestion.text}
              </div>
            </div>
          ))}
          {applyStatus ? <div className="connection-status fallback" style={{ fontSize: "11px" }}>{applyStatus}</div> : null}
        </div>
      ) : null}

      {allowSave ? (
        <div style={{ marginTop: "10px", display: "flex", gap: "8px", alignItems: "center" }}>
          <button className="topbar-btn" type="button" style={{ fontSize: "11px" }} onClick={saveToAchados}>
            Salvar em Achados
          </button>
          {saveStatus ? <span className="muted-copy" style={{ fontSize: "11px" }}>{saveStatus}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

type CopilotPanelProps = {
  title: string;
  question: string;
  dealId?: number | null;
  allowSave?: boolean;
  /** Pede rascunho por deal em vez da resposta simples. */
  draft?: boolean;
  buttonLabel?: string;
  hint?: string;
};

export function CopilotPanel({
  title,
  question,
  dealId = null,
  allowSave = false,
  draft = false,
  buttonLabel = "Consultar copiloto",
  hint,
}: CopilotPanelProps) {
  const [answer, setAnswer] = useState<CopilotAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchCopilotAnswer(
      draft ? { action: "copilot-draft", dealId } : { action: "copilot-ask", question, dealId: dealId ?? undefined },
    );
    setAnswer(result.answer);
    setError(result.error);
    setLoading(false);
  }, [dealId, draft, question]);

  return (
    <div
      className="copilot-panel"
      style={{ border: "1px solid var(--color-cloud)", borderRadius: "8px", padding: "12px", marginTop: "12px" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <div>
          <strong style={{ fontSize: "13px", color: "var(--color-midnight-ink)" }}>{title}</strong>
          {hint ? <div className="muted-copy" style={{ fontSize: "11px" }}>{hint}</div> : null}
        </div>
        <button className="topbar-btn" type="button" onClick={load} disabled={loading}>
          {loading ? "Consultando..." : answer ? "Atualizar" : buttonLabel}
        </button>
      </div>

      {error ? (
        <div className="portfolio-status warning" style={{ marginTop: "8px", fontSize: "12px" }}>
          {error} As telas e os numeros deterministicos continuam funcionando normalmente.
        </div>
      ) : null}

      {answer ? (
        <div style={{ marginTop: "10px" }}>
          <CopilotAnswerBody answer={answer} allowSave={allowSave} />
        </div>
      ) : null}
    </div>
  );
}

export default CopilotPanel;
