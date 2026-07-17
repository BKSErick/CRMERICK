import { NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";

// Sinais de interesse do funil outbound: agrega os eventos reais das paginas de
// diagnostico (tabela pixel_events, RLS deny-by-default, leitura so aqui via
// service-role). Quem abriu a auditoria ou clicou no WhatsApp e o lead mais quente
// do funil: essa leitura alimenta o follow-up.

export const runtime = "nodejs";

type Signal = {
  company: string;
  pageUrl: string | null;
  views: number;
  waClicks: number;
  linkClicks: number;
  firstEvent: string;
  lastEvent: string;
  hot: boolean;
};

export async function GET() {
  try {
    const supabase = getCrmSupabaseAdmin();
    const { data, error } = await supabase
      .from("pixel_events")
      .select("event_name, page_url, client_name, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;

    const now = Date.now();
    const hotWindowMs = 48 * 60 * 60 * 1000;
    const byCompany = new Map<string, Signal>();

    for (const row of data ?? []) {
      const company = (row.client_name ?? "").trim() || "(sem nome na pagina)";
      const created = row.created_at ? String(row.created_at) : "";
      const entry =
        byCompany.get(company) ??
        ({
          company,
          pageUrl: (row.page_url as string) ?? null,
          views: 0,
          waClicks: 0,
          linkClicks: 0,
          firstEvent: created,
          lastEvent: created,
          hot: false,
        } as Signal);

      const name = String(row.event_name ?? "");
      if (name === "DiagnosticoView") entry.views++;
      else if (name === "DiagnosticoWhatsAppClick") entry.waClicks++;
      else entry.linkClicks++;

      if (created && created < entry.firstEvent) entry.firstEvent = created;
      if (created && created > entry.lastEvent) entry.lastEvent = created;
      if (!entry.pageUrl && row.page_url) entry.pageUrl = row.page_url as string;
      byCompany.set(company, entry);
    }

    const signals = [...byCompany.values()]
      .map((s) => ({ ...s, hot: Boolean(s.lastEvent) && now - new Date(s.lastEvent).getTime() <= hotWindowMs }))
      .sort((a, b) => (b.lastEvent > a.lastEvent ? 1 : -1));

    const totals = {
      companies: signals.length,
      views: signals.reduce((a, s) => a + s.views, 0),
      waClicks: signals.reduce((a, s) => a + s.waClicks, 0),
      linkClicks: signals.reduce((a, s) => a + s.linkClicks, 0),
      hot: signals.filter((s) => s.hot).length,
    };

    return NextResponse.json({ ok: true, totals, signals });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao agregar sinais" },
      { status: 500 },
    );
  }
}
