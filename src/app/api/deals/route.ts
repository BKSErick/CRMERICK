import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { mapDealFromRow, mapDealToRow } from "@/lib/crmRecords";

export const runtime = "nodejs";

function getId(request: NextRequest, body?: Record<string, unknown>) {
  const fromQuery = request.nextUrl.searchParams.get("id");
  const rawId = fromQuery ?? body?.id;
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function errorResponse(error: unknown, status = 500) {
  return NextResponse.json(
    {
      ok: false,
      error: error instanceof Error ? error.message : "Erro inesperado em /api/deals",
    },
    { status },
  );
}

export async function GET() {
  try {
    const supabase = getCrmSupabaseAdmin();
    const { data, error } = await supabase.from("deals").select("*").order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ ok: true, deals: (data ?? []).map(mapDealFromRow), source: "supabase" });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const payload = mapDealToRow(body);

    if (!payload.name && !payload.company) {
      return errorResponse(new Error("Nome ou empresa do deal e obrigatorio."), 400);
    }

    const { data, error } = await supabase.from("deals").insert(payload).select("*").single();
    if (error) throw error;

    return NextResponse.json({ ok: true, deal: mapDealFromRow(data) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const id = getId(request, body);
    if (!id) return errorResponse(new Error("id do deal e obrigatorio."), 400);

    const updates = { ...body };
    delete updates.id;
    const payload = mapDealToRow(updates);
    const { data, error } = await supabase.from("deals").update(payload).eq("id", id).select("*").single();
    if (error) throw error;

    return NextResponse.json({ ok: true, deal: mapDealFromRow(data) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const id = getId(request);
    if (!id) return errorResponse(new Error("id do deal e obrigatorio."), 400);

    const { error } = await supabase.from("deals").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
