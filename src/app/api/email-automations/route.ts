import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import {
  createStarterEmailAutomationGraph,
  validateEmailAutomationGraph,
  type EmailAutomationGraph,
} from "@/lib/emailAutomationGraph";
import {
  createEmailAutomationRepository,
  type EmailAutomationStatus,
} from "@/lib/emailAutomationRepository";
import { requireDemandAdminSession } from "@/lib/demandAuth";

export const runtime = "nodejs";

const STATUSES = new Set<EmailAutomationStatus | "all">(["all", "draft", "validated", "archived"]);

function failure(error: unknown, status = 500) {
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Erro ao processar automacao." },
    { status },
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireDemandAdminSession(request, "automacoes");
  if (!auth.ok) return auth.response;
  try {
    const rawStatus = request.nextUrl.searchParams.get("status") ?? "all";
    if (!STATUSES.has(rawStatus as EmailAutomationStatus | "all")) return failure(new Error("Status invalido."), 400);
    const repository = createEmailAutomationRepository(getCrmSupabaseAdmin());
    const result = await repository.listEmailAutomations({
      query: request.nextUrl.searchParams.get("q") ?? undefined,
      status: rawStatus as EmailAutomationStatus | "all",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireDemandAdminSession(request, "automacoes");
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json() as { name?: unknown; description?: unknown; graph?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 160) return failure(new Error("Informe um nome de ate 160 caracteres."), 400);
    const graph = (body.graph ?? createStarterEmailAutomationGraph()) as EmailAutomationGraph;
    const validation = validateEmailAutomationGraph(graph);
    if (!validation.valid) {
      return NextResponse.json({ ok: false, error: "Grafo invalido.", issues: validation.issues }, { status: 400 });
    }
    const repository = createEmailAutomationRepository(getCrmSupabaseAdmin());
    const automation = await repository.createEmailAutomation({
      name,
      description: typeof body.description === "string" ? body.description.slice(0, 1000) : "",
      graph,
      actor: auth.session.email,
    });
    return NextResponse.json({ ok: true, automation }, { status: 201 });
  } catch (error) {
    return failure(error, error instanceof SyntaxError ? 400 : 500);
  }
}
