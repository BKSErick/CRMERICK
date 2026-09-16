import { NextResponse } from "next/server";
import {
  fetchGaDaily,
  fetchGaDevices,
  fetchGaEvents,
  fetchGaPages,
  fetchGaSources,
  isGaConfigured,
} from "@/lib/googleAnalytics";
import { parseGaHostnames } from "@/lib/googleAnalyticsScope";
import { buildGoogleInsights } from "@/lib/googleInsights";
import {
  fetchGscDaily,
  fetchGscPages,
  fetchGscQueries,
  fetchGscTotals,
  gscUltimoErro,
  isGscConfigured,
} from "@/lib/searchConsole";

// Aba Google dos Funis: GA4 + Search Console na mesma leitura.
//
// Rota separada de /api/google-analytics de proposito. Aquela mantem o contrato
// enxuto espelhado com /api/facebook-pixel (o funil generico consome as duas do
// mesmo jeito); esta faz 9 chamadas e so vale a pena quando a aba esta aberta.
//
// Cada fonte degrada sozinha: sem Search Console o painel mostra so o GA4 e diz
// o que falta, em vez de falhar inteiro.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days") ?? 30), 1), 180);

  const gaConfigured = isGaConfigured();
  const gscConfigured = isGscConfigured();

  try {
    const [events, pages, daily, sources, devices, gscTotals, gscQueries, gscPages, gscDaily] = await Promise.all([
      gaConfigured ? fetchGaEvents(days) : null,
      gaConfigured ? fetchGaPages(days) : null,
      gaConfigured ? fetchGaDaily(days) : null,
      gaConfigured ? fetchGaSources(days) : null,
      gaConfigured ? fetchGaDevices(days) : null,
      gscConfigured ? fetchGscTotals(days) : null,
      gscConfigured ? fetchGscQueries(days) : null,
      gscConfigured ? fetchGscPages(days) : null,
      gscConfigured ? fetchGscDaily(days) : null,
    ]);

    // Credencial presente e resposta nula significa acesso negado, nao ausencia de
    // dado: o service account existe mas nao foi autorizado na propriedade.
    const gaRespondeu = !gaConfigured || events !== null;
    const gscRespondeu = !gscConfigured || gscTotals !== null;

    const report = buildGoogleInsights({
      gaConfigured: gaConfigured && gaRespondeu,
      gscConfigured: gscConfigured && gscRespondeu,
      events: events ?? [],
      pages: pages ?? [],
      daily: daily ?? [],
      sources: sources ?? [],
      devices: devices ?? [],
      gscTotals,
      gscQueries: gscQueries ?? [],
      gscPages: gscPages ?? [],
      gscDaily: gscDaily ?? [],
      hostnames: parseGaHostnames(process.env.GA_HOSTNAMES),
    });

    const avisos: string[] = [];
    if (gaConfigured && !gaRespondeu) {
      avisos.push("GA4 nao respondeu: confira o papel Viewer do service account na propriedade.");
    }
    if (gscConfigured && !gscRespondeu) {
      avisos.push("Search Console nao respondeu: adicione o service account em Configuracoes > Usuarios e permissoes.");
    }

    return NextResponse.json({
      ok: true,
      days,
      gaConfigured,
      gscConfigured,
      // O motivo cru da falha do Search Console: cada causa pede uma acao diferente,
      // entao a tela mostra o texto do Google em vez de um "nao conectado" generico.
      gscErro: gscUltimoErro(),
      message: avisos.join(" ") || `Ultimos ${days} dias.`,
      report,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha ao ler dados do Google." },
      { status: 500 },
    );
  }
}
