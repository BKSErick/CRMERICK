import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { mapContactFromRow, mapContactToRow } from "@/lib/crmRecords";

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
      error: error instanceof Error ? error.message : "Erro inesperado em /api/contacts",
    },
    { status },
  );
}

export async function GET() {
  try {
    const supabase = getCrmSupabaseAdmin();
    const { data, error } = await supabase.from("contacts").select("*").order("name", { ascending: true });
    if (error) throw error;

    return NextResponse.json({ ok: true, contacts: (data ?? []).map(mapContactFromRow), source: "supabase" });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const payload = mapContactToRow(body);

    if (!payload.name) {
      return errorResponse(new Error("Nome do contato e obrigatorio."), 400);
    }

    const { data, error } = await supabase.from("contacts").insert(payload).select("*").single();
    if (error) throw error;

    return NextResponse.json({ ok: true, contact: mapContactFromRow(data) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const id = getId(request, body);
    if (!id) return errorResponse(new Error("id do contato e obrigatorio."), 400);

    const updates = { ...body };
    delete updates.id;
    const payload = mapContactToRow(updates);
    const { data, error } = await supabase.from("contacts").update(payload).eq("id", id).select("*").single();
    if (error) throw error;

    return NextResponse.json({ ok: true, contact: mapContactFromRow(data) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const id = getId(request);
    if (!id) return errorResponse(new Error("id do contato e obrigatorio."), 400);

    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
