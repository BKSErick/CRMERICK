import { NextRequest, NextResponse } from "next/server";
import { isEligibleDemandDeal } from "@/lib/clientDemands";
import { isDescendantFolder, mapDemandFolder } from "@/lib/demandFolders";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { requireDemandAdminSession } from "@/lib/demandAuth";
import {
  DEMAND_FOLDER_SELECT,
  assertDemandFolderExists,
  boundedDemandText,
  demandErrorResponse,
  demandId,
} from "@/lib/demandServer";

export const runtime = "nodejs";

type Supabase = ReturnType<typeof getCrmSupabaseAdmin>;

async function loadFolders(supabase: Supabase) {
  const result = await supabase
    .from("demand_folders")
    .select(DEMAND_FOLDER_SELECT)
    .order("position", { ascending: true })
    .order("id", { ascending: true });
  if (result.error) throw result.error;
  return (result.data ?? []).map(mapDemandFolder);
}

/** Nova pasta entra no fim da lista de irmas. */
async function nextPosition(supabase: Supabase, parentId: number | null) {
  let query = supabase.from("demand_folders").select("position").order("position", { ascending: false }).limit(1);
  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
  const result = await query;
  if (result.error) throw result.error;
  const current = Number(result.data?.[0]?.position);
  return Number.isFinite(current) ? current + 1 : 0;
}

async function assertDealEligible(supabase: Supabase, dealId: number) {
  const result = await supabase.from("deals").select("id, stage, status").eq("id", dealId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Deal nao encontrado.");
  if (!isEligibleDemandDeal(result.data)) throw new Error("A pasta exige um cliente fechado ou ativo.");
}

/** Aceita id valido, null/"" para limpar, e recusa qualquer outra coisa. */
function optionalId(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  const id = demandId(value);
  if (!id) throw new Error(`${field} invalido.`);
  return id;
}

export async function GET(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ ok: true, folders: await loadFolders(getCrmSupabaseAdmin()) });
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
    const name = boundedDemandText(body?.name, 120, "Nome", true);
    const parentId = optionalId(body?.parentId, "parentId");
    const dealId = optionalId(body?.dealId, "dealId");

    if (parentId) await assertDemandFolderExists(supabase, parentId);
    if (dealId) await assertDealEligible(supabase, dealId);

    const insert = await supabase.from("demand_folders").insert({
      name,
      parent_id: parentId,
      deal_id: dealId,
      position: await nextPosition(supabase, parentId),
    }).select(DEMAND_FOLDER_SELECT).single();
    if (insert.error) throw insert.error;
    return NextResponse.json({ ok: true, folder: mapDemandFolder(insert.data) }, { status: 201 });
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
    const id = demandId(body?.id);
    if (!id) throw new Error("id valido e obrigatorio.");
    await assertDemandFolderExists(supabase, id);

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = boundedDemandText(body.name, 120, "Nome", true);
    if (body.dealId !== undefined) {
      const dealId = optionalId(body.dealId, "dealId");
      if (dealId) await assertDealEligible(supabase, dealId);
      updates.deal_id = dealId;
    }
    if (body.position !== undefined) {
      const position = Number(body.position);
      if (!Number.isInteger(position) || position < 0) throw new Error("Posicao invalida.");
      updates.position = position;
    }
    if (body.parentId !== undefined) {
      const parentId = optionalId(body.parentId, "parentId");
      if (parentId) {
        await assertDemandFolderExists(supabase, parentId);
        // Mover a pasta para dentro dela mesma ou de uma descendente criaria um ciclo.
        if (isDescendantFolder(await loadFolders(supabase), parentId, id)) {
          throw new Error("Nao da para mover uma pasta para dentro dela mesma.");
        }
      }
      updates.parent_id = parentId;
      if (updates.position === undefined) updates.position = await nextPosition(supabase, parentId);
    }
    if (Object.keys(updates).length === 0) throw new Error("Nenhuma alteracao valida informada.");

    const result = await supabase.from("demand_folders").update(updates).eq("id", id)
      .select(DEMAND_FOLDER_SELECT).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("Pasta nao encontrada.");
    return NextResponse.json({ ok: true, folder: mapDemandFolder(result.data) });
  } catch (error) {
    return demandErrorResponse(error, error instanceof Error ? 400 : 500);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const id = demandId(request.nextUrl.searchParams.get("id"));
    if (!id) throw new Error("id valido e obrigatorio.");
    // As subpastas caem por cascade; as demandas sobrevivem com folder_id nulo.
    const result = await supabase.from("demand_folders").delete().eq("id", id).select("id").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("Pasta nao encontrada.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return demandErrorResponse(error, error instanceof Error ? 400 : 500);
  }
}
