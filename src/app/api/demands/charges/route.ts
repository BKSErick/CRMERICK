import { NextRequest, NextResponse } from "next/server";
import {
  MAX_DEMAND_INSTALLMENTS,
  buildInstallments,
  currentMonthKey,
  demandBillingMonth,
  isMonthKey,
  monthsBetween,
  nullableMonthKey,
  parseDemandValue,
} from "@/lib/clientDemands";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { requireDemandAdminSession } from "@/lib/demandAuth";
import {
  appendDemandEvent,
  assertDemandWritable,
  demandErrorResponse,
  demandId,
} from "@/lib/demandServer";

export const runtime = "nodejs";

type Supabase = ReturnType<typeof getCrmSupabaseAdmin>;

const CHARGE_SELECT = "id, demand_id, number, billing_month, value, paid_at";

async function loadDemandBilling(supabase: Supabase, id: number) {
  const result = await supabase
    .from("client_demands")
    .select("id, value, billing_type, billing_month, due_at, created_at")
    .eq("id", id)
    .single();
  if (result.error) throw result.error;
  return result.data;
}

/** Competencia base da demanda: campo escolhido, senao mes do prazo, senao criacao. */
function baseMonth(row: { value: unknown; billing_month: unknown; due_at: unknown; created_at: unknown }) {
  return demandBillingMonth({
    status: "todo",
    value: Number(row.value ?? 0),
    billingType: "one_off",
    billingMonth: isMonthKey(row.billing_month) ? row.billing_month : null,
    billingUntil: null,
    dueAt: typeof row.due_at === "string" ? row.due_at : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
  }) ?? currentMonthKey();
}

/**
 * Gera (ou refaz) o parcelamento. Refazer apaga as parcelas anteriores: o numero de
 * vezes mudou, entao meses e valores mudam junto - e a baixa antiga nao vale mais.
 */
export async function POST(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const id = demandId(body?.demandId);
    if (!id) return demandErrorResponse(new Error("demandId valido e obrigatorio."), 400);
    await assertDemandWritable(supabase, id);

    const demand = await loadDemandBilling(supabase, id);
    const count = Number(body?.count);
    if (!Number.isInteger(count) || count < 1 || count > MAX_DEMAND_INSTALLMENTS) {
      throw new Error(`Numero de parcelas invalido. Use de 1 a ${MAX_DEMAND_INSTALLMENTS}.`);
    }

    const total = body?.total === undefined ? Number(demand.value) : parseDemandValue(body.total);
    const startMonth = isMonthKey(body?.startMonth) ? body.startMonth : baseMonth(demand);
    const parcels = buildInstallments(total, count, startMonth);

    const cleared = await supabase.from("client_demand_charges").delete().eq("demand_id", id);
    if (cleared.error) throw cleared.error;

    const inserted = await supabase.from("client_demand_charges").insert(
      parcels.map((parcel) => ({
        demand_id: id,
        number: parcel.number,
        billing_month: parcel.billingMonth,
        value: parcel.value,
      })),
    ).select(CHARGE_SELECT);
    if (inserted.error) throw inserted.error;

    // O regime e o total passam a valer junto com as parcelas: sem isso a soma do mes
    // continuaria lendo a demanda como pontual.
    const updated = await supabase
      .from("client_demands")
      .update({ billing_type: "installment", value: total, billing_month: startMonth })
      .eq("id", id);
    if (updated.error) throw updated.error;

    await appendDemandEvent(supabase, {
      demandId: id,
      actor: auth.session.email,
      eventType: "updated",
      description: `Parcelamento em ${count}x a partir de ${startMonth}.`,
      metadata: { count, startMonth, total },
    });

    return NextResponse.json({ ok: true, charges: inserted.data ?? [] }, { status: 201 });
  } catch (error) {
    return demandErrorResponse(error, error instanceof Error ? 400 : 500);
  }
}

/**
 * Baixa por mes, para pontual e mensal: nao existe linha de cobranca ate alguem dar
 * baixa, entao marcar cria a linha e desmarcar apaga. O `number` e a distancia em meses
 * desde a competencia, o que mantem a chave (demanda, numero) unica e estavel.
 */
