import { NextRequest, NextResponse } from "next/server";
import { getApiErrorMessage } from "@/lib/apiError";
import { processCommercialEventBestEffort } from "@/lib/commercialAutomationService.mjs";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { mapDealFromRow, mapDealToRow } from "@/lib/crmRecords";
import { recalculateDealHealthBestEffort } from "@/lib/dealHealthService.mjs";
import { updateDealQualification } from "@/lib/dealQualificationService.mjs";
import { requiresLossReason, validateLossReason } from "@/lib/dealLossReasons.mjs";
import {
  correctDealLossReason,
  listDealLossHistory,
  transitionDealStage,
} from "@/lib/dealLossService.mjs";

export const runtime = "nodejs";

const responseTypes = new Set([
  "sem_resposta",
  "bot",
  "humana",
  "encaminhamento",
  "objecao",
  "perdido",
]);

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
      error: getApiErrorMessage(error, "Erro inesperado em /api/deals"),
    },
    { status },
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const id = getId(request);
    if (id) {
      const { data, error } = await supabase.from("deals").select("*").eq("id", id).single();
      if (error) throw error;
      const lossHistory = await listDealLossHistory(supabase, id);
      return NextResponse.json({ ok: true, deal: mapDealFromRow(data), lossHistory, source: "supabase" });
    }
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

    await recalculateDealHealthBestEffort(supabase, Number(data.id), { apply: true });
    const refreshed = await supabase.from("deals").select("*").eq("id", data.id).single();
    if (refreshed.error) throw refreshed.error;

    return NextResponse.json({ ok: true, deal: mapDealFromRow(refreshed.data) }, { status: 201 });
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
    const qualificationMutation = body.qualificationMutation;
    if (qualificationMutation !== undefined) {
      if (!qualificationMutation || typeof qualificationMutation !== "object" || Array.isArray(qualificationMutation)) {
        return errorResponse(new Error("qualificationMutation invalida."), 400);
      }
      await updateDealQualification(supabase, id, qualificationMutation, {
        actor: "Erick",
        source: "api/deals",
      });
      const refreshed = await supabase.from("deals").select("*").eq("id", id).single();
      if (refreshed.error) throw refreshed.error;
      return NextResponse.json({ ok: true, deal: mapDealFromRow(refreshed.data) });
    }
    const lossReasonCorrection = body.lossReasonCorrection;
    if (lossReasonCorrection !== undefined) {
      try {
        validateLossReason(lossReasonCorrection);
      } catch (error) {
        return errorResponse(error, 400);
      }
      await correctDealLossReason(supabase, id, lossReasonCorrection, {
        actor: "Erick",
        source: "api/deals",
      });
      await recalculateDealHealthBestEffort(supabase, id, { apply: true });
      const refreshed = await supabase.from("deals").select("*").eq("id", id).single();
      if (refreshed.error) throw refreshed.error;
      const lossHistory = await listDealLossHistory(supabase, id);
      return NextResponse.json({ ok: true, deal: mapDealFromRow(refreshed.data), lossHistory });
    }
    if (body.responseType !== undefined && !responseTypes.has(String(body.responseType))) {
      return errorResponse(new Error("responseType invalido."), 400);
    }
    if (
      body.responseTypeSource !== undefined &&
      body.responseTypeSource !== "automatic" &&
      body.responseTypeSource !== "manual"
    ) {
      return errorResponse(new Error("responseTypeSource invalido."), 400);
    }
    if (
      body.nextActionSource !== undefined &&
      body.nextActionSource !== "automatic" &&
      body.nextActionSource !== "manual"
    ) {
      return errorResponse(new Error("nextActionSource invalido."), 400);
    }

    const updates = { ...body };
    delete updates.id;
    if (body.priority !== undefined) updates.prioritySource = "manual";
    const payload: Record<string, unknown> = mapDealToRow(updates);
    let previous: { stage: string | null; points: number | null } | null = null;
    if (body.stage !== undefined || body.points !== undefined) {
      const current = await supabase.from("deals").select("stage, points").eq("id", id).single();
      if (current.error) throw current.error;
      previous = current.data;
    }
    if (previous && body.stage !== undefined && requiresLossReason(previous.stage, body.stage)) {
      try {
        validateLossReason(body.lossReason);
      } catch (error) {
        return errorResponse(error instanceof Error && /invalida/i.test(error.message)
          ? new Error("Razao de perda obrigatoria ou invalida.")
          : error, 400);
      }
    }
    if (previous && body.stage !== undefined && previous.stage !== body.stage
      && (body.stage === "lost" || previous.stage === "lost")) {
      const transitioned = await transitionDealStage(supabase, id, String(body.stage), body.lossReason ?? null, {
        actor: "Erick",
        source: "api/deals",
      });
      const occurredAt = String(transitioned.updated_at ?? new Date().toISOString());
      await processCommercialEventBestEffort(supabase, {
        id: `deal:${id}:stage:${previous.stage ?? "none"}:${body.stage}:${occurredAt}`,
        type: "deal.stage_changed",
        dealId: id,
        occurredAt,
        source: "api/deals",
        payload: { previousStage: previous.stage, stage: body.stage },
      }, { apply: true });
      await recalculateDealHealthBestEffort(supabase, id, { apply: true });
      const refreshed = await supabase.from("deals").select("*").eq("id", id).single();
      if (refreshed.error) throw refreshed.error;
      return NextResponse.json({ ok: true, deal: mapDealFromRow(refreshed.data) });
    }
    // Story 014: ao mover para "won", carimba o fechamento (se ainda nao informado) para
    // que a receita do deal seja atribuida ao mes correto no painel North Star.
    if (payload.stage === "won" && payload.closed_at === undefined) {
      payload.closed_at = new Date().toISOString();
    }
    if (previous && body.stage !== undefined && previous.stage !== body.stage) {
      payload.stage_entered_at = new Date().toISOString();
    }
    const { data, error } = await supabase.from("deals").update(payload).eq("id", id).select("*").single();
    if (error) throw error;

    if (body.responseType !== undefined || body.nextActionAt !== undefined) {
      const activityType =
        body.responseType !== undefined ? "followup_classified" : "followup_scheduled";
      const description =
        body.responseType !== undefined
          ? `Resposta classificada como ${String(body.responseType)}`
          : `Proxima acao agendada para ${String(body.nextActionAt || "sem data")}`;
      const audit = await supabase.from("activities").insert({
        deal_id: id,
        type: activityType,
        description,
      });
      if (audit.error) console.error("Falha ao registrar auditoria operacional:", audit.error);
    }
    if (previous && body.stage !== undefined && previous.stage !== data.stage) {
      const stageAudit = await supabase.from("activities").insert({
        deal_id: id,
        type: "stage_change",
        description: `Movido de ${previous.stage ?? "sem etapa"} para ${String(data.stage)}`,
        metadata: { previousStage: previous.stage, stage: data.stage, actor: "Erick" },
      });
      if (stageAudit.error) console.error("Falha ao registrar mudanca de etapa:", stageAudit.error);
    }

    const occurredAt = String(data.updated_at ?? new Date().toISOString());
    if (previous && body.stage !== undefined && previous.stage !== data.stage) {
      await processCommercialEventBestEffort(supabase, {
        id: `deal:${id}:stage:${previous.stage ?? "none"}:${data.stage}:${occurredAt}`,
        type: "deal.stage_changed",
        dealId: id,
        occurredAt,
        source: "api/deals",
        payload: { previousStage: previous.stage, stage: data.stage },
      }, { apply: true });
    }
    if (previous && body.points !== undefined && Number(previous.points ?? 0) !== Number(data.points ?? 0)) {
      await processCommercialEventBestEffort(supabase, {
        id: `deal:${id}:score:${previous.points ?? 0}:${data.points ?? 0}:${occurredAt}`,
        type: "deal.score_updated",
        dealId: id,
        occurredAt,
        source: "api/deals",
        payload: { previousScore: Number(previous.points ?? 0), score: Number(data.points ?? 0) },
      }, { apply: true });
    }

    await recalculateDealHealthBestEffort(supabase, id, { apply: true });
    const refreshed = await supabase.from("deals").select("*").eq("id", id).single();
    if (refreshed.error) throw refreshed.error;

    return NextResponse.json({ ok: true, deal: mapDealFromRow(refreshed.data) });
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
