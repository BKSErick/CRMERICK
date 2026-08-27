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

  return (
    <nav aria-label={ariaLabel} className={className}>
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
