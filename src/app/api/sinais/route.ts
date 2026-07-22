import { NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { classifySource, normalizeUrl, type TrafficKind } from "@/lib/sinais";

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

// LINHA DE TRAFEGO: cada propriedade digital que traz acesso e uma linha separada
// (link in bio, quiz, site do OStrack, modelos de LP, diagnosticos outbound).
// A classificacao vive em @/lib/sinais porque o Comando usa a mesma regra.
type TrafficSource = {
  key: string;
  label: string;
  kind: TrafficKind;
  views: number;
  linkClicks: number;
  waClicks: number;
  pages: number;
  lastEvent: string;
  hot: boolean;
  // Para onde o visitante clicou nessa linha: responde "como ela esta alimentando o resto".
  destinations: Array<{ label: string; clicks: number }>;
};

export async function GET() {
  try {
    const supabase = getCrmSupabaseAdmin();
    const { data, error } = await supabase
      .from("pixel_events")
      .select("event_name, page_url, client_name, button_name, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;

    const now = Date.now();
    const hotWindowMs = 48 * 60 * 60 * 1000;
    const byCompany = new Map<string, Signal>();
    const byPage = new Map<string, PageStat & { companySet: Set<string> }>();
    const bySource = new Map<
      string,
      Omit<TrafficSource, "destinations" | "pages"> & { pageSet: Set<string>; destMap: Map<string, number> }
    >();

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

        const src = classifySource(page.host, page.label);
        const line =
          bySource.get(src.key) ??
          {
            key: src.key,
            label: src.label,
            kind: src.kind,
            views: 0,
            linkClicks: 0,
            waClicks: 0,
            lastEvent: created,
            hot: false,
            pageSet: new Set<string>(),
            destMap: new Map<string, number>(),
          };

        if (name === "DiagnosticoView") line.views++;
        else if (name === "DiagnosticoWhatsAppClick") line.waClicks++;
        else line.linkClicks++;

        // button_name = texto do link clicado: e o que revela para onde essa
        // linha de trafego esta empurrando gente (WhatsApp, quiz, site X).
        if (name !== "DiagnosticoView") {
          const dest = String(row.button_name ?? "").trim() || "(sem rotulo)";
          line.destMap.set(dest, (line.destMap.get(dest) ?? 0) + 1);
        }

        line.pageSet.add(page.url);
        if (created && created > line.lastEvent) line.lastEvent = created;
        bySource.set(src.key, line);
      }
    }

    // A tabela por empresa e radar de PROSPECT: so entra quem veio de linha outbound.
    // Link in bio e site proprio sao trafego seu e apareceriam como empresa a abordar.
    const outboundCompanies = new Set<string>();
    for (const row of data ?? []) {
      const page = normalizeUrl(row.page_url);
      if (page && classifySource(page.host, page.label).kind === "outbound") {
        outboundCompanies.add((row.client_name ?? "").trim() || "(sem nome na pagina)");
      }
    }

    const signals = [...byCompany.values()]
      .filter((s) => outboundCompanies.has(s.company))
      .map((s) => ({ ...s, hot: Boolean(s.lastEvent) && now - new Date(s.lastEvent).getTime() <= hotWindowMs }))
      .sort((a, b) => (b.lastEvent > a.lastEvent ? 1 : -1));

    const pages: PageStat[] = [...byPage.values()]
      .map(({ companySet, ...p }) => ({
        ...p,
        companies: companySet.size,
        hot: Boolean(p.lastEvent) && now - new Date(p.lastEvent).getTime() <= hotWindowMs,
      }))
      .sort((a, b) => b.views + b.waClicks + b.linkClicks - (a.views + a.waClicks + a.linkClicks));

    const sources: TrafficSource[] = [...bySource.values()]
      .map(({ pageSet, destMap, ...s }) => ({
        ...s,
        pages: pageSet.size,
        hot: Boolean(s.lastEvent) && now - new Date(s.lastEvent).getTime() <= hotWindowMs,
        destinations: [...destMap.entries()]
          .map(([label, clicks]) => ({ label, clicks }))
          .sort((a, b) => b.clicks - a.clicks)
          .slice(0, 6),
      }))
      .sort((a, b) => b.views + b.linkClicks + b.waClicks - (a.views + a.linkClicks + a.waClicks));

    const totals = {
      companies: signals.length,
      views: signals.reduce((a, s) => a + s.views, 0),
      waClicks: signals.reduce((a, s) => a + s.waClicks, 0),
      linkClicks: signals.reduce((a, s) => a + s.linkClicks, 0),
      hot: signals.filter((s) => s.hot).length,
      pages: pages.length,
      sources: sources.length,
    };

    return NextResponse.json({ ok: true, totals, signals, pages, sources });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao agregar sinais" },
      { status: 500 },
    );
  }
}
