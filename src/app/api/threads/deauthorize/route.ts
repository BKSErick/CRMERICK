import { NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { parseSignedRequest, THREADS_PROVIDER } from "@/lib/threads";

// Meta chama aqui quando o usuario remove o app do Threads.
// Obrigatorio no painel ("URL de retorno de chamada para desinstalar").
// Acao: apagar o token guardado, senao o CRM fica tentando usar credencial morta.
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const signed = String(form.get("signed_request") ?? "");
    const payload = parseSignedRequest(signed, process.env.THREADS_APP_SECRET);
    if (!payload) {
      return NextResponse.json({ ok: false, error: "signed_request invalido." }, { status: 400 });
    }

    const supabase = getCrmSupabaseAdmin();
    await supabase
      .from("integration_settings")
      .update({
        access_token: null,
        token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", THREADS_PROVIDER);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Falha ao processar desautorizacao.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}