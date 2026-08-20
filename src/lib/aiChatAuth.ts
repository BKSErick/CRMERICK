import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/adminAuth";

export async function requireAiChatAdminSession(request: NextRequest) {
  const session = await verifyAdminSession(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
    process.env.CRM_AUTH_SECRET,
  );
  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Sessao administrativa obrigatoria para usar o chat de IA." },
        { status: 401 },
      ),
    };
  }
  return { ok: true as const, session };
}
