import { NextRequest, NextResponse } from "next/server";
import {
  isDemandDestination,
  isDemandPriority,
  isDemandStatus,
  isEligibleDemandDeal,
  mapClientDemand,
  transitionDemandStatus,
} from "@/lib/clientDemands";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { requireDemandAdminSession } from "@/lib/demandAuth";
import {
  DEMAND_DETAIL_SELECT,
  DEMAND_SUMMARY_SELECT,
  appendDemandEvent,
  boundedDemandText,
  demandErrorResponse,
  demandId,
  nullableIso,
} from "@/lib/demandServer";

export const runtime = "nodejs";

async function loadEligibleDeal(supabase: ReturnType<typeof getCrmSupabaseAdmin>, id: number) {
  const result = await supabase.from("deals").select("id, company, name, stage, status").eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Deal nao encontrado.");
  if (!isEligibleDemandDeal(result.data)) throw new Error("A demanda exige um cliente fechado ou ativo.");
  return result.data;
}

async function loadDemand(supabase: ReturnType<typeof getCrmSupabaseAdmin>, id: number) {
  const result = await supabase.from("client_demands").select(DEMAND_DETAIL_SELECT).eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  return result.data ? mapClientDemand(result.data) : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const id = demandId(request.nextUrl.searchParams.get("demandId"));
    if (id) {
      const demand = await loadDemand(supabase, id);
      if (!demand) return demandErrorResponse(new Error("Demanda nao encontrada."), 404);
      return NextResponse.json({ ok: true, demand });
    }

    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 100, 1), 200);
    const offset = Math.max(Number(request.nextUrl.searchParams.get("offset")) || 0, 0);
    let query = supabase
      .from("client_demands")
      .select(DEMAND_SUMMARY_SELECT, { count: "exact" })
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    const status = request.nextUrl.searchParams.get("status");
    const priority = request.nextUrl.searchParams.get("priority");
    const destination = request.nextUrl.searchParams.get("destination");
    const assignee = request.nextUrl.searchParams.get("assignee");
    if (isDemandStatus(status)) query = query.eq("status", status);
    if (isDemandPriority(priority)) query = query.eq("priority", priority);
    if (isDemandDestination(destination)) query = query.eq("destination_type", destination);
    if (assignee) query = query.eq("assignee", assignee.slice(0, 160));

    const result = await query.range(offset, offset + limit - 1);
    if (result.error) throw result.error;
    return NextResponse.json({
      ok: true,
      demands: (result.data ?? []).map(mapClientDemand),
      total: result.count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    return demandErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const dealId = demandId(body?.dealId);
    if (!dealId) return demandErrorResponse(new Error("dealId valido e obrigatorio."), 400);
    await loadEligibleDeal(supabase, dealId);

    const title = boundedDemandText(body?.title, 240, "Titulo", true);
    const status = isDemandStatus(body?.status) ? body.status : "todo";
    const priority = isDemandPriority(body?.priority) ? body.priority : "normal";
    const destinationType = isDemandDestination(body?.destinationType) ? body.destinationType : "other";
    const dueAt = nullableIso(body?.dueAt, "Prazo");
    const startsAt = nullableIso(body?.startsAt, "Inicio");
    const completedAt = status === "done" ? new Date().toISOString() : null;

    const insert = await supabase.from("client_demands").insert({
      deal_id: dealId,
      title,
      description: boundedDemandText(body?.description, 50000, "Descricao"),
      copy_text: boundedDemandText(body?.copyText, 50000, "Copy"),
      status,
      priority,
      assignee: boundedDemandText(body?.assignee, 160, "Responsavel"),
      destination_type: destinationType,
      destination_label: boundedDemandText(body?.destinationLabel, 240, "Destino"),
      starts_at: startsAt,
      due_at: dueAt,
      completed_at: completedAt,
    }).select("id").single();
    if (insert.error) throw insert.error;
    const id = Number(insert.data.id);
    await appendDemandEvent(supabase, {
      demandId: id,
      actor: auth.session.email,
      eventType: "created",
      description: "Demanda criada.",
      metadata: { dealId },
    });
    const demand = await loadDemand(supabase, id);
    return NextResponse.json({ ok: true, demand }, { status: 201 });
  } catch (error) {
    return demandErrorResponse(error, error instanceof Error ? 400 : 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const id = demandId(body?.id ?? request.nextUrl.searchParams.get("demandId"));
    if (!id) return demandErrorResponse(new Error("id da demanda e obrigatorio."), 400);
    const current = await supabase.from("client_demands").select("id, deal_id, status").eq("id", id).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return demandErrorResponse(new Error("Demanda nao encontrada."), 404);
    if (!current.data.deal_id && body.dealId === undefined) {
      throw new Error("A demanda de um deal removido e somente leitura. Vincule um cliente elegivel para editar.");
    }

    const updates: Record<string, unknown> = {};
    const changed: string[] = [];
    if (body.title !== undefined) { updates.title = boundedDemandText(body.title, 240, "Titulo", true); changed.push("titulo"); }
    if (body.description !== undefined) { updates.description = boundedDemandText(body.description, 50000, "Descricao"); changed.push("descricao"); }
    if (body.copyText !== undefined) { updates.copy_text = boundedDemandText(body.copyText, 50000, "Copy"); changed.push("copy"); }
    if (body.assignee !== undefined) { updates.assignee = boundedDemandText(body.assignee, 160, "Responsavel"); changed.push("responsavel"); }
    if (body.destinationLabel !== undefined) { updates.destination_label = boundedDemandText(body.destinationLabel, 240, "Destino"); changed.push("destino"); }
    if (body.priority !== undefined) {
      if (!isDemandPriority(body.priority)) throw new Error("Prioridade invalida.");
      updates.priority = body.priority; changed.push("prioridade");
    }
    if (body.destinationType !== undefined) {
      if (!isDemandDestination(body.destinationType)) throw new Error("Tipo de destino invalido.");
      updates.destination_type = body.destinationType; changed.push("tipo de destino");
    }
    if (body.startsAt !== undefined) { updates.starts_at = nullableIso(body.startsAt, "Inicio"); changed.push("inicio"); }
    if (body.dueAt !== undefined) { updates.due_at = nullableIso(body.dueAt, "Prazo"); changed.push("prazo"); }
    if (body.dealId !== undefined) {
      const dealId = demandId(body.dealId);
      if (!dealId) throw new Error("dealId invalido.");
      await loadEligibleDeal(supabase, dealId);
      updates.deal_id = dealId; changed.push("deal");
    }
    if (body.status !== undefined) {
      if (!isDemandStatus(body.status)) throw new Error("Status invalido.");
      const transition = transitionDemandStatus(current.data.status as never, body.status);
      updates.status = transition.status;
      updates.completed_at = transition.completedAt;
      changed.push("status");
    }
    if (changed.length === 0) return demandErrorResponse(new Error("Nenhuma alteracao valida informada."), 400);

    const result = await supabase.from("client_demands").update(updates).eq("id", id).select("id").single();
    if (result.error) throw result.error;
    await appendDemandEvent(supabase, {
      demandId: id,
      actor: auth.session.email,
      eventType: body.status !== undefined ? "status_changed" : "updated",
      description: `Demanda atualizada: ${changed.join(", ")}.`,
      metadata: { changed },
    });
    return NextResponse.json({ ok: true, demand: await loadDemand(supabase, id) });
  } catch (error) {
    return demandErrorResponse(error, error instanceof Error ? 400 : 500);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const id = demandId(request.nextUrl.searchParams.get("demandId"));
    if (!id) return demandErrorResponse(new Error("demandId valido e obrigatorio."), 400);
    const current = await supabase.from("client_demands").select("id, deal_id").eq("id", id).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return demandErrorResponse(new Error("Demanda nao encontrada."), 404);
    if (!current.data.deal_id) throw new Error("A demanda de um deal removido e somente leitura.");
    const result = await supabase.from("client_demands").update({ status: "cancelled", completed_at: null }).eq("id", id).select("id").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return demandErrorResponse(new Error("Demanda nao encontrada."), 404);
    await appendDemandEvent(supabase, {
      demandId: id,
      actor: auth.session.email,
      eventType: "cancelled",
      description: "Demanda cancelada.",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return demandErrorResponse(error);
  }
}
