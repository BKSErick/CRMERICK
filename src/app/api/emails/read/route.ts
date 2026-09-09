import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { createEmailInboxRepository } from "@/lib/emailInboxRepository";

export const runtime = "nodejs";

function failure(error: unknown, status = 500) {
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Erro ao marcar e-mail como lido." },
    { status },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const threadId = Number(body?.threadId);
    if (!Number.isInteger(threadId) || threadId <= 0) {
      return failure(new Error("threadId valido e obrigatorio."), 400);
    }

    const repository = createEmailInboxRepository(getCrmSupabaseAdmin());
    const updated = await repository.markThreadRead(threadId);
    if (!updated) return failure(new Error("Conversa de e-mail nao encontrada."), 404);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
