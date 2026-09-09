"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { getCurrentTitle } from "@/lib/navigation";

export function Topbar() {
  const pathname = usePathname();
  const currentTitle = getCurrentTitle(pathname);

  if (pathname === "/login") return null;

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
      <span className="topbar-mobile-brand" aria-label="Mydrion CRM">
        <Image src="/icon.svg" alt="" width={290} height={251} />
        <strong>Mydrion CRM</strong>
      </span>
      <span className="topbar-breadcrumb">
        Mydrion CRM / <span>{currentTitle}</span>
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
