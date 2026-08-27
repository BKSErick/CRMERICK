import { NextRequest, NextResponse } from "next/server";
import {
  DEMAND_ATTACHMENTS_BUCKET,
  isDemandBillingType,
  isDemandDestination,
  isDemandPriority,
  isDemandStatus,
  isEligibleDemandDeal,
  mapClientDemand,
  nullableMonthKey,
  parseDemandValue,
  transitionDemandStatus,
} from "@/lib/clientDemands";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { requireDemandAdminSession } from "@/lib/demandAuth";
import {
  DEMAND_DETAIL_SELECT,
  DEMAND_SUMMARY_SELECT,
  ORPHAN_DEMAND_MESSAGE,
  appendDemandEvent,
  assertDemandFolderExists,
  boundedDemandText,
  demandErrorResponse,
  demandId,
  isOrphanDemand,
  nullableIso,
} from "@/lib/demandServer";

export const runtime = "nodejs";

type Supabase = ReturnType<typeof getCrmSupabaseAdmin>;

async function loadEligibleDeal(supabase: Supabase, id: number) {
  const result = await supabase.from("deals").select("id, company, name, stage, status").eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Deal nao encontrado.");
  if (!isEligibleDemandDeal(result.data)) throw new Error("A demanda exige um cliente fechado ou ativo.");
  return result.data;
}

/**
 * Dono da demanda. O cadastro de clientes manda; um dealId sozinho (chamada antiga)
 * continua valendo e puxa - ou cria - o cliente daquele deal ganho, para a demanda
 * nunca nascer fora da aba Clientes.
 */
