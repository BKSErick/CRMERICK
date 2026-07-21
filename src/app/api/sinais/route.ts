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

// Volume por PAGINA (nao por empresa): mostra de onde vem o trafego — qual modelo
// de site ou pagina de diagnostico esta puxando acesso. Query string e hash saem
// fora para nao fragmentar a mesma pagina em varias linhas.
type PageStat = {
  pageUrl: string;
  label: string;
  host: string;
  views: number;
  waClicks: number;
  linkClicks: number;
  companies: number;
  lastEvent: string;
  hot: boolean;
};

function normalizeUrl(raw: unknown): { url: string; label: string; host: string } | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const path = parsed.pathname.replace(/\/index\.html$/i, "/").replace(/(.)\/$/, "$1");
    return {
      url: `${parsed.origin}${path}`,
      label: path === "" ? "/" : path,
      host: parsed.host,
    };
  } catch {
    return { url: value, label: value, host: "" };
  }
}

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
    const byPage = new Map<string, PageStat & { companySet: Set<string> }>();

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

      const page = normalizeUrl(row.page_url);
      if (page) {
        const stat =
          byPage.get(page.url) ??
          {
            pageUrl: page.url,
            label: page.label,
            host: page.host,
            views: 0,
            waClicks: 0,
            linkClicks: 0,
            companies: 0,
            lastEvent: created,
            hot: false,
            companySet: new Set<string>(),
          };

        if (name === "DiagnosticoView") stat.views++;
        else if (name === "DiagnosticoWhatsAppClick") stat.waClicks++;
        else stat.linkClicks++;

        stat.companySet.add(company);
        if (created && created > stat.lastEvent) stat.lastEvent = created;
        byPage.set(page.url, stat);
      }
    }

    const signals = [...byCompany.values()]
      .map((s) => ({ ...s, hot: Boolean(s.lastEvent) && now - new Date(s.lastEvent).getTime() <= hotWindowMs }))
      .sort((a, b) => (b.lastEvent > a.lastEvent ? 1 : -1));

    const pages: PageStat[] = [...byPage.values()]
      .map(({ companySet, ...p }) => ({
        ...p,
        companies: companySet.size,
        hot: Boolean(p.lastEvent) && now - new Date(p.lastEvent).getTime() <= hotWindowMs,
      }))
      .sort((a, b) => b.views + b.waClicks + b.linkClicks - (a.views + a.waClicks + a.linkClicks));

    const totals = {
      companies: signals.length,
      views: signals.reduce((a, s) => a + s.views, 0),
      waClicks: signals.reduce((a, s) => a + s.waClicks, 0),
      linkClicks: signals.reduce((a, s) => a + s.linkClicks, 0),
      hot: signals.filter((s) => s.hot).length,
      pages: pages.length,
    };

    return NextResponse.json({ ok: true, totals, signals, pages });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao agregar sinais" },
      { status: 500 },
    );
  }
}
