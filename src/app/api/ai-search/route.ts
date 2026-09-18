import { NextRequest, NextResponse } from "next/server";
import { requireAiChatAdminSession } from "@/lib/aiChatAuth";
import { normalizeAiQueryPlan, planAiQuery } from "@/lib/aiQueryRouter";
import { retrieveAiEvidence, sanitizeDealSearchTerm } from "@/lib/aiRetrievalBroker";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";

export const runtime = "nodejs";

// Busca deterministica e paginada. A frase nunca vira SQL e nenhum modelo precisa gastar
// tokens para localizar um deal por nome/empresa.
export async function POST(request: NextRequest) {
  const auth = await requireAiChatAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) return NextResponse.json({ ok: false, error: "Informe uma busca." }, { status: 400 });
    const term = sanitizeDealSearchTerm(query);
    if (!term) return NextResponse.json({ ok: false, error: "A busca nao contem um termo seguro." }, { status: 400 });

    const naturalPlan = planAiQuery(query);
    const plan = naturalPlan.intent === "deal_search"
      ? normalizeAiQueryPlan({ ...naturalPlan, filters: { ...naturalPlan.filters, limit: 40 } })
      : normalizeAiQueryPlan({ intent: "deal_search", filters: { textContains: term, limit: 40 } });
    const [evidence] = await retrieveAiEvidence(getCrmSupabaseAdmin(), plan);
    const results = (evidence?.facts ?? []).map((fact) => {
      const row = fact as Record<string, unknown>;
      return {
        id: Number(row.dealId),
        company: String(row.company || row.name || "Sem empresa"),
        stage: String(row.stage ?? ""),
        points: Number(row.points ?? 0),
        segment: String(row.segment ?? ""),
        views: 0,
        waClicks: 0,
        hot: false,
      };
    });
    return NextResponse.json({ ok: true, query, filter: evidence?.filters ?? plan.filters, usedAI: false, count: evidence?.total ?? results.length, results, truncated: evidence?.truncated ?? false });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro na busca." }, { status: 500 });
  }
}
