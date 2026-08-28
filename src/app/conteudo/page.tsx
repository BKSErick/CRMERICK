import { redirect } from "next/navigation";

// A aba Conteudo virou sub-aba de cada canal: o backlog do Instagram vive em
// /instagram/conteudo e o do Threads em /threads/conteudo, agora editaveis e no banco
// em vez de content/conteudo.json. A rota sobrevive so para nao quebrar link antigo.
export default function ConteudoPage() {
  redirect("/instagram/conteudo");
}
