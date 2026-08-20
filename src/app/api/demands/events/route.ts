import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { requireDemandAdminSession } from "@/lib/demandAuth";
import { appendDemandEvent, assertDemandWritable, boundedDemandText, demandErrorResponse, demandId } from "@/lib/demandServer";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const parentId = demandId(body?.demandId);
    if (!parentId) throw new Error("demandId valido e obrigatorio.");
    await assertDemandWritable(supabase, parentId);
    const description = boundedDemandText(body?.description, 5000, "Comentario", true);
    await appendDemandEvent(supabase, { demandId: parentId, actor: auth.session.email, eventType: "comment", description });
    const result = await supabase.from("client_demand_events").select("*").eq("demand_id", parentId).order("created_at", { ascending: false }).limit(1).single();
    if (result.error) throw result.error;
    return NextResponse.json({ ok: true, event: result.data }, { status: 201 });
  } catch (error) { return demandErrorResponse(error, 400); }
}
