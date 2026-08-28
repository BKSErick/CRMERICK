"use client";

import { Subnav } from "@/components/Subnav";

// A aba trocava com useState local e nao dava pra linkar direto num painel; virou rota,
// como Funis e Lista. "Achados" e "Leads e follow-ups" sairam daqui: a prospeccao por
// Instagram foi descontinuada.
const instagramTabs = [
  { label: "Visao geral", href: "/instagram" },
  { label: "Conteudo", href: "/instagram/conteudo" },
] as const;

export function InstagramSubnav() {
  return <Subnav ariaLabel="Navegacao do Instagram" tabs={instagramTabs} />;
}
