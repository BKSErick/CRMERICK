import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { classifySource, emailDealRef, isTestTrafficUrl, normalizeUrl, signalEventKind } from "@/lib/sinais";

type PixelEventBody = {
  eventName?: string;
  pageUrl?: string;
  clientName?: string;
  leadEmail?: string;
  leadPhone?: string;
  buttonName?: string;
  testEventCode?: string;
  gaClientId?: string;
};

const API_VERSION = process.env.META_API_VERSION ?? "v25.0";
const DEFAULT_META_DATASET_ID = "1175331711422463";
const DATASET_ID =
  process.env.META_DATASET_ID ??
  process.env.FACEBOOK_PIXEL_ID ??
  process.env.NEXT_PUBLIC_META_PIXEL_ID ??
  DEFAULT_META_DATASET_ID;
const META_TOKEN =
  process.env.META_API_TOKEN ??
  process.env.META_SYSTEM_USER_TOKEN ??
  process.env.VITE_META_TOKEN ??
  process.env.FACEBOOK_ACCESS_TOKEN;
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE;

// GA4 Measurement Protocol — perna server-side espelhando a CAPI da Meta.
// O api_secret e POR STREAM: este par tem que ser do mesmo stream que as paginas
// carregam no gtag, senao o GA4 aceita o POST e descarta o evento em silencio.
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const GA_API_SECRET = process.env.GA_MEASUREMENT_PROTOCOL_SECRET;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

type Metrics = {
  views: number;
  ctaClicks: number;
  reportClicks: number;
  ostrackClicks: number;
  leads: number;
  sales: number;
};

const EMPTY_METRICS: Metrics = { views: 0, ctaClicks: 0, reportClicks: 0, ostrackClicks: 0, leads: 0, sales: 0 };

// As paginas de diagnostico (huberick) sao servidas fora do dominio do CRM,
// entao o endpoint aceita POST cross-origin.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function hash(value?: string) {
  if (!value) return undefined;
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function normalizePhone(phone?: string) {
  if (!phone) return undefined;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!digits.startsWith("55") && digits.length <= 11) digits = `55${digits}`;
  return digits;
}

function supabaseHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_KEY as string,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// Persiste o evento no Supabase (best-effort) para o read-back agregado do funil.
// clientName vem resolvido: para visita do e-mail frio e o deals.company, e assim o
// radar de Sinais e o Comando (getCompanySignals) agrupam pela empresa certa.
async function persistEvent(body: PixelEventBody, eventName: string, clientName: string | null): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pixel_events`, {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({
        event_name: eventName,
        page_url: body.pageUrl ?? null,
        client_name: clientName,
        button_name: body.buttonName ?? null,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

type SignalDeal = { id: number; company: string; origin: "email" | "outbound" };

// Qual card recebe o sinal. Dois caminhos:
// - e-mail frio: o link leva utm_content=d<dealId> e o site proprio manda o beacon
//   com a URL inteira; o id vale mais que qualquer casamento por nome.
// - pagina OUTBOUND (diagnostico/LP de um prospect): casa client_name com
//   deals.company. Inbound sem referencia (bio, site) nao mapeia para deal.
async function resolveSignalDeal(body: PixelEventBody): Promise<SignalDeal | null> {
  try {
    const supabase = getCrmSupabaseAdmin();
    const ref = emailDealRef(body.pageUrl);
    if (ref !== null) {
      const { data } = await supabase.from("deals").select("id, company").eq("id", ref).maybeSingle();
      return data ? { id: (data as { id: number }).id, company: String((data as { company: string }).company ?? ""), origin: "email" } : null;
    }

    const page = normalizeUrl(body.pageUrl);
    if (page && classifySource(page.host, page.label).kind !== "outbound") return null;

    const company = (body.clientName ?? "").trim();
    if (!company) return null;

    // Nomes do Garimpo truncam ("ABC Metal - Caixa de... - Por..."), entao o
    // client_name da pagina raramente casa exato com deals.company. Tenta exato e,
    // se falhar, casa pelo prefixo antes do primeiro " - ".
    const prefix = company.split(" - ")[0].trim();
    const candidates = prefix && prefix !== company ? [company, `${prefix}%`] : [company];
    for (const pattern of candidates) {
      const { data } = await supabase.from("deals").select("id, company").ilike("company", pattern).limit(1).maybeSingle();
      if (data) return { id: (data as { id: number }).id, company: String((data as { company: string }).company ?? ""), origin: "outbound" };
    }
    return null;
  } catch {
    return null;
  }
}

// Fio 1: o sinal vira evento na timeline do deal. Aberturas são deduplicadas
// (1 por deal a cada 12h) para o histórico não encher de "abriu a página"; cliques
// entram sempre; profundidade de rolagem fica só no pixel_events.
async function logSignalActivity(body: PixelEventBody, eventName: string, deal: SignalDeal | null): Promise<void> {
  if (!deal) return;
  try {
    const kind = signalEventKind(eventName);
    if (kind === "scroll") return;

    const supabase = getCrmSupabaseAdmin();
    if (kind === "view") {
      const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("activities")
        .select("id")
        .eq("deal_id", deal.id)
        .eq("type", "signal_view")
        .gte("created_at", since)
        .limit(1);
      if (recent && recent.length > 0) return;
    }

    const type = kind === "view" ? "signal_view" : kind === "whatsapp" ? "signal_whatsapp" : "signal_click";
    const onde = deal.origin === "email" ? "no site, vindo do e-mail frio" : "na página de diagnóstico";
    const description =
      kind === "view"
        ? deal.origin === "email" ? "Abriu o site pelo e-mail frio" : "Abriu a página de diagnóstico"
        : kind === "whatsapp"
          ? `Clicou no WhatsApp ${onde}`
          : `Clicou em "${(body.buttonName ?? "link").slice(0, 60)}" ${onde}`;

    await supabase.from("activities").insert({ deal_id: deal.id, type, description });
  } catch {
    // best-effort: o sinal nunca pode quebrar o beacon do pixel
  }
}

// GA4 so aceita nome de evento snake_case (<=40 chars, comeca com letra).
// Os eventos conhecidos sao mapeados na mao porque o camelCase automatico gera
// nome ruim no relatorio ("diagnostico_whats_app_click").
const GA_EVENT_NAMES: Record<string, string> = {
  DiagnosticoView: "diagnostico_view",
  DiagnosticoWhatsAppClick: "diagnostico_whatsapp_click",
  DiagnosticoLinkClick: "diagnostico_link_click",
  DiagnosticoOStrackClick: "diagnostico_ostrack_click",
  MydrionSiteView: "mydrion_site_view",
  MydrionSiteScrollDepth: "mydrion_site_scroll_depth",
  MydrionSiteCtaClick: "mydrion_site_cta_click",
  MydrionSiteWhatsAppClick: "mydrion_site_whatsapp_click",
};

function toGaEventName(eventName: string): string {
  const known = GA_EVENT_NAMES[eventName];
  if (known) return known;

  return eventName
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

// Espelha o evento no GA4 via Measurement Protocol. Best-effort: nunca pode
// derrubar o beacon nem atrasar a resposta do CAPI.
async function sendGaEvent(body: PixelEventBody, eventName: string): Promise<boolean> {
  if (!GA_MEASUREMENT_ID || !GA_API_SECRET) return false;

  // Sem client_id o GA4 conta cada evento como um usuario novo e nao junta com a
  // sessao do browser. O beacon manda o cid do cookie _ga; o random e ultimo caso.
  const clientId = body.gaClientId?.trim() || `${Date.now()}.${Math.floor(Math.random() * 1e9)}`;

  try {
    const res = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          events: [
            {
              name: toGaEventName(eventName),
              params: {
                // Sem engagement_time_msec o evento nao abre sessao no relatorio.
                engagement_time_msec: "1",
                page_location: body.pageUrl?.slice(0, 100),
                client_name: body.clientName?.slice(0, 100),
                button_name: body.buttonName?.slice(0, 100),
                crm_source: "CRM Erick diagnostico",
              },
            },
          ],
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// Lê o resumo agregado (só contagens) via RPC SECURITY DEFINER.
async function fetchSummary(): Promise<Metrics | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pixel_event_summary`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: "{}",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = await res.json();
    return {
      views: Number(j?.views) || 0,
      ctaClicks: Number(j?.ctaClicks) || 0,
      reportClicks: Number(j?.reportClicks) || 0,
      ostrackClicks: Number(j?.ostrackClicks) || 0,
      leads: Number(j?.leads) || 0,
      sales: Number(j?.sales) || 0,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const configured = Boolean(DATASET_ID && META_TOKEN);
  const summary = await fetchSummary();

  if (!summary) {
    return NextResponse.json({
      status: "fallback",
      configured,
      source: "facebook-pixel",
      metrics: EMPTY_METRICS,
      message: configured
        ? "Pixel configurado; Supabase indisponivel para ler eventos persistidos."
        : "Configure META_API_TOKEN, META_SYSTEM_USER_TOKEN ou VITE_META_TOKEN para ativar o Facebook Pixel.",
    });
  }

  const total = summary.views + summary.ctaClicks + summary.reportClicks + summary.ostrackClicks + summary.leads + summary.sales;
  return NextResponse.json({
    status: "ready",
    configured,
    source: "supabase:pixel_events",
    metrics: summary,
    message:
      total > 0
        ? `${total} eventos reais persistidos das paginas de diagnostico.`
        : "Pixel pronto; aguardando os primeiros eventos das paginas de diagnostico.",
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as PixelEventBody;
  const eventName = body.eventName ?? "DiagnosticoView";

  if (isTestTrafficUrl(body.pageUrl)) {
    return NextResponse.json(
      {
        ok: true,
        persisted: false,
        gaSent: false,
        status: "ignored_test_traffic",
        message: "Evento local de teste ignorado.",
      },
      { status: 200, headers: CORS_HEADERS },
    );
  }

  // 0) Qual card e esse sinal (referencia do e-mail ou pagina outbound), se algum.
  const deal = await resolveSignalDeal(body);

  // 1) Persiste SEMPRE (independe do CAPI) para alimentar o funil. Visita vinda do
  //    e-mail grava a empresa do card, nao o rotulo do site, para o radar agrupar certo.
  const clientName = deal?.origin === "email" && deal.company ? deal.company : (body.clientName ?? null);
  const persisted = await persistEvent(body, eventName, clientName);

  // 1b) Fio 1: reflete o sinal na timeline do deal casado (best-effort).
  await logSignalActivity(body, eventName, deal);

  // 1c) Espelha no GA4 server-side. Independe do CAPI: se o token Meta cair, o
  // GA4 continua recebendo.
  const gaSent = await sendGaEvent(body, eventName);

  // 2) Envia ao Meta CAPI, se configurado.
  if (!DATASET_ID || !META_TOKEN) {
    return NextResponse.json(
      {
        ok: persisted,
        persisted,
        gaSent,
        status: "stored_only",
        message: "Evento salvo no CRM. Token Meta nao configurado para CAPI (META_API_TOKEN).",
      },
      { status: 202, headers: CORS_HEADERS },
    );
  }

  const phone = normalizePhone(body.leadPhone);
  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: body.pageUrl,
        user_data: {
          em: body.leadEmail ? [hash(body.leadEmail)] : undefined,
          ph: phone ? [hash(phone)] : undefined,
        },
        custom_data: {
          client_name: body.clientName,
          button_name: body.buttonName,
          crm_source: "CRM Erick diagnostico",
        },
      },
    ],
    test_event_code: body.testEventCode ?? TEST_EVENT_CODE,
  };

  const response = await fetch(`https://graph.facebook.com/${API_VERSION}/${DATASET_ID}/events?access_token=${META_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const meta = await response.json().catch(() => ({}));

  return NextResponse.json(
    {
      ok: response.ok && !meta.error,
      persisted,
      gaSent,
      status: response.ok && !meta.error ? "sent" : "error",
      eventsReceived: meta.events_received ?? 0,
      fbtraceId: meta.fbtrace_id,
      error: meta.error?.message,
    },
    { status: response.ok ? 200 : 400, headers: CORS_HEADERS },
  );
}
