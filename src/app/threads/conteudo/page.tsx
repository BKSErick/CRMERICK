"use client";

import { ContentBoard } from "@/components/ContentBoard";
import { ThreadsPanel } from "@/app/threads/conteudo/ThreadsPanel";
import { ThreadsSubnav } from "@/components/ThreadsSubnav";

// Os posts de Threads moravam em /conteudo junto com os do Instagram; agora cada canal
// tem o seu. O painel de sinais (seus posts que mais rodaram + assunto em alta) continua
// aqui porque e o que alimenta o "Regenerar com IA".
export default function ThreadsConteudoPage() {
  return (
    <>
      <ThreadsSubnav />
      <ContentBoard channel="threads" />
      <ThreadsPanel />
    </>
  );
}
