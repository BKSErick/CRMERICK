"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Subnavegacao de modulo: um pai no sidebar, os filhos em abas dentro da pagina.
// Nasceu em Funis e agora Lista usa o mesmo desenho, entao o render mora aqui e cada
// modulo so declara suas abas. A classe segue sendo `funnel-tabs` de proposito: o estilo
// ja existe em globals.css e as duas subnavs devem parecer a MESMA coisa.
export type SubnavTab = { label: string; href: string };

export function Subnav({
  ariaLabel,
  className = "funnel-tabs",
  tabs,
}: {
  ariaLabel: string;
  className?: string;
  tabs: readonly SubnavTab[];
}) {
  const pathname = usePathname();

  // O match mais especifico vence. Com abas irmas (/funil, /analise) isso da no mesmo,
  // mas com aba aninhada (/instagram e /instagram/conteudo) o prefixo sozinho acendia
  // as duas ao mesmo tempo.
  const activeHref = tabs
    .filter((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label={ariaLabel} className={className}>
      {tabs.map((tab) => {
        const active = tab.href === activeHref;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={active ? "active" : undefined}
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
