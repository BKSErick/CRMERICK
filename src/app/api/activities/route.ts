import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";

// Feed de atividade REAL do deal. A tabela public.activities tem RLS deny-by-default; a escrita
// e a leitura acontecem so aqui, server-side, via service-role (nunca exposta ao cliente).
// Substitui o feed fabricado que existia no modal do pipeline (Story 013).

export const runtime = "nodejs";

type ActivityRow = {
  id: number;
  deal_id: number | null;
  type: string | null;
  description: string | null;
  created_at: string | null;
};

function errorResponse(error: unknown, status = 500) {
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Erro inesperado em /api/activities" },
    { status },
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const rawDealId = request.nextUrl.searchParams.get("dealId");
    const dealId = Number(rawDealId);
    if (!Number.isInteger(dealId) || dealId <= 0) {
      return errorResponse(new Error("dealId valido e obrigatorio."), 400);
    }

    const { data, error } = await supabase
      .from("activities")
      .select("id, deal_id, type, description, created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, activities: (data ?? []) as ActivityRow[] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const dealId = Number(body?.dealId);
    const type = typeof body?.type === "string" ? body.type : "note";
    const description = typeof body?.description === "string" ? body.description.trim() : "";

    if (!Number.isInteger(dealId) || dealId <= 0) {
      return errorResponse(new Error("dealId valido e obrigatorio."), 400);
    }
    if (!description) {
      return errorResponse(new Error("description e obrigatoria."), 400);
    }

    const { data, error } = await supabase
      .from("activities")
      .insert({ deal_id: dealId, type, description })
      .select("id, deal_id, type, description, created_at")
      .single();

    if (error) throw error;

    // Disparo move o lead Prospect -> Abordado automaticamente (so promove quem ainda
    // esta em prospect; nunca rebaixa quem ja respondeu/avancou). Best-effort.
    if (type === "whatsapp_sent") {
      await supabase
        .from("deals")
        .update({ stage: "abordado" })
        .eq("id", dealId)
        .eq("stage", "prospect");
    }

    return NextResponse.json({ ok: true, activity: data as ActivityRow }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
