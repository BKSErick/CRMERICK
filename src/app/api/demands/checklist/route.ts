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
    const title = boundedDemandText(body?.title, 500, "Item", true);
    const last = await supabase.from("client_demand_checklist_items").select("position").eq("demand_id", parentId).order("position", { ascending: false }).limit(1).maybeSingle();
    if (last.error) throw last.error;
    const position = Number(last.data?.position ?? -1) + 1;
    const result = await supabase.from("client_demand_checklist_items").insert({ demand_id: parentId, title, position }).select("*").single();
    if (result.error) throw result.error;
    await appendDemandEvent(supabase, { demandId: parentId, actor: auth.session.email, eventType: "checklist_added", description: `Checklist adicionado: ${title}.` });
    return NextResponse.json({ ok: true, item: result.data }, { status: 201 });
  } catch (error) { return demandErrorResponse(error, 400); }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const id = demandId(body?.id);
    if (!id) throw new Error("id do item e obrigatorio.");
    const current = await supabase.from("client_demand_checklist_items").select("id, demand_id, title, is_done, position").eq("id", id).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return demandErrorResponse(new Error("Item nao encontrado."), 404);
    await assertDemandWritable(supabase, Number(current.data.demand_id));
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = boundedDemandText(body.title, 500, "Item", true);
    if (body.isDone !== undefined) updates.is_done = Boolean(body.isDone);
    if (body.position !== undefined) {
      const position = Number(body.position);
      if (!Number.isInteger(position) || position < 0) throw new Error("Posicao invalida.");
      updates.position = position;
    }
    const result = await supabase.from("client_demand_checklist_items").update(updates).eq("id", id).select("*").single();
    if (result.error) throw result.error;
    await appendDemandEvent(supabase, { demandId: Number(current.data.demand_id), actor: auth.session.email, eventType: "checklist_updated", description: `Checklist atualizado: ${String(result.data.title)}.` });
    return NextResponse.json({ ok: true, item: result.data });
  } catch (error) { return demandErrorResponse(error, 400); }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const id = demandId(request.nextUrl.searchParams.get("id"));
    if (!id) throw new Error("id do item e obrigatorio.");
    const current = await supabase.from("client_demand_checklist_items").select("id, demand_id, title").eq("id", id).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return demandErrorResponse(new Error("Item nao encontrado."), 404);
    await assertDemandWritable(supabase, Number(current.data.demand_id));
    const removed = await supabase.from("client_demand_checklist_items").delete().eq("id", id);
    if (removed.error) throw removed.error;
    await appendDemandEvent(supabase, { demandId: Number(current.data.demand_id), actor: auth.session.email, eventType: "checklist_removed", description: `Checklist removido: ${String(current.data.title)}.` });
    return NextResponse.json({ ok: true });
  } catch (error) { return demandErrorResponse(error, 400); }
}
