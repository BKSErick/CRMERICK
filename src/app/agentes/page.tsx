import AgentChatWorkspace from "./AgentChatWorkspace";
import { AI_AGENT_PUBLIC_REGISTRY } from "@/lib/aiAgentRegistry";
import { getAgentChatAvailability } from "@/lib/aiChatAvailability";

// A disponibilidade do chat depende de env, entao esta rota NAO pode ser pre-renderizada:
// como Server Component estatico, o valor de process.env congelava no build e a producao
// ficava presa no aviso de "chat desabilitado" por mais que a env fosse ajustada na Vercel.
export const dynamic = "force-dynamic";

// Agentes = catalogo dos copilotos especialistas do Hub Operacional (Copy, Funil, Conteudo,
// Trafego, Vendas, Analise), alinhado ao Brandbook ("Agentes de IA Proprietarios").
// Fonte editavel: content/agentes.json. SEM metricas fabricadas: contadores, "status online"
// e feed de atividade do shell legado foram removidos por nao terem fonte real (o Erick popula
// as metricas de execucao quando os agentes estiverem operando de fato).

export default function AgentesPage() {
  const agents = [...AI_AGENT_PUBLIC_REGISTRY];
  const availability = getAgentChatAvailability();

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
          <div className="value">{agents.length}</div>
        </div>
      </div>

      {availability.enabled ? <AgentChatWorkspace agents={agents} /> : (
        <div className="connection-status fallback" style={{ marginBottom: 24 }}>
          {availability.reason}
        </div>
      )}

      <div className="agents-catalog-heading">
        <h2>Especialistas disponiveis</h2>
        <p>Escolha um especialista no chat ou use o atalho indicado.</p>
      </div>
          <div className="grid-2col">
            {agents.map((agent) => (
              <article className="card" key={agent.id}>
                <div className="card-header">
                  <div className="card-title">{agent.name}</div>
                  <span className="card-badge">{agent.alias}</span>
                </div>
                <p className="muted-copy">{agent.specialty}</p>
                <small className="agent-disclosure">{agent.disclosure}</small>
                <div className="agent-card-meta"><span>{agent.type === "clone" ? "Clone de IA" : "Especialista de IA"}</span><span>v{agent.version}</span><code>{agent.sourcePath}</code></div>
              </article>
            ))}
          </div>
    </section>
  );
}
