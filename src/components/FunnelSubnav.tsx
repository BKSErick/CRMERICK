"use client";

import { Subnav } from "@/components/Subnav";

const funnelTabs = [
  { label: "Visao geral", href: "/funil" },
  { label: "Analises", href: "/analise" },
  { label: "Sinais", href: "/sinais" },
  { label: "Achados", href: "/insights" },
  { label: "Lab", href: "/lab" },
] as const;

export function FunnelSubnav() {
  return <Subnav ariaLabel="Navegacao de Funis" tabs={funnelTabs} />;
}
