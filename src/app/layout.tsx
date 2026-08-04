import type { Metadata } from "next";
import "@/styles/hub.css";
import "./globals.css";
import "@/styles/legacy-pipeline.css";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export const metadata: Metadata = {
  title: "CRM Erick",
  description: "Hub operacional de CRM, conteudo e pipeline comercial.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <Sidebar />
        <Topbar />
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
