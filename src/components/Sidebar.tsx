"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/navigation";

const groups = ["Navegacao", "Gestao"] as const;

const iconPaths: Record<string, string> = {
  home: "M3 12l9-9 9 9 M5 10v9a1 1 0 0 0 1 1h3v-5h6v5h3a1 1 0 0 0 1-1v-9",
  "north-star": "M12 2l3 7h7l-5.5 5 2 7L12 17l-6.5 4 2-7L2 9h7l3-7z",
  comando: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  lab: "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01",
  brain: "M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V19a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-4.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7z M9 12h6 M9 8h6 M9 16h4",
  funil: "M4 4h16l-6 7v6l-4 3v-9L4 4z",
  pipeline: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  contacts: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8",
  conteudo: "M3 3h18v18H3z M8.5 8.5h.01 M21 15l-5-5L5 21",
  brandbook: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  agentes: "M12 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M19 5a3 3 0 1 0 0 .01",
  sinais: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  carteira: "M21 12V7H5a2 2 0 0 1 0-4h14v4 M3 5v14a2 2 0 0 0 2 2h16v-5 M18 12a2 2 0 0 0 0 4h4v-4z",
  calendar: "M3 4h18v18H3z M16 2v4 M8 2v4 M3 10h18",
  reunioes: "M3 4h18v18H3z M8 2v4 M16 2v4 M3 10h18 M7 14h10 M7 18h6",
  configuracoes: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  instagram: "M2 7a5 5 0 0 1 5-5h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5z M16 11.4A4 4 0 1 1 12.6 8 4 4 0 0 1 16 11.4z M17.5 6.5h.01",
  disparo: "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5h.5a8.5 8.5 0 0 1 8 8z",
};

function NavIcon({ module }: { module: string }) {
  return (
    <svg aria-hidden="true" className="nav-icon" viewBox="0 0 24 24">
      <path d={iconPaths[module] ?? iconPaths.home} />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar" id="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">H</div>
        <div>
          <div className="sidebar-brand-text">Hub</div>
          <div className="sidebar-brand-sub">Operacional</div>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Navegacao principal">
        {groups.map((group) => (
          <div className="nav-group" key={group}>
            <div className="sidebar-group-label">{group}</div>
            {navItems
              .filter((item) => item.group === group)
              .map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    className={`nav-item ${active ? "active" : ""}`}
                    href={item.href}
                    key={item.module}
                    onClick={() => document.getElementById("sidebar")?.classList.remove("open")}
                  >
                    <NavIcon module={item.module} />
                    {item.label}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-avatar">ES</div>
        <div>
          <div className="sidebar-user">Erick Sena</div>
          <div className="sidebar-user-role">Admin</div>
        </div>
      </div>
    </aside>
  );
}
