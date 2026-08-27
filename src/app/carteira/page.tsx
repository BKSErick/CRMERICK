import { redirect } from "next/navigation";

// A Carteira virou a aba Clientes (story-042): mesma lista, agora com cadastro fiscal,
// demandas e valor por mes. A rota sobrevive so para nao quebrar link antigo.
export default function CarteiraPage() {
  redirect("/clientes");
}
