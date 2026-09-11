import { NextResponse } from "next/server";
import { fetchGaEvents, fetchGaPages, isGaConfigured } from "@/lib/googleAnalytics";
import { isMydrionCtaEvent, isMydrionLeadEvent } from "@/lib/googleEventTaxonomy";

// Espelha o contrato de /api/facebook-pixel para o funil poder tratar as duas
// fontes do mesmo jeito: { status, configured, source, metrics, message }.

type Metrics = {
  views: number;
  ctaClicks: number;
  reportClicks: number;
  ostrackClicks: number;
  leads: number;
  sales: number;
  users: number;
};

const EMPTY_METRICS: Metrics = {
  views: 0,
  ctaClicks: 0,
  reportClicks: 0,
  ostrackClicks: 0,
  leads: 0,
  sales: 0,
  users: 0,
};

export async function GET() {
  const configured = isGaConfigured();

  if (!configured) {
    return NextResponse.json({
      status: "fallback",
      configured,
      source: "google-analytics",
      metrics: EMPTY_METRICS,
      pages: [],
      message:
        "Configure GA_PROPERTY_ID, GA_SERVICE_ACCOUNT_EMAIL e GA_SERVICE_ACCOUNT_PRIVATE_KEY para ler o GA4.",
    });
  }

  const [events, pages] = await Promise.all([fetchGaEvents(30), fetchGaPages(30)]);

  if (!events) {
    return NextResponse.json({
      status: "fallback",
      configured,
      source: "google-analytics",
      metrics: EMPTY_METRICS,
      pages: [],
      message: "Credenciais presentes, mas o GA4 nao respondeu. Confira o acesso do service account na propriedade.",
    });
  }

  const pageView = events.find((row) => row.eventName === "page_view");
  const sumWhere = (predicate: (eventName: string) => boolean) =>
    events.reduce((total, row) => predicate(row.eventName) ? total + row.eventCount : total, 0);

  const metrics: Metrics = {
    views: pageView?.eventCount ?? 0,
    ctaClicks: sumWhere(isMydrionCtaEvent),
    // Campos legados mantidos no contrato da resposta. O recorte atual mede o
    // site Mydrion, portanto diagnosticos e OStrack nao entram nesses totais.
    reportClicks: 0,
    ostrackClicks: 0,
    leads: sumWhere(isMydrionLeadEvent),
    sales: sumWhere((eventName) => eventName.toLowerCase() === "purchase"),
    // activeUsers do page_view aproxima "quem chegou", nao a soma dos eventos.
    users: pageView?.activeUsers ?? 0,
  };

  const total = events.reduce((acc, row) => acc + row.eventCount, 0);

  return NextResponse.json({
    status: "ready",
    configured,
    source: "ga4:runReport",
    metrics,
    pages: pages ?? [],
    message:
      total > 0
        ? `${total} eventos do site Mydrion no GA4 nos ultimos 30 dias.`
        : "GA4 conectado; aguardando os primeiros eventos das paginas.",
  });
}
