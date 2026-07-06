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
            <div className="card-title">Origem legada</div>
            <span className="card-badge">HTML</span>
          </div>
          <p className="muted-copy">O modulo original continua disponivel na pasta `modules/` para comparacao visual e migracao incremental.</p>
        </article>
        <article className="card">
          <div className="card-header">
            <div className="card-title">Proximo corte</div>
            <span className="card-badge">React</span>
          </div>
          <p className="muted-copy">Converter estrutura visual, remover dependencia de `window.parent` e ligar dados via store/API server-side.</p>
        </article>
      </div>

      <Link className="topbar-btn primary" href="/">
        Voltar ao Inicio
      </Link>
    </section>
  );
}
