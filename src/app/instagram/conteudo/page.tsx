"use client";

import { ContentBoard } from "@/components/ContentBoard";
import { InstagramSubnav } from "@/components/InstagramSubnav";

// Era a aba /conteudo, que lia um JSON estatico e nao dava pra editar. Virou sub-aba do
// canal, com o backlog e o que ja foi publicado na mesma linha do tempo.
export default function InstagramConteudoPage() {
  return (
    <>
      <InstagramSubnav />
      <ContentBoard channel="instagram" />
    </>
  );
}
