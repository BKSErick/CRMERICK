import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import {
  contentErrorResponse,
  createContentItem,
  deleteContentItems,
  listContentItems,
  parseChannel,
  parseStatus,
} from "@/lib/contentItemsServer";
import { requireDemandAdminSession } from "@/lib/demandAuth";

export const runtime = "nodejs";

// Backlog editorial. Serve a tela e tambem os agentes: `GET /api/content?status=publicado`
// e como uma IA descobre o que ja foi postado antes de propor conteudo novo.
export async function GET(request: NextRequest) {
  const auth = await requireDemandAdminSession(request, "conteudo");
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const params = request.nextUrl.searchParams;
    const items = await listContentItems(supabase, {
      channel: parseChannel(params.get("channel")),
      status: parseStatus(params.get("status")),
    });
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return contentErrorResponse(error, 400);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireDemandAdminSession(request, "conteudo");
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const item = await createContentItem(supabase, {
      channel: body?.channel,
      type: body?.type,
      title: body?.title,
      hook: body?.hook,
      excerpt: body?.excerpt,
      caption: body?.caption,
      mediaUrl: body?.mediaUrl,
      mediaPath: body?.mediaPath,
      mediaKind: body?.mediaKind,
      status: body?.status,
      scheduledAt: body?.scheduledAt,
      source: body?.source ?? "manual",
    });
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    return contentErrorResponse(error, 400);
  }
}

// Exclusao em lote. Apagar 27 itens um a um pela tela sao 27 confirmacoes; o caso real
// e "limpar tudo que esta planejado de uma vez".
export async function DELETE(request: NextRequest) {
  const auth = await requireDemandAdminSession(request, "conteudo");
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    if (ids.length === 0) throw new Error("Nenhum conteudo selecionado.");
    const removed = await deleteContentItems(supabase, ids);
    return NextResponse.json({ ok: true, removed });
  } catch (error) {
    return contentErrorResponse(error, 400);
  }
}
