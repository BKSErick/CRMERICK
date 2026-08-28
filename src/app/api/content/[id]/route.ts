import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { contentErrorResponse, deleteContentItem, updateContentItem } from "@/lib/contentItemsServer";
import { requireDemandAdminSession } from "@/lib/demandAuth";

export const runtime = "nodejs";
// Primeira rota de API com segmento dinamico no projeto: sem isso o Next tenta gerar
// caminhos estaticos para [id] no build/dev e a rota morre com 500 antes de rodar.
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireDemandAdminSession(request, "conteudo");
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();

    // Só as chaves presentes no corpo entram no patch: `undefined` nao mexe no campo,
    // `null` limpa (e assim que a tela tira a data de postagem de um item).
    const patch: Record<string, unknown> = {};
    for (const key of ["type", "title", "hook", "excerpt", "caption", "mediaUrl", "mediaPath", "mediaKind", "status", "scheduledAt"]) {
      if (key in body) patch[key] = body[key];
    }

    const item = await updateContentItem(supabase, id, patch);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return contentErrorResponse(error, 400);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireDemandAdminSession(request, "conteudo");
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const supabase = getCrmSupabaseAdmin();
    await deleteContentItem(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return contentErrorResponse(error, 400);
  }
}
