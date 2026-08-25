"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const funnelTabs = [
  { label: "Visao geral", href: "/funil" },
  { label: "Analises", href: "/analise" },
  { label: "Sinais", href: "/sinais" },
  { label: "Achados", href: "/insights" },
  { label: "Lab", href: "/lab" },
] as const;

export function FunnelSubnav() {
  const pathname = usePathname();

  return (
    <nav className="funnel-tabs" aria-label="Navegacao de Funis">
      {funnelTabs.map((tab) => {
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
