import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { parseSignedRequest, THREADS_PROVIDER } from "@/lib/threads";

// Meta chama aqui quando o usuario pede exclusao dos dados dele.
// Obrigatorio no painel ("Excluir URL de retorno de chamada").
// A resposta PRECISA ser JSON com url + confirmation_code, senao a Meta reprova.
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const signed = String(form.get("signed_request") ?? "");
    const payload = parseSignedRequest(signed, process.env.THREADS_APP_SECRET);
    if (!payload) {
      return NextResponse.json({ ok: false, error: "signed_request invalido." }, { status: 400 });
    }

    const userId = String(payload.user_id ?? "desconhecido");
    const supabase = getCrmSupabaseAdmin();

    // O unico dado do Threads que o CRM guarda e o token/identificacao da conta.
    await supabase
      .from("integration_settings")
      .update({
        access_token: null,
        account_id: null,
        username: null,
        token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", THREADS_PROVIDER);

    const confirmationCode = createHash("sha256")
      .update(`${userId}:${Date.now()}`)
      .digest("hex")
      .slice(0, 16);

    const origin = new URL(request.url).origin;
    return NextResponse.json({
      url: `${origin}/threads?exclusao=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Falha ao processar exclusao.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}