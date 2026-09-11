// Agregacao da aba Google: junta GA4 (quem ja chegou no site) e Search Console
// (quem procurou e viu o site no resultado, tendo entrado ou nao).
//
// As duas fontes NAO se somam e nao devem ser comparadas linha a linha: o GA4
// conta sessao no site, o Search Console conta aparicao na busca do Google. Ficam
// lado a lado porque respondem perguntas diferentes — "o que fizeram aqui dentro"
// e "o que procuraram para chegar aqui".
//
// Funcoes puras: a rota busca, isto aqui so conta.

// Import de TIPO e relativo com extensao: esta lib roda sob `node --test`, que nao
// resolve o alias "@/". Sendo `import type`, some na compilacao e nao arrasta o
// modulo de rede junto.
import type { GaDayRow, GaDeviceRow, GaEventRow, GaPageRow, GaSourceRow } from "./googleAnalytics.ts";
import type { GscRow, GscTotals } from "./searchConsole.ts";
import {
  isMydrionCtaEvent,
  isMydrionLeadEvent,
  isMydrionMeasurementEvent,
} from "./googleEventTaxonomy.ts";

export type RankedRow = { label: string; value: number; share: number; extra?: string };

export type Opportunity = {
  query: string;
  impressions: number;
  clicks: number;
  position: number;
  motivo: string;
};

export type GoogleInsightsReport = {
  analytics: {
    configured: boolean;
    sessions: number;
    users: number;
    views: number;
    ctaClicks: number;
    leads: number;
    sales: number;
    engagementRate: number;
    funnel: { label: string; value: number; helper: string }[];
    pages: RankedRow[];
    channels: RankedRow[];
    devices: RankedRow[];
    daily: { day: string; sessions: number; users: number }[];
    events: RankedRow[];
  };
  search: {
    configured: boolean;
    totals: GscTotals;
    queries: RankedRow[];
    pages: RankedRow[];
    daily: { day: string; clicks: number; impressions: number }[];
    opportunities: Opportunity[];
    pareto: { label: string; value: number; share: number; cumulative: number }[];
  };
  diagnosis: { level: "ok" | "atencao" | "critico"; title: string; message: string }[];
};

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

function rank(rows: { label: string; value: number; extra?: string }[], limit = 8): RankedRow[] {
  const total = rows.reduce((acc, r) => acc + r.value, 0);
  return rows
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((r) => ({ ...r, share: pct(r.value, total) }));
}

/**
 * Chave de comparacao de evento: so letras e numeros, minusculo.
 *
 * O MESMO evento chega ao GA4 com dois nomes — `OStrackInstitutionalScenario` e
 * `ostrack_institutional_scenario`, ambos com a mesma contagem. Somar os dois
 * dobraria o numero. Normalizar deixa os dois com a mesma chave.
 */
