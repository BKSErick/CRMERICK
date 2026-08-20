import { NextRequest, NextResponse } from "next/server";
import { normalizeHttpUrl } from "@/lib/clientDemands";
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
    const label = boundedDemandText(body?.label, 240, "Rotulo", true);
    const url = normalizeHttpUrl(String(body?.url ?? ""));
    const result = await supabase.from("client_demand_links").insert({ demand_id: parentId, label, url }).select("*").single();
    if (result.error) throw result.error;
    await appendDemandEvent(supabase, { demandId: parentId, actor: auth.session.email, eventType: "link_added", description: `Link adicionado: ${label}.` });
    return NextResponse.json({ ok: true, link: result.data }, { status: 201 });
  } catch (error) { return demandErrorResponse(error, 400); }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const id = demandId(body?.id);
    if (!id) throw new Error("id do link e obrigatorio.");
    const current = await supabase.from("client_demand_links").select("id, demand_id").eq("id", id).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return demandErrorResponse(new Error("Link nao encontrado."), 404);
    await assertDemandWritable(supabase, Number(current.data.demand_id));
    const updates: Record<string, unknown> = {};
    if (body.label !== undefined) updates.label = boundedDemandText(body.label, 240, "Rotulo", true);
    if (body.url !== undefined) updates.url = normalizeHttpUrl(String(body.url));
    const result = await supabase.from("client_demand_links").update(updates).eq("id", id).select("*").single();
    if (result.error) throw result.error;
    await appendDemandEvent(supabase, { demandId: Number(current.data.demand_id), actor: auth.session.email, eventType: "link_updated", description: `Link atualizado: ${String(result.data.label)}.` });
    return NextResponse.json({ ok: true, link: result.data });
  } catch (error) { return demandErrorResponse(error, 400); }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const id = demandId(request.nextUrl.searchParams.get("id"));
    if (!id) throw new Error("id do link e obrigatorio.");
    const current = await supabase.from("client_demand_links").select("id, demand_id, label").eq("id", id).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return demandErrorResponse(new Error("Link nao encontrado."), 404);
    await assertDemandWritable(supabase, Number(current.data.demand_id));
    const removed = await supabase.from("client_demand_links").delete().eq("id", id);
    if (removed.error) throw removed.error;
    await appendDemandEvent(supabase, { demandId: Number(current.data.demand_id), actor: auth.session.email, eventType: "link_removed", description: `Link removido: ${String(current.data.label)}.` });
    return NextResponse.json({ ok: true });
  } catch (error) { return demandErrorResponse(error, 400); }
}
