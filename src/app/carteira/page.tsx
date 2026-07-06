import fs from "node:fs";
import path from "node:path";

// Carteira = clientes ATIVOS reais (nao os 942 leads frios do pipeline). Set curado pelo
// Erick, sincronizado via `node scripts/sync-vault-content.mjs` -> content/carteira.json
// (descricoes puxadas do vault Clientes/* onde existe). Sem mock, sem deal fake.

type ClientItem = { name: string; type: string; description: string; status: string };
type CarteiraData = { generatedAt: string; source: string; count: number; items: ClientItem[] };

function loadCarteira(): CarteiraData {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "content", "carteira.json"), "utf8");
    return JSON.parse(raw) as CarteiraData;
  } catch {
    return { generatedAt: "", source: "", count: 0, items: [] };
  }
}

export default function CarteiraPage() {
  const carteira = loadCarteira();
  const byType = (t: string) => carteira.items.filter((i) => i.type.startsWith(t)).length;

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Carteira</h1>
          <div className="subtitle">
            Clientes ativos reais (serviço, SaaS próprio e agência) — curados no vault.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Clientes ativos</div>
          <div className="value">{carteira.count}</div>
        </div>
      </div>

      <div className="kpi-row">
        <article className="kpi-card">
          <div className="kpi-label">Ativos</div>
          <div className="kpi-value">{carteira.count}</div>
          <div className="kpi-trend up">Carteira real</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Serviço</div>
          <div className="kpi-value">{byType("Serviço")}</div>
          <div className="kpi-trend">Prestação</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">SaaS próprio</div>
          <div className="kpi-value">{byType("SaaS")}</div>
          <div className="kpi-trend">Ativo</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Agência</div>
          <div className="kpi-value">{byType("Agência")}</div>
          <div className="kpi-trend">Parceria</div>
        </article>
      </div>

      {carteira.items.length === 0 ? (
        <div className="connection-status fallback">
          content/carteira.json vazio. Rode: node scripts/sync-vault-content.mjs
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Descricao</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {carteira.items.map((client) => (
                <tr key={client.name}>
                  <td>{client.name}</td>
                  <td>{client.type}</td>
                  <td>{client.description}</td>
                  <td>
                    <span className="portfolio-status success">{client.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
