import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import {
  simulateEmailAutomationGraph,
  type EmailAutomationGraph,
  type EmailAutomationSimulationInput,
} from "@/lib/emailAutomationGraph";
import { createEmailAutomationRepository } from "@/lib/emailAutomationRepository";
import { requireDemandAdminSession } from "@/lib/demandAuth";

export const runtime = "nodejs";

function failure(error: unknown, status = 500) {
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Erro ao testar automacao." },
    { status },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  const auth = await requireDemandAdminSession(request, "automacoes");
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json() as {
      automationId?: unknown;
      version?: unknown;
      graph?: unknown;
      input?: unknown;
    };
    const automationId = typeof body.automationId === "string" ? body.automationId : "";
    const version = Number(body.version);
    if (!automationId || !Number.isInteger(version) || version <= 0 || !isRecord(body.input)) {
      return failure(new Error("Automacao, versao e dados de teste sao obrigatorios."), 400);
    }

    const graph = body.graph as EmailAutomationGraph;
    const simulationInput = body.input as EmailAutomationSimulationInput;
    const result = simulateEmailAutomationGraph(graph, simulationInput);
    const error = result.issues.map((issue) => issue.message).join(" ") || null;
    const run = await createEmailAutomationRepository(getCrmSupabaseAdmin()).recordEmailAutomationTestRun({
      automationId,
      automationVersion: version,
      simulationInput,
      trace: result.trace,
      status: result.status,
      error,
      actor: auth.session.email,
    });

    return NextResponse.json({ ok: result.status === "passed", result, run }, { status: result.status === "passed" ? 200 : 422 });
  } catch (error) {
    return failure(error, error instanceof SyntaxError ? 400 : 500);
  }
}
