import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";

// Repositorio de insights do loop de aprendizado. Escrita/leitura server-side via
// service-role (tabela insights tem RLS deny-by-default). Insights sao gerados pela
// acao generate-insight do /api/ai ou inseridos manualmente aqui (POST).

export const runtime = "nodejs";

function errorResponse(error: unknown, status = 500) {
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Erro inesperado em /api/insights" },
    { status },
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const dealId = request.nextUrl.searchParams.get("dealId");
    let query = supabase.from("insights").select("*").order("created_at", { ascending: false });
    if (dealId) query = query.eq("deal_id", Number(dealId));
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true, insights: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) return errorResponse(new Error("content e obrigatorio."), 400);

    const row = {
      deal_id: body?.dealId ? Number(body.dealId) : null,
      company: typeof body?.company === "string" ? body.company : null,
      type: typeof body?.type === "string" ? body.type : "geral",
      content,
    };
    const { data, error } = await supabase.from("insights").insert(row).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, insight: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) return errorResponse(new Error("id e obrigatorio."), 400);

    const patch: Record<string, unknown> = {};
    if (typeof body?.content === "string" && body.content.trim()) patch.content = body.content.trim();
    if (typeof body?.type === "string" && body.type.trim()) patch.type = body.type.trim();
    if (typeof body?.company === "string") patch.company = body.company.trim() || null;
    if (Object.keys(patch).length === 0) return errorResponse(new Error("Nada para atualizar."), 400);

    const { data, error } = await supabase.from("insights").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, insight: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return errorResponse(new Error("id e obrigatorio."), 400);
    const { error } = await supabase.from("insights").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
