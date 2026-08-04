import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSession,
  isAdminEmail,
  safeReturnPath,
} from "@/lib/adminAuth";
import { getCrmSupabaseAuthClient } from "@/lib/supabaseAuth";

const unauthorized = () => NextResponse.json(
  { ok: false, error: "Link invalido ou expirado." },
  { status: 401 },
);

export async function POST(request: Request) {
  try {
    const body = await request.json() as { accessToken?: unknown; next?: unknown };
    const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    if (!accessToken) return unauthorized();

    const auth = getCrmSupabaseAuthClient();
    const { data, error } = await auth.auth.getUser(accessToken);
    const email = data.user?.email?.trim().toLowerCase() ?? "";
    if (error || !isAdminEmail(email, process.env.CRM_ADMIN_EMAIL)) return unauthorized();

    const session = await createAdminSession({
      email,
      secret: process.env.CRM_AUTH_SECRET ?? "",
    });
    const next = safeReturnPath(typeof body.next === "string" ? body.next : "/");
    const response = NextResponse.json({ ok: true, next });
    response.cookies.set(ADMIN_SESSION_COOKIE, session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_SESSION_TTL_SECONDS,
    });
    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Login administrativo indisponivel." },
      { status: 503 },
    );
  }
}