async function toggleMonth(
  supabase: Supabase,
  actor: string,
  input: { demandId: number; month: string; paid: boolean },
) {
  await assertDemandWritable(supabase, input.demandId);
  const demand = await loadDemandBilling(supabase, input.demandId);
  if (demand.billing_type === "installment") {
    throw new Error("Demanda parcelada: de baixa na parcela, nao no mes.");
  }

  const existing = await supabase
    .from("client_demand_charges")
    .select(CHARGE_SELECT)
    .eq("demand_id", input.demandId)
    .eq("billing_month", input.month)
    .maybeSingle();
  if (existing.error) throw existing.error;

  if (!input.paid) {
    if (existing.data) {
      const removed = await supabase.from("client_demand_charges").delete().eq("id", existing.data.id);
      if (removed.error) throw removed.error;
    }
    await appendDemandEvent(supabase, {
      demandId: input.demandId,
      actor,
      eventType: "updated",
      description: `Pagamento de ${input.month} desfeito.`,
      metadata: { month: input.month, paid: false },
    });
    return null;
  }

  if (existing.data?.paid_at) return existing.data;

  const paidAt = new Date().toISOString();
  if (existing.data) {
    const updated = await supabase
      .from("client_demand_charges")
      .update({ paid_at: paidAt, value: Number(demand.value) })
      .eq("id", existing.data.id)
      .select(CHARGE_SELECT)
      .single();
    if (updated.error) throw updated.error;
    return updated.data;
  }

  const offset = monthsBetween(baseMonth(demand), input.month);
  const created = await supabase.from("client_demand_charges").insert({
    demand_id: input.demandId,
    number: Math.max(1, offset + 1),
    billing_month: input.month,
    value: Number(demand.value),
    paid_at: paidAt,
  }).select(CHARGE_SELECT).single();
  if (created.error) throw created.error;

  await appendDemandEvent(supabase, {
    demandId: input.demandId,
    actor,
    eventType: "updated",
    description: `Pagamento de ${input.month} registrado.`,
    metadata: { month: input.month, paid: true },
  });
  return created.data;
}

/**
 * Duas formas:
 * - `{ id, ... }` edita UMA cobranca existente (mes, valor ou baixa) - caso do parcelado.
 * - `{ demandId, month, paid }` da ou desfaz a baixa daquele mes - caso do pontual/mensal.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();

    const byMonthDemand = demandId(body?.demandId);
    if (byMonthDemand && body?.month !== undefined) {
      const month = nullableMonthKey(body.month, "Mes da cobranca");
      if (!month) throw new Error("Mes da cobranca e obrigatorio.");
      const charge = await toggleMonth(supabase, auth.session.email, {
        demandId: byMonthDemand,
        month,
        paid: Boolean(body?.paid),
      });
      return NextResponse.json({ ok: true, charge });
    }

    const id = demandId(body?.id);
    if (!id) return demandErrorResponse(new Error("Informe a cobranca (id) ou a demanda e o mes."), 400);

    const current = await supabase
      .from("client_demand_charges")
      .select("id, demand_id, number, paid_at")
      .eq("id", id)
      .maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return demandErrorResponse(new Error("Cobranca nao encontrada."), 404);
    await assertDemandWritable(supabase, Number(current.data.demand_id));

    const updates: Record<string, unknown> = {};
    const changed: string[] = [];
    if (body.billingMonth !== undefined) {
      const month = nullableMonthKey(body.billingMonth, "Mes da cobranca");
      if (!month) throw new Error("Mes da cobranca e obrigatorio.");
      updates.billing_month = month; changed.push("mes");
    }
    if (body.value !== undefined) { updates.value = parseDemandValue(body.value); changed.push("valor"); }
    if (body.paid !== undefined) {
      updates.paid_at = body.paid ? (current.data.paid_at ?? new Date().toISOString()) : null;
      changed.push(body.paid ? "pagamento" : "estorno");
    }
    if (changed.length === 0) return demandErrorResponse(new Error("Nenhuma alteracao valida informada."), 400);

    const result = await supabase
      .from("client_demand_charges")
      .update(updates)
      .eq("id", id)
      .select(CHARGE_SELECT)
      .single();
    if (result.error) throw result.error;

    if (body.paid !== undefined) {
      await appendDemandEvent(supabase, {
        demandId: Number(current.data.demand_id),
        actor: auth.session.email,
        eventType: "updated",
        description: body.paid
          ? `Parcela ${current.data.number} marcada como paga.`
          : `Parcela ${current.data.number} voltou para em aberto.`,
        metadata: { chargeId: id, paid: Boolean(body.paid) },
      });
    }

    return NextResponse.json({ ok: true, charge: result.data });
  } catch (error) {
    return demandErrorResponse(error, error instanceof Error ? 400 : 500);
  }
}

/** Limpa as cobrancas da demanda (desfaz o parcelamento inteiro). */
export async function DELETE(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const id = demandId(request.nextUrl.searchParams.get("demandId"));
    if (!id) return demandErrorResponse(new Error("demandId valido e obrigatorio."), 400);
    await assertDemandWritable(supabase, id);

    const removed = await supabase.from("client_demand_charges").delete().eq("demand_id", id).select("id");
    if (removed.error) throw removed.error;
    return NextResponse.json({ ok: true, deleted: (removed.data ?? []).length });
  } catch (error) {
    return demandErrorResponse(error, error instanceof Error ? 400 : 500);
  }
}
