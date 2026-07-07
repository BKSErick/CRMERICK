import fs from "node:fs";
import path from "node:path";

// Agentes = catalogo dos copilotos especialistas do Hub Operacional (Copy, Funil, Conteudo,
// Trafego, Vendas, Analise), alinhado ao Brandbook ("Agentes de IA Proprietarios").
// Fonte editavel: content/agentes.json. SEM metricas fabricadas: contadores, "status online"
// e feed de atividade do shell legado foram removidos por nao terem fonte real (o Erick popula
// as metricas de execucao quando os agentes estiverem operando de fato).

type AgentItem = { code: string; name: string; area: string; description: string };
type AgentsData = { generatedAt: string; source: string; note: string; count: number; items: AgentItem[] };

function loadAgents(): AgentsData {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "content", "agentes.json"), "utf8");
    return JSON.parse(raw) as AgentsData;
  } catch {
    return { generatedAt: "", source: "", note: "", count: 0, items: [] };
  }
}

export default function AgentesPage() {
  const data = loadAgents();

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Agentes de IA</h1>
          <div className="subtitle">
            Copilotos especialistas que executam, analisam e recomendam em cada area do negocio.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">No catalogo</div>
          <div className="value">{data.count}</div>
        </div>
      </div>

      {data.items.length === 0 ? (
        <div className="connection-status fallback">
          content/agentes.json vazio. Rode: node scripts/sync-vault-content.mjs
        </div>
      ) : (
        <>
          <div className="grid-2col">
            {data.items.map((agent) => (
              <article className="card" key={agent.code}>
                <div className="card-header">
                  <div className="card-title">{agent.name}</div>
                  <span className="card-badge">{agent.area}</span>
                </div>
                <p className="muted-copy">{agent.description}</p>
              </article>
            ))}
          </div>

          {data.note ? (
            <div className="connection-status fallback" style={{ marginTop: "24px" }}>
              {data.note}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
