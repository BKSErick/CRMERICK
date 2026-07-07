import Link from "next/link";

// Scaffold nativo para telas cuja unica fonte no shell legado era dado FABRICADO (metricas,
// deals, pessoas e reunioes ficticias). Em vez de portar numeros inventados, preservamos a
// estrutura conceitual real da tela e mostramos estado vazio elegante ("sem dados ainda") -
// o Erick popula conforme for usando (regra: nenhum dado fabricado).

export type ScaffoldSection = { title: string; description: string };
export type ScaffoldLink = { label: string; href: string };

type ModuleScaffoldProps = {
  title: string;
  subtitle: string;
  emptyNotice: string;
  sections: ScaffoldSection[];
  links?: ScaffoldLink[];
};

export function ModuleScaffold({ title, subtitle, emptyNotice, sections, links }: ModuleScaffoldProps) {
  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>{title}</h1>
          <div className="subtitle">{subtitle}</div>
        </div>
        <div className="page-header-right">
          <div className="label">Status</div>
          <div className="value">Sem dados</div>
        </div>
      </div>

      <div className="connection-status fallback" style={{ marginBottom: "24px" }}>
        {emptyNotice}
      </div>

      <div className="grid-2col">
        {sections.map((section) => (
          <article className="card" key={section.title}>
            <div className="card-header">
              <div className="card-title">{section.title}</div>
              <span className="card-badge">sem dados ainda</span>
            </div>
            <p className="muted-copy">{section.description}</p>
          </article>
        ))}
      </div>

      {links && links.length > 0 ? (
        <div className="brandbook-actions" style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "24px" }}>
          {links.map((link) => (
            <Link className="topbar-btn" href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
