import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { inboxPageWindow } from "@/lib/emailInbox";
import { createEmailInboxRepository } from "@/lib/emailInboxRepository";

export const runtime = "nodejs";

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function failure(error: unknown, status = 500) {
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Erro ao carregar e-mails." },
    { status },
  );
}

export async function GET(request: NextRequest) {
  try {
    const page = positiveInteger(request.nextUrl.searchParams.get("page") ?? 1) ?? 1;
    const threadParam = request.nextUrl.searchParams.get("thread");
    const threadId = threadParam ? positiveInteger(threadParam) : null;
    if (threadParam && !threadId) return failure(new Error("thread invalida."), 400);

    const repository = createEmailInboxRepository(getCrmSupabaseAdmin());
    const window = inboxPageWindow(page);
    const list = await repository.listEmailThreads({
      page: window.page,
      query: request.nextUrl.searchParams.get("q") ?? "",
      unreadOnly: request.nextUrl.searchParams.get("unread") === "true",
    });
    const selected = threadId ? await repository.getEmailThread(threadId) : null;

    return NextResponse.json({ ok: true, ...list, selected });
  } catch (error) {
    return failure(error);
  }
}
