"use client";

import { Subnav } from "@/components/Subnav";

const threadsTabs = [
  { label: "Visao geral", href: "/threads" },
  { label: "Conteudo", href: "/threads/conteudo" },
] as const;

export function ThreadsSubnav() {
  return <Subnav ariaLabel="Navegacao do Threads" tabs={threadsTabs} />;
}
