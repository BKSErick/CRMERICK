import { NextRequest, NextResponse } from "next/server";
import { contentErrorResponse, upsertPublishedInstagram } from "@/lib/contentItemsServer";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { requireDemandAdminSession } from "@/lib/demandAuth";
import { fetchPublishedMedia, resolveInstagramCredentials } from "@/lib/instagramGraph";

export const runtime = "nodejs";
// Puxar insights de cada midia sao N chamadas; o historico inteiro nao cabe em 15s.
export const maxDuration = 120;

// Traz o que ja foi publicado no Instagram pra mesma tabela do backlog, que e o que
// faz a tela mostrar planejado e publicado na mesma linha do tempo — e o que da a uma
// IA o historico real de desempenho ao pedir conteudo novo.
export async function POST(request: NextRequest) {
  const auth = await requireDemandAdminSession(request, "conteudo");
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const credentials = resolveInstagramCredentials(request);
    const medias = await fetchPublishedMedia(credentials);
    const { inserted } = await upsertPublishedInstagram(supabase, medias);
    return NextResponse.json({ ok: true, synced: inserted, found: medias.length });
  } catch (error) {
    return contentErrorResponse(error, 400);
  }
}
