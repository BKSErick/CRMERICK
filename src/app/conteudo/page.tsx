import fs from "node:fs";
import path from "node:path";
import { InstagramPublishedKpi } from "./InstagramPublishedKpi";
import { ThreadsPanel } from "./ThreadsPanel";

// Tela Conteudo = backlog editorial REAL, sincronizado do vault (fonte de verdade).
// Gerado por `node scripts/sync-vault-content.mjs` -> content/conteudo.json (commitado).
// Sem mock: os itens sao os posts/stories realmente escritos em copies_instagram.md.

type ContentItem = {
  n: number;
  canal?: "instagram" | "threads";
  type: "Post" | "Story" | "Thread";
  title: string;
  hook: string;
  excerpt: string;
  status: string;
};

type ContentPlan = {
  generatedAt: string;
  source: string;
  counts: { total: number; posts: number; stories: number; threads?: number };
  items: ContentItem[];
};

function loadPlan(): ContentPlan {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "content", "conteudo.json"), "utf8");
    return JSON.parse(raw) as ContentPlan;
  } catch {
    return { generatedAt: "", source: "", counts: { total: 0, posts: 0, stories: 0 }, items: [] };
  }
}

function ContentTable({ items, textoLabel }: { items: ContentItem[]; textoLabel: string }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Tipo</th>
            <th>Titulo</th>
            <th>{textoLabel}</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.canal || "instagram"}-${item.type}-${item.n}`}>
              <td>{item.n}</td>
              <td>{item.type}</td>
              <td>{item.title}</td>
              <td>{item.excerpt || item.hook}</td>
              <td>
                <span className="status-pill active">{item.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ConteudoPage() {
  const plan = loadPlan();
  const instagram = plan.items.filter((i) => (i.canal || "instagram") === "instagram");
  const threads = plan.items.filter((i) => i.canal === "threads");

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Conteudo</h1>
          <div className="subtitle">
            Backlog editorial real, sincronizado do vault de posicionamento (@euericksena).
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Itens</div>
          <div className="value">{plan.counts.total}</div>
        </div>
      </div>

      <div className="kpi-row">
        <article className="kpi-card">
          <div className="kpi-label">Planejados</div>
          <div className="kpi-value">{plan.counts.total}</div>
          <div className="kpi-trend">Vault</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Posts</div>
          <div className="kpi-value">{plan.counts.posts}</div>
          <div className="kpi-trend">Posicionamento</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Stories</div>
          <div className="kpi-value">{plan.counts.stories}</div>
          <div className="kpi-trend up">Funil</div>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Threads</div>
          <div className="kpi-value">{plan.counts.threads ?? 0}</div>
          <div className="kpi-trend up">Texto</div>
        </article>
        <InstagramPublishedKpi />
      </div>

      {plan.items.length === 0 ? (
        <div className="connection-status fallback">
          content/conteudo.json vazio. Rode: node scripts/sync-vault-content.mjs
        </div>
      ) : (
        <>
          <h2 className="section-title">Instagram ({instagram.length})</h2>
          <ContentTable items={instagram} textoLabel="Gancho" />

          {threads.length === 0 ? (
            <>
              <h2 className="section-title">Threads (0)</h2>
              <div className="connection-status fallback">
                Nenhum post de Threads no vault (Erick Sena/Threads_Posts_Prontos.md).
              </div>
            </>
          ) : (
            <ThreadsPanel items={threads} />
          )}
        </>
      )}
    </section>
  );
}
