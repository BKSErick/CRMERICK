import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { classifySource, normalizeUrl } from "@/lib/sinais";

type PixelEventBody = {
  eventName?: string;
  pageUrl?: string;
  clientName?: string;
  leadEmail?: string;
  leadPhone?: string;
  buttonName?: string;
  testEventCode?: string;
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
async function persistEvent(body: PixelEventBody, eventName: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pixel_events`, {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({
        event_name: eventName,
        page_url: body.pageUrl ?? null,
        client_name: body.clientName ?? null,
        button_name: body.buttonName ?? null,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Fio 1: o sinal vira evento na timeline do deal. Só para páginas OUTBOUND
// (diagnóstico/LP ligada a um prospect) — inbound (bio/site próprio) não mapeia
// para um deal. Aberturas são deduplicadas (1 por deal a cada 12h) para o
// histórico não encher de "abriu a página"; cliques entram sempre.
async function logSignalActivity(body: PixelEventBody, eventName: string): Promise<void> {
  try {
    const page = normalizeUrl(body.pageUrl);
    if (page && classifySource(page.host, page.label).kind !== "outbound") return;

    const company = (body.clientName ?? "").trim();
    if (!company) return;

    const supabase = getCrmSupabaseAdmin();
    // Nomes do Garimpo truncam ("ABC Metal - Caixa de... - Por..."), entao o
    // client_name da pagina raramente casa exato com deals.company. Tenta exato e,
    // se falhar, casa pelo prefixo antes do primeiro " - ".
    const prefix = company.split(" - ")[0].trim();
    const candidates = prefix && prefix !== company ? [company, `${prefix}%`] : [company];
    let deal: { id: number } | null = null;
    for (const pattern of candidates) {
      const { data } = await supabase.from("deals").select("id").ilike("company", pattern).limit(1).maybeSingle();
      if (data) { deal = data as { id: number }; break; }
    }
    if (!deal) return;

    const isView = eventName === "DiagnosticoView";
    if (isView) {
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

    const type = isView
      ? "signal_view"
      : eventName === "DiagnosticoWhatsAppClick"
        ? "signal_whatsapp"
        : "signal_click";
    const description = isView
      ? "Abriu a página de diagnóstico"
      : eventName === "DiagnosticoWhatsAppClick"
        ? "Clicou no WhatsApp na página de diagnóstico"
        : `Clicou em "${(body.buttonName ?? "link").slice(0, 60)}" na página`;

    await supabase.from("activities").insert({ deal_id: deal.id, type, description });
  } catch {
    // best-effort: o sinal nunca pode quebrar o beacon do pixel
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

  // 1) Persiste SEMPRE (independe do CAPI) para alimentar o funil.
  const persisted = await persistEvent(body, eventName);

  // 1b) Fio 1: reflete o sinal na timeline do deal casado (best-effort).
  await logSignalActivity(body, eventName);

  // 2) Envia ao Meta CAPI, se configurado.
  if (!DATASET_ID || !META_TOKEN) {
    return NextResponse.json(
      {
        ok: persisted,
        persisted,
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
      status: response.ok && !meta.error ? "sent" : "error",
      eventsReceived: meta.events_received ?? 0,
      fbtraceId: meta.fbtrace_id,
      error: meta.error?.message,
    },
    { status: response.ok ? 200 : 400, headers: CORS_HEADERS },
  );
}