export function normalizeEventKey(name: string): string {
  return String(name || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/**
 * Junta os nomes duplicados pegando o MAIOR valor do grupo, nao a soma: sao
 * relatos do mesmo evento, entao somar inventaria eventos que nao aconteceram.
 */
export function dedupeEvents(events: GaEventRow[]): GaEventRow[] {
  const grupos = new Map<string, GaEventRow>();
  for (const row of events) {
    const chave = normalizeEventKey(row.eventName);
    if (!chave) continue;
    const atual = grupos.get(chave);
    if (!atual || row.eventCount > atual.eventCount) grupos.set(chave, row);
  }
  return [...grupos.values()];
}

// Clique e lead saem da taxonomia explicita (googleEventTaxonomy).
//
// A primeira versao classificava por padrao amplo (/click|cta/) para corrigir a
// lista `diagnostico_*`, que esta propriedade nunca recebeu. Mas o padrao amplo
// trocou um erro por outro: passou a somar `click` generico, o link interno do
// blog e o CTA do OStrack, misturando propriedades diferentes num numero
// apresentado como desempenho do site da Mydrion.
const PADRAO_VENDA = /^purchase$/;

export function buildGoogleInsights(input: {
  gaConfigured: boolean;
  gscConfigured: boolean;
  events: GaEventRow[];
  pages: GaPageRow[];
  daily: GaDayRow[];
  sources: GaSourceRow[];
  devices: GaDeviceRow[];
  gscTotals: GscTotals | null;
  gscQueries: GscRow[];
  gscPages: GscRow[];
  gscDaily: GscRow[];
}): GoogleInsightsReport {
  const eventos = dedupeEvents(input.events);
  const somaOnde = (teste: (chave: string) => boolean) =>
    eventos.reduce((total, row) => (teste(normalizeEventKey(row.eventName)) ? total + row.eventCount : total), 0);
  const somaEventos = (teste: (eventName: string) => boolean) =>
    eventos.reduce((total, row) => (teste(row.eventName) ? total + row.eventCount : total), 0);

  const sessions = input.daily.reduce((acc, d) => acc + d.sessions, 0);
  const pageView = eventos.find((row) => normalizeEventKey(row.eventName) === "pageview");
  const users = pageView?.activeUsers ?? 0;

  // `views` e so o page_view padrao do GA4. Somar os *_view customizados (blog,
  // institucional, organico) contaria a mesma visita varias vezes e inflaria a
  // base do funil justamente onde ela precisa ser conservadora.
  const views = pageView?.eventCount ?? 0;
  // A taxonomia ja separa clique de lead, entao nao ha risco de contar duas vezes.
  const leads = somaEventos(isMydrionLeadEvent);
  const ctaClicks = somaEventos(isMydrionCtaEvent);
  const sales = somaOnde((chave) => PADRAO_VENDA.test(chave));

  const analytics: GoogleInsightsReport["analytics"] = {
    configured: input.gaConfigured,
    sessions,
    users,
    views,
    ctaClicks,
    leads,
    sales,
    engagementRate: pct(ctaClicks, views),
    funnel: [
      { label: "Visualizacoes", value: views, helper: "page_view" },
      { label: "Cliques em CTA", value: ctaClicks, helper: "mydrion_cta_click + CTAs legados aceitos" },
      { label: "Leads", value: leads, helper: "generate_lead" },
      { label: "Vendas", value: sales, helper: "purchase" },
    ],
    pages: rank(input.pages.map((p) => ({ label: p.pagePath, value: p.sessions, extra: `${p.activeUsers} pessoas` })), 10),
    // Agrupa por CANAL: dez linhas de "google / organic" e variacoes viram uma so.
    channels: rank(
      [...input.sources.reduce((mapa, row) => {
        const canal = row.channel || "Nao classificado";
        mapa.set(canal, (mapa.get(canal) ?? 0) + row.sessions);
        return mapa;
      }, new Map<string, number>())].map(([label, value]) => ({ label, value })),
      8,
    ),
    devices: rank(input.devices.map((d) => ({ label: d.device, value: d.sessions })), 5),
    daily: input.daily.map((d) => ({ day: d.date, sessions: d.sessions, users: d.activeUsers })),
    // Lista ja deduplicada: senao a mesma coisa aparece duas vezes, em
    // PascalCase e snake_case, ocupando duas linhas do ranking.
    events: rank(eventos.map((e) => ({ label: e.eventName, value: e.eventCount })), 10),
  };

  const totals = input.gscTotals ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };

  // A leitura que importa no Search Console: consulta com impressao e ZERO clique
  // e demanda que ja existe e o resultado nao esta capturando. Posicao diz por que:
  // fora da primeira pagina e problema de ranqueamento; bem posicionado e sem
  // clique e problema de titulo e descricao.
  const opportunities: Opportunity[] = input.gscQueries
    .filter((row) => row.impressions > 0 && row.clicks === 0)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10)
    .map((row) => ({
      query: row.key,
      impressions: row.impressions,
      clicks: row.clicks,
      position: row.position,
      motivo:
        row.position > 20
          ? "Longe demais: aparece, mas ninguem rola ate la."
          : row.position > 10
            ? "Segunda pagina: falta forca para subir."
            : "Bem posicionado e sem clique: o titulo e a descricao nao convencem.",
    }));

  // Pareto por impressao: quais consultas concentram a demanda.
  const ordenadas = [...input.gscQueries].sort((a, b) => b.impressions - a.impressions).slice(0, 10);
  const totalImp = ordenadas.reduce((acc, r) => acc + r.impressions, 0);
  let acumulado = 0;
  const pareto = ordenadas
    .filter((r) => r.impressions > 0)
    .map((row) => {
      acumulado += row.impressions;
      return {
        label: row.key,
        value: row.impressions,
        share: pct(row.impressions, totalImp),
        cumulative: pct(acumulado, totalImp),
      };
    });

  const search: GoogleInsightsReport["search"] = {
    configured: input.gscConfigured,
    totals,
    queries: rank(
      input.gscQueries.map((r) => ({
        label: r.key,
        value: r.impressions,
        extra: `${r.clicks} clique(s) · pos. ${r.position.toFixed(0)}`,
      })),
      10,
    ),
    pages: rank(input.gscPages.map((r) => ({ label: r.key, value: r.impressions, extra: `${r.clicks} clique(s)` })), 8),
    daily: input.gscDaily.map((r) => ({ day: r.key, clicks: r.clicks, impressions: r.impressions })),
    opportunities,
    pareto,
  };

  const diagnosis: GoogleInsightsReport["diagnosis"] = [];

  if (!input.gaConfigured) {
    diagnosis.push({ level: "atencao", title: "GA4 desligado", message: "Faltam GA_PROPERTY_ID e as credenciais do service account." });
  }
  if (!input.gscConfigured) {
    diagnosis.push({
      level: "atencao",
      title: "Search Console desligado",
      message: "Sem ele nao da para saber quem procurou e nao entrou. O passo a passo esta no fim desta aba.",
    });
  }

  if (input.gscConfigured && totals.impressions > 0) {
    if (totals.clicks === 0) {
      diagnosis.push({
        level: "critico",
        title: "Aparece na busca e ninguem clica",
        message: `${totals.impressions} impressoes e zero clique. Na posicao media ${totals.position.toFixed(0)}, o site aparece longe demais para ser visto.`,
      });
    } else if (totals.ctr < 1) {
      diagnosis.push({
        level: "atencao",
        title: `CTR de ${totals.ctr.toFixed(1)}%`,
        message: "Abaixo de 1%: aparece bastante e converte pouco. Titulo e descricao sao o primeiro lugar para mexer.",
      });
    }
    if (totals.position > 20) {
      diagnosis.push({
        level: "atencao",
        title: `Posicao media ${totals.position.toFixed(0)}`,
        message: "Fora das duas primeiras paginas. Clique so aparece de verdade a partir do top 10.",
      });
    }
  }

  // O GA4 nao devolve linha para evento com contagem zero. Por isso, a ausencia
  // de CTA no relatorio nao prova falha de instrumentacao nem ausencia de clique.
  // O evento tecnico confirma que a versao atual do contrato esteve ativa.
  if (input.gaConfigured && views > 0 && ctaClicks === 0) {
    const medicaoConfirmada = eventos.some((row) =>
      isMydrionMeasurementEvent(row.eventName)
    );
    diagnosis.push({
      level: "atencao",
      title: medicaoConfirmada
        ? "Nenhum clique de CTA no período"
        : "Medição de CTA ainda não confirmada",
      message: medicaoConfirmada
        ? `${views} visualizações e nenhum clique nos CTAs da Mydrion neste período. A medição está ativa; agora o zero representa comportamento observado.`
        : `${views} visualizações chegaram ao GA4, mas o evento que confirma a medição dos botões não apareceu neste período. Este zero ainda não permite concluir se houve ou não clique.`,
    });
  }

  if (input.gaConfigured && leads === 0 && ctaClicks > 0) {
    diagnosis.push({
      level: "atencao",
      title: "Clique que nao vira lead",
      message: `${ctaClicks} clique(s) em botao e nenhum lead. Ou o caminho depois do clique quebra, ou o evento de lead (WhatsApp/formulario) nao esta sendo disparado.`,
    });
  }

  if (diagnosis.length === 0) {
    diagnosis.push({ level: "ok", title: "Sem alerta", message: "Busca e site dentro do esperado para o volume atual." });
  }

  return { analytics, search, diagnosis };
}
