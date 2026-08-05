import { NextResponse } from "next/server";
import { fetchGaEvents, fetchGaPages, isGaConfigured } from "@/lib/googleAnalytics";

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

// Nomes snake_case gravados pelo Measurement Protocol em /api/facebook-pixel.
const EVENT_MAP: Record<keyof Omit<Metrics, "users">, string[]> = {
  views: ["diagnostico_view", "page_view"],
  ctaClicks: ["diagnostico_link_click"],
  reportClicks: ["diagnostico_report_click"],
  ostrackClicks: ["diagnostico_ostrack_click"],
  leads: ["diagnostico_whatsapp_click", "generate_lead"],
  sales: ["purchase"],
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

  const byName = new Map(events.map((row) => [row.eventName, row]));
  const sum = (names: string[], field: "eventCount" | "activeUsers" = "eventCount") =>
    names.reduce((total, name) => total + (byName.get(name)?.[field] ?? 0), 0);

  const metrics: Metrics = {
    views: sum(EVENT_MAP.views),
    ctaClicks: sum(EVENT_MAP.ctaClicks),
    reportClicks: sum(EVENT_MAP.reportClicks),
    ostrackClicks: sum(EVENT_MAP.ostrackClicks),
    leads: sum(EVENT_MAP.leads),
    sales: sum(EVENT_MAP.sales),
    // activeUsers do page_view aproxima "quem chegou", nao a soma dos eventos.
    users: byName.get("page_view")?.activeUsers ?? 0,
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
        ? `${total} eventos no GA4 nos ultimos 30 dias.`
        : "GA4 conectado; aguardando os primeiros eventos das paginas.",
  });
}
