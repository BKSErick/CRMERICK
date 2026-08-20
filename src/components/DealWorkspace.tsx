import type { DemandDeal } from "@/lib/clientDemands";

type DealWorkspaceProps = {
  deal: DemandDeal | null;
};

export function DealWorkspace({ deal }: DealWorkspaceProps) {
  return (
    <section className="demand-deal-panel" aria-label="Deal comercial">
      <div className="demands-eyebrow">Fonte comercial canonica</div>
      <h2>{deal?.company ?? "Deal removido"}</h2>
      {deal ? (
        <>
          <div className="demand-deal-grid">
            <div><span>Etapa</span><strong>{deal.stage ?? "—"}</strong></div>
            <div><span>Responsavel</span><strong>{deal.assignee || deal.owner || "—"}</strong></div>
            <div><span>Valor</span><strong>{Number(deal.value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div>
          </div>
          <p className="muted-copy">A qualificacao, mensagens, forecast, copy comercial e demais campos continuam no overlay oficial do Pipeline.</p>
          <a className="topbar-btn primary" href={`/pipeline?dealId=${deal.id}`}>Abrir deal completo no Pipeline</a>
        </>
      ) : (
        <div className="connection-status fallback">O deal foi removido. Esta demanda fica somente leitura como historico.</div>
      )}
    </section>
  );
}
