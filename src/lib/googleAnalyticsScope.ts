// Recorte de host das consultas ao GA4.
//
// A propriedade e compartilhada: no periodo medido em 09/09/2026 ela recebeu
// sessao de www.mydrion.com.br, mydrion.vercel.app, linkbio.mydrion.com.br,
// linkbiopageerick.vercel.app, apresentacaoostrack.vercel.app e localhost.
// Sem filtro, a aba Google somava tudo isso e apresentava como desempenho do
// site institucional.
//
// O filtro entra na propria consulta (dimensionFilter), nao depois: filtrar no
// cliente ainda traria linhas de outros hosts dentro dos totais agregados que a
// API ja devolve somados.

/** Hosts do site institucional. Preview da Vercel e link-in-bio ficam de fora. */
export const DEFAULT_GA_HOSTNAMES = ["www.mydrion.com.br", "mydrion.com.br"];

/**
 * Le a lista de hosts de uma string separada por virgula (env `GA_HOSTNAMES`).
 * Normaliza caixa, remove repetido e cai no padrao quando vem vazia.
 */
export function parseGaHostnames(raw: string | undefined | null): string[] {
  const itens = String(raw ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (itens.length === 0) return DEFAULT_GA_HOSTNAMES;
  return [...new Set(itens)];
}

/** Acrescenta o recorte de host ao corpo de um runReport do GA4. */
export function withGaHostnameScope<T extends Record<string, unknown>>(
  body: T,
  hostnames: string[] = parseGaHostnames(process.env.GA_HOSTNAMES),
): T & { dimensionFilter: Record<string, unknown> } {
  return {
    ...body,
    dimensionFilter: {
      filter: {
        fieldName: "hostName",
        inListFilter: { values: hostnames, caseSensitive: false },
      },
    },
  };
}
