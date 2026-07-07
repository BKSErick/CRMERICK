import Link from "next/link";
import type { NavItem } from "@/lib/navigation";

type ModulePlaceholderProps = {
  item: NavItem;
};

export function ModulePlaceholder({ item }: ModulePlaceholderProps) {
  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>{item.label}</h1>
          <div className="subtitle">
            Rota Next.js criada. A migracao do HTML legado deste modulo sera feita em uma story dedicada.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Status</div>
          <div className="value">Em migracao</div>
        </div>
      </div>

      <div className="grid-2col">
        <article className="card">
          <div className="card-header">
            <div className="card-title">Rota reservada</div>
            <span className="card-badge">Next.js</span>
          </div>
          <p className="muted-copy">A rota ja existe no App Router. A tela nativa deste modulo sera construida em uma story dedicada.</p>
        </article>
        <article className="card">
          <div className="card-header">
            <div className="card-title">Proximo corte</div>
            <span className="card-badge">React</span>
          </div>
          <p className="muted-copy">Construir a tela em React nativo com dados via store/API server-side, no padrao das demais telas do Hub.</p>
        </article>
      </div>

      <Link className="topbar-btn primary" href="/">
        Voltar ao Inicio
      </Link>
    </section>
  );
}
