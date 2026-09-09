import type { Metadata } from "next";
import "@/styles/hub.css";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import "@/styles/legacy-pipeline.css";
import { SessionWatcher } from "@/components/SessionWatcher";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export const metadata: Metadata = {
  title: "Mydrion CRM",
  description: "Operação comercial da Mydrion: CRM, conteúdo e pipeline.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <SessionWatcher />
        <Sidebar />
        <Topbar />
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
