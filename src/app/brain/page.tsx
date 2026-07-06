import fs from "node:fs";
import path from "node:path";

// Brain = segundo cerebro estrategico do negocio ATUAL (Hub Operacional / Erick Sena).
// Indice dos docs estrategicos reais do vault (SaaS/CRM ERICK + thinking), sincronizados
// via `node scripts/sync-vault-content.mjs` -> content/brain.json. Conteudo morto
// (BackstageFY/BKS-Grow) e filtrado no sync. Sem mock.

type BrainItem = { title: string; description: string; category: string; file: string };
type BrainData = { generatedAt: string; source: string; count: number; items: BrainItem[] };

function loadBrain(): BrainData {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "content", "brain.json"), "utf8");
    return JSON.parse(raw) as BrainData;
  } catch {
    return { generatedAt: "", source: "", count: 0, items: [] };
  }
}

export default function BrainPage() {
  const brain = loadBrain();
  const categories = Array.from(new Set(brain.items.map((i) => i.category))).sort();

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Brain</h1>
          <div className="subtitle">
            Base de conhecimento estrategico do Hub Operacional, sincronizada do vault (fonte de verdade).
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Documentos</div>
          <div className="value">{brain.count}</div>
        </div>
      </div>

      {brain.items.length === 0 ? (
        <div className="connection-status fallback">
          content/brain.json vazio. Rode: node scripts/sync-vault-content.mjs
        </div>
      ) : (
        categories.map((cat) => (
          <div key={cat} style={{ marginBottom: "28px" }}>
            <div className="card-header" style={{ marginBottom: "12px" }}>
              <div className="card-title">{cat}</div>
              <span className="card-badge">
                {brain.items.filter((i) => i.category === cat).length}
              </span>
            </div>
            <div className="grid-2col">
              {brain.items
                .filter((i) => i.category === cat)
                .map((item) => (
                  <article className="card" key={item.file}>
                    <div className="card-header">
                      <div className="card-title">{item.title}</div>
                    </div>
                    <p className="muted-copy">{item.description || "Sem descricao no frontmatter."}</p>
                    <p className="muted-copy" style={{ opacity: 0.6, fontSize: "12px" }}>{item.file}</p>
                  </article>
                ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
