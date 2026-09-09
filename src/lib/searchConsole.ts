import { getAccessToken, hasServiceAccount, SCOPE_SEARCH_CONSOLE } from "@/lib/googleServiceAccount";

// Google Search Console (Search Analytics API v3).
//
// Responde uma pergunta que o GA4 NAO responde: quem procurou e nao entrou.
// GA4 so ve quem ja chegou no site; o Search Console ve a impressao no resultado
// de busca, o termo pesquisado e a posicao media. Consulta com muita impressao e
// zero clique e demanda existente que o titulo/descricao esta perdendo.
//
// Usa o MESMO service account do GA4, em outro escopo. Alem das credenciais, a
// conta precisa ser adicionada como usuario na propriedade do Search Console
// (Configuracoes > Usuarios e permissoes), senao a API devolve 403.

const API = "https://searchconsole.googleapis.com/webmasters/v3/sites";

// Formato aceito: "sc-domain:mydrion.com.br" (propriedade de dominio) ou a URL
// exata com barra final ("https://mydrion.com.br/").
const SITE_URL = process.env.GSC_SITE_URL;

export function isGscConfigured(): boolean {
  return Boolean(SITE_URL) && hasServiceAccount();
}

export type GscRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscTotals = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type ApiRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };

const iso = (date: Date) => date.toISOString().slice(0, 10);

// Guarda o motivo da ultima falha. Sem isso a tela so sabe dizer "nao conectado",
// e as causas pedem acoes bem diferentes: API desabilitada no Google Cloud (403),
// service account sem acesso a propriedade (403 de permissao) e GSC_SITE_URL com
// formato errado (404) sao problemas distintos.
let ultimoErro: string | null = null;

export function gscUltimoErro(): string | null {
  return ultimoErro;
}

async function query(body: Record<string, unknown>): Promise<ApiRow[] | null> {
  const token = await getAccessToken(SCOPE_SEARCH_CONSOLE);
  if (!token) {
    ultimoErro = "Nao consegui gerar o token: confira as credenciais do service account.";
    return null;
  }
  if (!SITE_URL) {
    ultimoErro = "GSC_SITE_URL nao esta definida.";
    return null;
  }

  try {
    const res = await fetch(`${API}/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const texto = await res.text();
      let detalhe = texto.slice(0, 300);
      try {
        detalhe = JSON.parse(texto)?.error?.message ?? detalhe;
      } catch {
        /* corpo nao-JSON: fica o texto cru mesmo */
      }
      ultimoErro = `${res.status}: ${detalhe}`;
      return null;
    }
    ultimoErro = null;
    const json = await res.json();
    return (json?.rows ?? []) as ApiRow[];
  } catch (error) {
    ultimoErro = error instanceof Error ? error.message : "Falha de rede ao chamar o Search Console.";
    return null;
  }
}

// O Search Console fecha os dados com ~2 dias de atraso. Pedir ate hoje devolve
// os ultimos dias zerados e faz parecer que o trafego morreu.
const janela = (days: number) => {
  const fim = new Date(Date.now() - 2 * 864e5);
  const inicio = new Date(fim.getTime() - days * 864e5);
  return { startDate: iso(inicio), endDate: iso(fim) };
};

const mapear = (rows: ApiRow[]): GscRow[] =>
  rows.map((row) => ({
    key: row.keys?.join(" · ") ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: (row.ctr ?? 0) * 100,
    position: row.position ?? 0,
  }));

/** Totais do periodo (sem dimensao): cliques, impressoes, CTR e posicao media. */
export async function fetchGscTotals(days = 30): Promise<GscTotals | null> {
  const rows = await query({ ...janela(days), dimensions: [] });
  if (!rows) return null;
  const row = rows[0];
  if (!row) return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return {
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: (row.ctr ?? 0) * 100,
    position: row.position ?? 0,
  };
}

/** Consultas que trouxeram o site ao resultado de busca. */
export async function fetchGscQueries(days = 30, limit = 50): Promise<GscRow[] | null> {
  const rows = await query({ ...janela(days), dimensions: ["query"], rowLimit: limit });
  return rows ? mapear(rows) : null;
}

/** Paginas que apareceram na busca. */
export async function fetchGscPages(days = 30, limit = 25): Promise<GscRow[] | null> {
  const rows = await query({ ...janela(days), dimensions: ["page"], rowLimit: limit });
  return rows ? mapear(rows) : null;
}

/** Serie diaria de cliques e impressoes. */
export async function fetchGscDaily(days = 30): Promise<GscRow[] | null> {
  const rows = await query({ ...janela(days), dimensions: ["date"], rowLimit: 400 });
  return rows ? mapear(rows).sort((a, b) => a.key.localeCompare(b.key)) : null;
}
