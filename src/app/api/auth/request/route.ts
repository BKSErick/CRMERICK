import { NextResponse } from "next/server";
import { isAdminEmail, safeReturnPath } from "@/lib/adminAuth";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { getCrmSupabaseAuthClient } from "@/lib/supabaseAuth";

const accepted = () => NextResponse.json(
  { ok: true, message: "Se o e-mail estiver autorizado, o link sera enviado." },
  { status: 202 },
);

async function ensureConfiguredAdminExists(email: string) {
  const admin = getCrmSupabaseAdmin();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  if (data.users.some((user) => user.email?.trim().toLowerCase() === email)) return;

  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error) throw created.error;
}

export async function POST(request: Request) {
  let email = "";
  let next = "/";
  try {
    const body = await request.json() as { email?: unknown; next?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    next = safeReturnPath(typeof body.next === "string" ? body.next : "/");
  } catch {
    return accepted();
  }

  if (!isAdminEmail(email, process.env.CRM_ADMIN_EMAIL)) return accepted();

  try {
    await ensureConfiguredAdminExists(email);
    const auth = getCrmSupabaseAuthClient();
    const redirectUrl = new URL("/auth/callback", request.url);
    redirectUrl.searchParams.set("next", next);
    const { error } = await auth.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectUrl.toString(),
      },
    });
    if (error) throw error;
    return accepted();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Nao foi possivel enviar o link agora." },
      { status: 503 },
    );
  }
}
