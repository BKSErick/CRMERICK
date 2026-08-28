import { NextRequest, NextResponse } from "next/server";
import { assertPublishable } from "@/lib/contentItems";
import {
  contentErrorResponse,
  getContentItem,
  markContentFailed,
  markContentPublished,
} from "@/lib/contentItemsServer";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { requireDemandAdminSession } from "@/lib/demandAuth";
import { publishInstagramMedia, resolveInstagramCredentials } from "@/lib/instagramGraph";
import { loadStoredToken, refreshIfNeeded, THREADS_API } from "@/lib/threads";

export const runtime = "nodejs";
// Publicar video no Instagram espera o container ficar pronto; o default de 15s corta no meio.
export const maxDuration = 120;

// Publica AGORA o item pedido. Acao irreversivel e publica: a tela confirma antes.
// Nao existe agendamento nativo no Instagram — quando um cron entrar, ele vai chamar
// exatamente este caminho na hora marcada.
export async function POST(request: NextRequest) {
  const auth = await requireDemandAdminSession(request, "conteudo");
  if (!auth.ok) return auth.response;

  const supabase = getCrmSupabaseAdmin();

  // Validacao roda ANTES do bloco que marca falha: "Story exige imagem" e o item ainda
  // nao estar pronto, nao uma tentativa de publicacao que deu errado. Marcar 'falhou'
  // aqui sujaria o backlog so por clicar no botao cedo demais.
  let item;
  try {
    const body = await request.json();
    const id = String(body?.id ?? "");
    if (!id) throw new Error("id do conteudo e obrigatorio.");
    item = await getContentItem(supabase, id);
    assertPublishable(item);
  } catch (error) {
    return contentErrorResponse(error, 400);
  }

  const itemId = item.id;

  try {
    const result =
      item.channel === "threads"
        ? await publishThreads(item.caption ?? "")
        : await publishInstagramMedia({
            credentials: resolveInstagramCredentials(request),
            type: item.type as "Post" | "Story" | "Reel",
            mediaUrl: item.media_url as string,
            mediaKind: (item.media_kind ?? "image") as "image" | "video",
            caption: item.caption,
          });

    const updated = await markContentPublished(supabase, itemId, {
      externalId: result.id,
      permalink: result.permalink,
    });
    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao publicar.";
    // Aqui a chamada a API ja aconteceu e deu errado: vira estado no banco pra nao
    // sumir no reload, senao nao da pra saber depois qual item ficou pra tras.
    try {
      await markContentFailed(supabase, itemId, message);
    } catch {
      // Se nem gravar a falha deu certo, a mensagem abaixo ainda chega na tela.
    }
    return contentErrorResponse(error, 400);
  }
}

// O Threads tem host e token proprios (OAuth de usuario, nao o page token do Instagram).
// Mesmas duas etapas de /api/threads/publish, aqui so pra gravar o resultado no backlog.
async function publishThreads(text: string) {
  const stored = await loadStoredToken();
  if (!stored) throw new Error("Threads nao conectado. Conecte em /threads.");
  const { accessToken } = await refreshIfNeeded(stored);

  const createUrl = new URL(`${THREADS_API}/me/threads`);
  createUrl.searchParams.set("media_type", "TEXT");
  createUrl.searchParams.set("text", text);
  createUrl.searchParams.set("access_token", accessToken);
  const created = await (await fetch(createUrl, { method: "POST" })).json();
  if (!created?.id) throw new Error(created?.error?.message ?? "Falha ao criar o post no Threads.");

  const publish = async () => {
    const url = new URL(`${THREADS_API}/me/threads_publish`);
    url.searchParams.set("creation_id", String(created.id));
    url.searchParams.set("access_token", accessToken);
    return (await fetch(url, { method: "POST" })).json();
  };

  let published = await publish();
  if (!published?.id) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    published = await publish();
  }
  if (!published?.id) throw new Error(published?.error?.message ?? "Falha ao publicar no Threads.");

  let permalink: string | null = null;
  try {
    const url = new URL(`${THREADS_API}/${published.id}`);
    url.searchParams.set("fields", "permalink");
    url.searchParams.set("access_token", accessToken);
    permalink = (await (await fetch(url)).json())?.permalink ?? null;
  } catch {
    permalink = null;
  }

  return { id: String(published.id), permalink };
}