async function resolveDemandOwner(supabase: Supabase, body: { clientId?: unknown; dealId?: unknown }) {
  const clientId = demandId(body.clientId);
  const dealId = demandId(body.dealId);

  if (clientId) {
    const result = await supabase.from("clients").select("id, deal_id").eq("id", clientId).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("Cliente nao encontrado.");
    const linkedDeal = result.data.deal_id == null ? null : Number(result.data.deal_id);
    return { client_id: clientId, deal_id: dealId ?? linkedDeal };
  }

  if (dealId) {
    const deal = await loadEligibleDeal(supabase, dealId);
    const existing = await supabase.from("clients").select("id").eq("deal_id", dealId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return { client_id: Number(existing.data.id), deal_id: dealId };

    const created = await supabase.from("clients").insert({
      deal_id: dealId,
      name: (deal.company ?? "").trim() || (deal.name ?? "").trim() || `Cliente #${dealId}`,
      source: "pipeline",
    }).select("id").single();
    if (created.error) throw created.error;
    return { client_id: Number(created.data.id), deal_id: dealId };
  }

  throw new Error("Informe o cliente da demanda.");
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
    const folderId = demandId(request.nextUrl.searchParams.get("folderId"));
    const clientId = demandId(request.nextUrl.searchParams.get("clientId"));
    if (isDemandStatus(status)) query = query.eq("status", status);
    if (isDemandPriority(priority)) query = query.eq("priority", priority);
    if (isDemandDestination(destination)) query = query.eq("destination_type", destination);
    if (assignee) query = query.eq("assignee", assignee.slice(0, 160));
    if (folderId) query = query.eq("folder_id", folderId);
    if (clientId) query = query.eq("client_id", clientId);

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
    const owner = await resolveDemandOwner(supabase, body);

    const title = boundedDemandText(body?.title, 240, "Titulo", true);
    const status = isDemandStatus(body?.status) ? body.status : "todo";
    const priority = isDemandPriority(body?.priority) ? body.priority : "normal";
    const destinationType = isDemandDestination(body?.destinationType) ? body.destinationType : "other";
    const dueAt = nullableIso(body?.dueAt, "Prazo");
    const startsAt = nullableIso(body?.startsAt, "Inicio");
    const completedAt = status === "done" ? new Date().toISOString() : null;
    const folderId = demandId(body?.folderId);
    if (body?.folderId != null && body.folderId !== "" && !folderId) throw new Error("folderId invalido.");
    if (folderId) await assertDemandFolderExists(supabase, folderId);

    const value = parseDemandValue(body?.value);
    const billingType = isDemandBillingType(body?.billingType) ? body.billingType : "one_off";
    const billingMonth = nullableMonthKey(body?.billingMonth, "Mes de cobranca");
    const billingUntil = nullableMonthKey(body?.billingUntil, "Cobrar ate");

    const insert = await supabase.from("client_demands").insert({
      client_id: owner.client_id,
      deal_id: owner.deal_id,
      folder_id: folderId,
      title,
      description: boundedDemandText(body?.description, 50000, "Descricao"),
      copy_text: boundedDemandText(body?.copyText, 50000, "Copy"),
      status,
      priority,
      assignee: boundedDemandText(body?.assignee, 160, "Responsavel"),
      destination_type: destinationType,
      destination_label: boundedDemandText(body?.destinationLabel, 240, "Destino"),
      value,
      billing_type: billingType,
      billing_month: billingMonth,
      billing_until: billingUntil,
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
      metadata: { clientId: owner.client_id, dealId: owner.deal_id, folderId, value, billingType },
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
    const current = await supabase
      .from("client_demands")
      .select("id, deal_id, client_id, status, billing_type")
      .eq("id", id)
      .maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return demandErrorResponse(new Error("Demanda nao encontrada."), 404);
    if (isOrphanDemand(current.data) && body.clientId === undefined && body.dealId === undefined) {
      throw new Error(ORPHAN_DEMAND_MESSAGE);
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
    if (body.value !== undefined) { updates.value = parseDemandValue(body.value); changed.push("valor"); }
    if (body.billingType !== undefined) {
      if (!isDemandBillingType(body.billingType)) throw new Error("Tipo de cobranca invalido.");
      updates.billing_type = body.billingType; changed.push("cobranca");
      // Sair do parcelado apaga as parcelas: mantidas, elas continuariam aparecendo na
      // conta do mes de uma demanda que agora e pontual ou mensal. As baixas de pagamento
      // de pontual/mensal (uma cobranca por mes) nao entram nessa limpeza.
      if (current.data.billing_type === "installment" && body.billingType !== "installment") {
        const cleared = await supabase.from("client_demand_charges").delete().eq("demand_id", id);
        if (cleared.error) throw cleared.error;
      }
    }
    if (body.billingMonth !== undefined) {
      updates.billing_month = nullableMonthKey(body.billingMonth, "Mes de cobranca"); changed.push("mes de cobranca");
    }
    if (body.billingUntil !== undefined) {
      updates.billing_until = nullableMonthKey(body.billingUntil, "Cobrar ate"); changed.push("fim da recorrencia");
    }
    if (body.clientId !== undefined || body.dealId !== undefined) {
      const owner = await resolveDemandOwner(supabase, body);
      updates.client_id = owner.client_id;
      updates.deal_id = owner.deal_id;
      changed.push("cliente");
    }
    if (body.folderId !== undefined) {
      if (body.folderId === null || body.folderId === "") {
        updates.folder_id = null;
      } else {
        const folderId = demandId(body.folderId);
        if (!folderId) throw new Error("folderId invalido.");
        await assertDemandFolderExists(supabase, folderId);
        updates.folder_id = folderId;
      }
      changed.push("pasta");
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

/** Apaga de vez: linhas filhas caem por cascade, mas os arquivos do bucket nao. */
async function purgeDemands(
  supabase: ReturnType<typeof getCrmSupabaseAdmin>,
  ids: number[],
) {
  const attachments = await supabase
    .from("client_demand_attachments")
    .select("storage_path")
    .in("demand_id", ids);
  if (attachments.error) throw attachments.error;
  const paths = (attachments.data ?? []).map((row) => String(row.storage_path)).filter(Boolean);
  if (paths.length > 0) {
    const removed = await supabase.storage.from(DEMAND_ATTACHMENTS_BUCKET).remove(paths);
    if (removed.error) throw removed.error;
  }
  const result = await supabase.from("client_demands").delete().in("id", ids).select("id");
  if (result.error) throw result.error;
  return (result.data ?? []).length;
}

export async function DELETE(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();

    // hard=1 remove de vez; sem ele o comportamento historico e cancelar.
    if (request.nextUrl.searchParams.get("hard") === "1") {
      const ids = (request.nextUrl.searchParams.get("demandIds") ?? request.nextUrl.searchParams.get("demandId") ?? "")
        .split(",")
        .map((value) => demandId(value))
        .filter((value): value is number => value !== null);
      if (ids.length === 0) return demandErrorResponse(new Error("Informe ao menos um demandId valido."), 400);
      const deleted = await purgeDemands(supabase, Array.from(new Set(ids)));
      if (deleted === 0) return demandErrorResponse(new Error("Demanda nao encontrada."), 404);
      return NextResponse.json({ ok: true, deleted });
    }

    const id = demandId(request.nextUrl.searchParams.get("demandId"));
    if (!id) return demandErrorResponse(new Error("demandId valido e obrigatorio."), 400);
    const current = await supabase.from("client_demands").select("id, deal_id, client_id").eq("id", id).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return demandErrorResponse(new Error("Demanda nao encontrada."), 404);
    if (isOrphanDemand(current.data)) throw new Error(ORPHAN_DEMAND_MESSAGE);
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
