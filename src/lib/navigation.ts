export type NavItem = {
  label: string;
  href: string;
  module: string;
  group: "Navegacao" | "Gestao";
  status: "migrated" | "placeholder";
};

export const navItems: NavItem[] = [
  { label: "Inicio", href: "/", module: "home", group: "Navegacao", status: "migrated" },
  { label: "North Star", href: "/north-star", module: "north-star", group: "Navegacao", status: "migrated" },
  { label: "Sala de Comando", href: "/comando", module: "comando", group: "Navegacao", status: "migrated" },
  { label: "Lab", href: "/lab", module: "lab", group: "Navegacao", status: "migrated" },
  { label: "Brain", href: "/brain", module: "brain", group: "Navegacao", status: "migrated" },
  { label: "Funis", href: "/funil", module: "funil", group: "Navegacao", status: "migrated" },
  { label: "Pipeline", href: "/pipeline", module: "pipeline", group: "Navegacao", status: "migrated" },
  { label: "Contatos", href: "/contacts", module: "contacts", group: "Navegacao", status: "migrated" },
  { label: "Conteudo", href: "/conteudo", module: "conteudo", group: "Navegacao", status: "migrated" },
  { label: "Brandbook", href: "/brandbook", module: "brandbook", group: "Navegacao", status: "migrated" },
  { label: "Agentes", href: "/agentes", module: "agentes", group: "Navegacao", status: "migrated" },
  { label: "Sinais", href: "/sinais", module: "sinais", group: "Navegacao", status: "migrated" },
  { label: "Carteira", href: "/carteira", module: "carteira", group: "Gestao", status: "migrated" },
  { label: "Calendario", href: "/calendar", module: "calendar", group: "Gestao", status: "placeholder" },
  { label: "Reunioes", href: "/reunioes", module: "reunioes", group: "Gestao", status: "migrated" },
  { label: "Configuracoes", href: "/configuracoes", module: "configuracoes", group: "Gestao", status: "migrated" },
  { label: "Instagram", href: "/instagram", module: "instagram", group: "Gestao", status: "migrated" },
  { label: "Disparo", href: "/disparo", module: "disparo", group: "Gestao", status: "migrated" },
];

export function getNavItem(module: string) {
  return navItems.find((item) => item.module === module);
}

export function getCurrentTitle(pathname: string) {
  if (pathname === "/") return "Inicio";
  const moduleId = pathname.split("/").filter(Boolean)[0] ?? "home";
  return getNavItem(moduleId)?.label ?? "Modulo";
}
