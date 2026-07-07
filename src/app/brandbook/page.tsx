import fs from "node:fs";
import path from "node:path";

// Brandbook = fonte de verdade da marca (posicionamento, narrativa, tom de voz, funil, ofertas).
// Conteudo real portado do shell legado (legacy/modules/brandbook.html) para content/brandbook.json.
// Fonte editavel: content/brandbook.json. Sem dado fabricado - e brand copy real do Erick Sena.

type Card = { title: string; badge?: string; body: string };
type Column = { title: string; items: string[] };
type ListItem = { title: string; body: string };
type Section = {
  id: string;
  title: string;
  layout: "cards" | "columns" | "list";
  cards?: Card[];
  columns?: Column[];
  list?: ListItem[];
};
type Hero = {
  name: string;
  role: string;
  tagline: string;
  arquetipo: string;
  tese: string;
  icp: string;
  diferencial: string;
};
type Brandbook = {
  version: string;
  updatedLabel: string;
  hero: Hero;
  sections: Section[];
};

function loadBrandbook(): Brandbook | null {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "content", "brandbook.json"), "utf8");
    return JSON.parse(raw) as Brandbook;
  } catch {
    return null;
  }
}

function CardsBlock({ cards }: { cards: Card[] }) {
  return (
    <div className="grid-2col">
      {cards.map((card) => (
        <article className="card" key={card.title}>
          <div className="card-header">
            <div className="card-title">{card.title}</div>
            {card.badge ? <span className="card-badge">{card.badge}</span> : null}
          </div>
          <p className="muted-copy">{card.body}</p>
        </article>
      ))}
    </div>
  );
}

function ColumnsBlock({ columns }: { columns: Column[] }) {
  return (
    <div className="grid-2col">
      {columns.map((column) => (
        <article className="card" key={column.title}>
          <div className="card-header">
            <div className="card-title">{column.title}</div>
            <span className="card-badge">{column.items.length}</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: "18px" }}>
            {column.items.map((item) => (
              <li className="muted-copy" key={item} style={{ marginBottom: "6px" }}>
                {item}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

function ListBlock({ list }: { list: ListItem[] }) {
  return (
    <div className="grid-2col">
      {list.map((item) => (
        <article className="card" key={item.title}>
          <div className="card-title">{item.title}</div>
          <p className="muted-copy" style={{ marginTop: "8px" }}>{item.body}</p>
        </article>
      ))}
    </div>
  );
}

export default function BrandbookPage() {
  const data = loadBrandbook();

  if (!data) {
    return (
      <section>
        <div className="page-header">
          <div className="page-header-left">
            <h1>Brandbook</h1>
            <div className="subtitle">Fonte de verdade da marca, do posicionamento e da narrativa.</div>
          </div>
        </div>
        <div className="connection-status fallback">
          content/brandbook.json nao encontrado.
        </div>
      </section>
    );
  }

  const { hero } = data;

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Brandbook</h1>
          <div className="subtitle">
            Fonte de verdade da marca, do posicionamento e da narrativa. Governa conteudo, copy, funil, oferta e agentes do Hub Operacional.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Versao</div>
          <div className="value">{data.version}</div>
        </div>
      </div>

      <article className="card brandbook-hero" style={{ marginBottom: "28px" }}>
        <div className="card-header">
          <div className="card-title">{hero.name}</div>
          <span className="card-badge">{hero.role}</span>
        </div>
        <p className="muted-copy">{hero.tagline}</p>
        <div className="kpi-row" style={{ marginTop: "16px" }}>
          <article className="kpi-card">
            <div className="kpi-label">Arquetipo</div>
            <div className="kpi-value" style={{ fontSize: "18px" }}>{hero.arquetipo}</div>
          </article>
          <article className="kpi-card">
            <div className="kpi-label">Tese central</div>
            <div className="kpi-value" style={{ fontSize: "14px" }}>{hero.tese}</div>
          </article>
          <article className="kpi-card">
            <div className="kpi-label">ICP</div>
            <div className="kpi-value" style={{ fontSize: "14px" }}>{hero.icp}</div>
          </article>
          <article className="kpi-card">
            <div className="kpi-label">Diferencial</div>
            <div className="kpi-value" style={{ fontSize: "14px" }}>{hero.diferencial}</div>
          </article>
        </div>
      </article>

      {data.sections.map((section) => (
        <div key={section.id} style={{ marginBottom: "32px" }}>
          <div className="card-header" style={{ marginBottom: "12px" }}>
            <div className="card-title">{section.title}</div>
          </div>
          {section.layout === "cards" && section.cards ? <CardsBlock cards={section.cards} /> : null}
          {section.layout === "columns" && section.columns ? <ColumnsBlock columns={section.columns} /> : null}
          {section.layout === "list" && section.list ? <ListBlock list={section.list} /> : null}
        </div>
      ))}

      <div className="connection-status fallback">{data.updatedLabel}</div>
    </section>
  );
}
