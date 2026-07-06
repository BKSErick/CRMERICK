"use client";

import { usePathname } from "next/navigation";
import { getCurrentTitle } from "@/lib/navigation";

export function Topbar() {
  const pathname = usePathname();
  const currentTitle = getCurrentTitle(pathname);

  return (
    <header className="topbar">
      <button
        className="mobile-menu-btn"
        type="button"
        onClick={() => document.getElementById("sidebar")?.classList.toggle("open")}
        aria-label="Menu"
      >
        <span className="menu-lines" aria-hidden="true" />
      </button>
      <span className="topbar-breadcrumb">
        Hub Operacional / <span>{currentTitle}</span>
      </span>
      <div className="topbar-spacer" />
      <button className="topbar-search-btn" type="button" aria-label="Abrir busca global">
        <span className="search-mark" aria-hidden="true" />
        Buscar
        <kbd>Ctrl K</kbd>
      </button>
    </header>
  );
}
