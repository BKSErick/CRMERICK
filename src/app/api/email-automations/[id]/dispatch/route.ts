import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { requireDemandAdminSession } from "@/lib/demandAuth";
import { resolveManualDailyCap, runManualEmailDispatch } from "@/lib/emailManualDispatch";
import { createManualDispatchDependencies } from "@/lib/emailManualDispatchServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function failure(error: unknown, status = 500) {
  return NextResponse.json({
    ok: false,
    error: error instanceof Error ? error.message : "Erro ao executar o lote manual.",
  }, { status });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDemandAdminSession(request, "automacoes");
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    if (!validUuid(id)) return failure(new Error("Automacao invalida."), 400);
    const body = await request.json() as { confirmed?: unknown; expectedVersion?: unknown };
    if (body.confirmed !== true) return failure(new Error("Confirme explicitamente o lote de hoje."), 400);
    const expectedVersion = Number(body.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
      return failure(new Error("Versao esperada invalida."), 400);
    }

    const supabase = getCrmSupabaseAdmin();
    const result = await runManualEmailDispatch(createManualDispatchDependencies(supabase), {
      automationId: id,
      expectedVersion,
      actor: auth.session.email,
      confirmed: true,
      dailyCap: resolveManualDailyCap(process.env.EMAIL_AUTOMATION_DAILY_CAP),
      unsubscribeMailbox: process.env.EMAIL_AUTOMATION_REPLY_TO || process.env.BREVO_FROM_EMAIL || "contato@mydrion.com.br",
    });

    return NextResponse.json({ ok: result.errors.length === 0, dispatch: result }, {
      status: result.errors.length === 0 ? 200 : 502,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const clientError = /confirm|validada|invalida|mudou em outra aba|grafo|fluxo/i.test(message);
    return failure(error, error instanceof SyntaxError || clientError ? 400 : 500);
  }
}
