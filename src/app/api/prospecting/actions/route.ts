import { NextResponse } from "next/server";
import type { NextActionType, ResponseType } from "@/lib/followup";
import type { ProspectingAction } from "@/lib/prospectingActions";
import { applyProspectingAction } from "@/lib/prospectingRepository";

const ACTIONS = new Set<ProspectingAction>([
  "open", "confirm_sent", "register_reply", "classify", "schedule", "pause", "opt_out",
]);
const RESPONSE_TYPES = new Set<ResponseType>([
  "sem_resposta", "bot", "humana", "encaminhamento", "objecao", "perdido",
]);
const NEXT_ACTION_TYPES = new Set<NextActionType>([
  "followup_silencio", "followup_bot", "responder", "contactar_responsavel", "tratar_objecao",
]);

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = body.action as ProspectingAction;
    const dealId = Number(body.dealId);
    if (!ACTIONS.has(action) || !Number.isInteger(dealId) || dealId <= 0) {
      throw new Error("Acao ou lead invalido.");
    }

    const responseType = RESPONSE_TYPES.has(body.responseType as ResponseType)
      ? body.responseType as ResponseType
      : undefined;
    const nextActionType = NEXT_ACTION_TYPES.has(body.nextActionType as NextActionType)
      ? body.nextActionType as NextActionType
      : undefined;
    const channel = await applyProspectingAction({
      action,
      dealId,
      channel: "instagram",
      content: typeof body.content === "string" ? body.content : undefined,
      responseType,
      nextActionAt: typeof body.nextActionAt === "string" ? body.nextActionAt : undefined,
      nextActionType,
      note: typeof body.note === "string" ? body.note : undefined,
    });
    return NextResponse.json({ ok: true, channel });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha ao registrar a acao." },
      { status: 400 },
    );
  }
}
