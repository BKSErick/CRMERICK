"use client";

import { Subnav } from "@/components/Subnav";

// Sala de Comando saiu do sidebar em 27/08/2026 e virou aba da Lista: as duas telas
// olham a MESMA base de deals, uma como inventario (filtro/ordem) e outra como fila do
// dia. Como aba de topo separada, o cockpit competia com a lista em vez de continuar ela.
const listaTabs = [
  { label: "Deals", href: "/lista" },
  { label: "Sala de Comando", href: "/comando" },
] as const;

export function ListaSubnav() {
  return <Subnav ariaLabel="Navegacao de Lista" tabs={listaTabs} />;
}
