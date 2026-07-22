import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { aiComplete } from "@/lib/aiComplete";
import { getCompanySignals, signalAliases, type CompanySignal } from "@/lib/sinais";

export const runtime = "nodejs";

// #5 Busca em linguagem natural sobre os leads. A IA traduz a frase numa consulta
// estruturada (JSON), que é aplicada de forma determinística sobre deals + sinais.
// A IA nunca toca no banco — só interpreta a intenção. Sem IA, cai no busca textual.

type Filter = {
  textContains?: string;
  stageIn?: string[];
  hotOnly?: boolean;
  minViews?: number;
  clickedWhatsapp?: boolean;
  sinceDays?: number;
  minPoints?: number;
};

const STAGES = ["prospect", "abordado", "followup", "qualified", "proposal", "negotiation", "won", "lost"];

function parseFilter(raw: string): Filter | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const obj = JSON.parse(match[0]) as Filter;
    const f: Filter = {};
    if (typeof obj.textContains === "string" && obj.textContains.trim()) f.textContains = obj.textContains.trim().toLowerCase();
    if (Array.isArray(obj.stageIn)) f.stageIn = obj.stageIn.filter((s) => STAGES.includes(s));
    if (obj.hotOnly === true) f.hotOnly = true;
    if (obj.clickedWhatsapp === true) f.clickedWhatsapp = true;
    if (Number.isFinite(obj.minViews)) f.minViews = Number(obj.minViews);
    if (Number.isFinite(obj.sinceDays)) f.sinceDays = Number(obj.sinceDays);
    if (Number.isFinite(obj.minPoints)) f.minPoints = Number(obj.minPoints);
    return f;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) return NextResponse.json({ ok: false, error: "Informe uma busca." }, { status: 400 });

    const supabase = getCrmSupabaseAdmin();

    const system = `Você converte uma busca em português sobre leads de um CRM num objeto JSON de filtro. Responda SOMENTE com o JSON, sem texto ao redor.
Campos possíveis (todos opcionais):
- "textContains": termo livre para casar em empresa/segmento (ex: "usinagem", "solda").
- "stageIn": lista de estágios entre ${STAGES.join(", ")}.
- "hotOnly": true se pedir quem está quente/ativo/engajado agora.
- "clickedWhatsapp": true se pedir quem clicou no WhatsApp.
- "minViews": número mínimo de aberturas de página.
- "sinceDays": janela em dias para "essa semana" (7), "hoje" (1), "esse mês" (30).
- "minPoints": score mínimo (0 a 10).
Exemplos:
"leads de usinagem que abriram a página essa semana" -> {"textContains":"usinagem","minViews":1,"sinceDays":7}
"quem clicou no whatsapp e está quente" -> {"clickedWhatsapp":true,"hotOnly":true}
"prospects com score acima de 7" -> {"stageIn":["prospect"],"minPoints":7}`;

    const ai = await aiComplete(system, query);
    // Fallback determinístico: sem IA, busca textual pura pelo termo digitado.
    const filter: Filter = (ai && parseFilter(ai.content)) || { textContains: query.toLowerCase() };

    const [dealsRes, signalIndex] = await Promise.all([
      supabase.from("deals").select("id, company, name, stage, points, segment, site_url, contact_id").limit(2000),
      getCompanySignals(supabase).catch(() => new Map<string, CompanySignal>()),
    ]);

    const now = Date.now();
    const results = (dealsRes.data ?? [])
      .map((d) => {
        const company = String(d.company ?? "");
        let signal: CompanySignal | null = null;
        for (const alias of [...signalAliases(company), ...signalAliases(String(d.name ?? ""))]) {
          const hit = signalIndex.get(alias);
          if (hit) { signal = hit; break; }
        }
        return { d, company, signal };
      })
      .filter(({ d, company, signal }) => {
        if (filter.textContains) {
          const hay = `${company} ${String(d.segment ?? "")}`.toLowerCase();
          if (!hay.includes(filter.textContains)) return false;
        }
        if (filter.stageIn && filter.stageIn.length > 0 && !filter.stageIn.includes(String(d.stage))) return false;
        if (filter.minPoints != null && Number(d.points ?? 0) < filter.minPoints) return false;
        if (filter.hotOnly && !signal?.hot) return false;
        if (filter.clickedWhatsapp && !(signal && signal.waClicks > 0)) return false;
        if (filter.minViews != null && !(signal && signal.views >= filter.minViews)) return false;
        if (filter.sinceDays != null) {
          if (!signal?.lastEvent) return false;
          const days = (now - new Date(signal.lastEvent).getTime()) / 86400000;
          if (days > filter.sinceDays) return false;
        }
        return true;
      })
      .map(({ d, company, signal }) => ({
        id: Number(d.id),
        company,
        stage: String(d.stage ?? ""),
        points: Number(d.points ?? 0),
        segment: String(d.segment ?? ""),
        views: signal?.views ?? 0,
        waClicks: signal?.waClicks ?? 0,
        hot: signal?.hot ?? false,
      }))
      .sort((a, b) => Number(b.hot) - Number(a.hot) || b.views - a.views || b.points - a.points)
      .slice(0, 40);

    return NextResponse.json({ ok: true, query, filter, usedAI: Boolean(ai), count: results.length, results });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro na busca." },
      { status: 500 },
    );
  }
}
