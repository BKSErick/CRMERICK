import fs from "node:fs";
import path from "node:path";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";

// Carteira = clientes ATIVOS reais. Duas fontes que agora conversam:
// 1) set curado pelo Erick no vault (`node scripts/sync-vault-content.mjs` -> content/carteira.json)
// 2) deals FECHADOS no pipeline (stage won/negotiation) — entram sozinhos, sem sync manual.
// Dedup por nome normalizado: a curadoria do vault vence; o pipeline preenche o que falta.

// Le o Supabase, entao NAO pode ser pre-renderizada: como estatica, a lista de clientes
// congelava no deploy e um deal marcado como "won" hoje so aparecia no proximo build.
// (/brandbook e /conteudo continuam estaticas de proposito: leem JSON commitado,
// que so muda em deploy mesmo.)
export const dynamic = "force-dynamic";

type ClientItem = { name: string; type: string; description: string; status: string; fromPipeline?: boolean };
type CarteiraData = { generatedAt: string; source: string; count: number; items: ClientItem[] };

const CARTEIRA_VAZIA: CarteiraData = { generatedAt: "", source: "", count: 0, items: [] };

// As duas fontes devolvem o erro em vez de engoli-lo. Antes, qualquer falha (JSON corrompido,
// Supabase fora) virava carteira vazia identica a "nao tenho cliente nenhum", e nao havia como
// distinguir na tela.
function loadCarteira(): { data: CarteiraData; erro: string | null } {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "content", "carteira.json"), "utf8");
    return { data: JSON.parse(raw) as CarteiraData, erro: null };
  } catch (error) {
    return { data: CARTEIRA_VAZIA, erro: `content/carteira.json: ${error instanceof Error ? error.message : "falha ao ler"}` };
  }
}

const norm = (s: string) => (s ?? "").trim().toLowerCase();

// Puxa quem já fechou (won) ou está fechando (negotiation) — clientes reais que o
// pipeline conhece e a carteira curada pode ainda não listar.
async function loadPipelineClients(): Promise<{ items: ClientItem[]; erro: string | null }> {
  try {
    const supabase = getCrmSupabaseAdmin();
    const { data, error } = await supabase
      .from("deals")
      .select("company, name, stage, segment, origin")
      .in("stage", ["won", "negotiation"])
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const items = (data ?? []).map((d) => ({
      name: String(d.company ?? d.name ?? "Sem nome"),
      type: d.stage === "won" ? "Pipeline (fechado)" : "Pipeline (fechando)",
      description: String(d.segment ?? "") || (d.origin ? `Origem: ${d.origin}` : "Do pipeline comercial"),
      status: d.stage === "won" ? "Cliente" : "Em negociacao",
      fromPipeline: true,
    }));
    return { items, erro: null };
  } catch (error) {
    return { items: [], erro: `Supabase (deals): ${error instanceof Error ? error.message : "falha ao consultar"}` };
  }
}

export default async function CarteiraPage() {
  const carteira = loadCarteira();
  const pipeline = await loadPipelineClients();
  const falhas = [carteira.erro, pipeline.erro].filter((item): item is string => Boolean(item));

  // Merge: vault primeiro (curado), depois deals do pipeline ainda não listados.
  const vaultNames = new Set(carteira.data.items.map((i) => norm(i.name)));
  const pipelineExtra = pipeline.items.filter((p) => !vaultNames.has(norm(p.name)));
  const items = [...carteira.data.items, ...pipelineExtra];

  const byType = (t: string) => items.filter((i) => i.type.startsWith(t)).length;
  const total = items.length;
  const wonCount = pipeline.items.filter((p) => p.status === "Cliente").length;

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Carteira</h1>
          <div className="subtitle">
            Clientes ativos reais: curados no vault e os que fecharam no pipeline, juntos e sem duplicar.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Clientes ativos</div>
          <div className="value">{total}</div>
        </div>
      </div>

      {falhas.length > 0 ? (
        <div className="connection-status fallback" style={{ marginBottom: 24 }}>
          A carteira esta incompleta: {falhas.join(" | ")}. O que aparece abaixo pode nao ser tudo.
        </div>
      ) : null}

      <div className="kpi-row">
        <article className="kpi-card">
          <div className="kpi-label">Ativos</div>
          <div className="kpi-value">{total}</div>
          <div className="kpi-trend up">Vault + pipeline</div>
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
          <div className="kpi-label">Fechados no pipeline</div>
          <div className="kpi-value">{wonCount}</div>
          <div className="kpi-trend up">Entram sozinhos</div>
        </article>
      </div>

      {items.length === 0 ? (
        <div className="connection-status fallback">
          content/carteira.json vazio e nenhum deal fechado. Rode: node scripts/sync-vault-content.mjs
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
              {items.map((client) => (
                <tr key={`${client.name}-${client.type}`}>
                  <td>{client.name}</td>
                  <td>
                    {client.type}
                    {client.fromPipeline ? <span className="status-pill" style={{ marginLeft: "6px", background: "#e8eef7", color: "#2b4a7a" }}>pipeline</span> : null}
                  </td>
                  <td>{client.description}</td>
                  <td>
                    <span className={`portfolio-status ${client.fromPipeline && client.status !== "Cliente" ? "warning" : "success"}`}>{client.status}</span>
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
