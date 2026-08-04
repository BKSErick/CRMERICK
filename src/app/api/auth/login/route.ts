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
  { ok: false, error: "E-mail ou senha invalidos." },
  { status: 401 },
);

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: unknown; password?: unknown; next?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!isAdminEmail(email, process.env.CRM_ADMIN_EMAIL) || !password) return unauthorized();

    const auth = getCrmSupabaseAuthClient();
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    const authenticatedEmail = data.user?.email?.trim().toLowerCase() ?? "";
    if (error || !isAdminEmail(authenticatedEmail, process.env.CRM_ADMIN_EMAIL)) {
      return unauthorized();
    }

    const session = await createAdminSession({
      email: authenticatedEmail,
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
