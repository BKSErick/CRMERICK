import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { validateEmailAutomationGraph, type EmailAutomationGraph } from "@/lib/emailAutomationGraph";
import { createEmailAutomationRepository, type EmailAutomationStatus } from "@/lib/emailAutomationRepository";
import { requireDemandAdminSession } from "@/lib/demandAuth";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function failure(error: unknown, status = 500) {
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Erro ao processar automacao." },
    { status },
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireDemandAdminSession(request, "automacoes");
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    if (!validUuid(id)) return failure(new Error("Automacao invalida."), 400);
    const result = await createEmailAutomationRepository(getCrmSupabaseAdmin()).getEmailAutomation(id);
    if (!result) return failure(new Error("Automacao nao encontrada."), 404);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireDemandAdminSession(request, "automacoes");
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    if (!validUuid(id)) return failure(new Error("Automacao invalida."), 400);
    const body = await request.json() as {
      action?: unknown;
      expectedVersion?: unknown;
      name?: unknown;
      description?: unknown;
      status?: unknown;
      graph?: unknown;
    };
    const expectedVersion = Number(body.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
      return failure(new Error("Versao esperada invalida."), 400);
    }
    const repository = createEmailAutomationRepository(getCrmSupabaseAdmin());
    const current = await repository.getEmailAutomation(id);
    if (!current) return failure(new Error("Automacao nao encontrada."), 404);

    const action = body.action === "archive" ? "archive" : "save";
    const graph = (body.graph ?? current.automation.graph) as EmailAutomationGraph;
    const validation = validateEmailAutomationGraph(graph);
    if (!validation.valid) {
      return NextResponse.json({ ok: false, error: "Grafo invalido.", issues: validation.issues }, { status: 400 });
    }
    const requestedStatus = body.status;
    const status: EmailAutomationStatus = action === "archive"
      ? "archived"
      : requestedStatus === "validated" ? "validated" : "draft";
    const name = typeof body.name === "string" ? body.name.trim() : current.automation.name;
    if (!name || name.length > 160) return failure(new Error("Informe um nome de ate 160 caracteres."), 400);

    const automation = await repository.saveEmailAutomation({
      id,
      expectedVersion,
      name,
      description: typeof body.description === "string" ? body.description.slice(0, 1000) : current.automation.description,
      status,
      graph,
      actor: auth.session.email,
    });
    return NextResponse.json({ ok: true, automation });
  } catch (error) {
    if (error instanceof Error && error.message === "version_conflict") {
      return failure(new Error("Esta automacao foi alterada em outra aba. Recarregue antes de salvar."), 409);
    }
    return failure(error, error instanceof SyntaxError ? 400 : 500);
  }
}

