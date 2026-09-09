// Paginacao de tabela, compartilhada entre os paineis dos Funis (e-mail e Google).
// Vive fora de emailFunnel.ts porque nao tem nada de e-mail: e so fatiar uma lista.

/**
 * Fatia uma pagina. `page` e corrigido para dentro do intervalo valido porque
 * filtrar encurta a lista: quem estava na pagina 3 cairia num vazio.
 */
export function paginate<T>(rows: T[], page: number, perPage: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const from = (current - 1) * perPage;
  const items = rows.slice(from, from + perPage);
  return { items, page: current, totalPages, from, to: from + items.length, total: rows.length };
}

/** Busca textual simples: casa o termo contra o texto que a linha mostra na tela. */
export function matchesSearch(texto: string, termo: string): boolean {
  const alvo = termo.trim().toLowerCase();
  if (!alvo) return true;
  return texto.toLowerCase().includes(alvo);
}
