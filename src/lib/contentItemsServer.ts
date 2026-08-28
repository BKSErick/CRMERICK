import { NextResponse } from "next/server";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  CONTENT_MEDIA_BUCKET,
  type ContentChannel,
  type ContentDraft,
  type ContentItem,
  type ContentMetrics,
  type ContentStatus,
  isContentChannel,
  isContentStatus,
  validateContentDraft,
} from "@/lib/contentItems";
import type { getCrmSupabaseAdmin } from "@/lib/crmSupabase";

type SupabaseAdmin = ReturnType<typeof getCrmSupabaseAdmin>;

const TABLE = "content_items";
const COLUMNS =
  "id, channel, type, title, hook, excerpt, caption, media_url, media_path, media_kind, status, scheduled_at, published_at, external_id, permalink, error_message, source, legacy_n, metrics, created_at, updated_at";

export function contentErrorResponse(error: unknown, status = 500) {
  return NextResponse.json(
    { ok: false, error: getApiErrorMessage(error, "Erro inesperado em Conteudo") },
    { status },
  );
}

export function parseChannel(value: unknown): ContentChannel | null {
  return isContentChannel(value) ? value : null;
}

export function parseStatus(value: unknown): ContentStatus | null {
  return isContentStatus(value) ? value : null;
}

export async function listContentItems(
  supabase: SupabaseAdmin,
  filters: { channel?: ContentChannel | null; status?: ContentStatus | null } = {},
) {
  let query = supabase.from(TABLE).select(COLUMNS);
  if (filters.channel) query = query.eq("channel", filters.channel);
  if (filters.status) query = query.eq("status", filters.status);
  const result = await query.order("created_at", { ascending: false }).limit(1000);
  if (result.error) throw result.error;
  return (result.data ?? []) as unknown as ContentItem[];
}

export async function getContentItem(supabase: SupabaseAdmin, id: string) {
  const result = await supabase.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Conteudo nao encontrado.");
  return result.data as unknown as ContentItem;
}

export async function createContentItem(supabase: SupabaseAdmin, draft: ContentDraft) {
  const row = validateContentDraft(draft);
  const result = await supabase.from(TABLE).insert(row).select(COLUMNS).single();
  if (result.error) throw result.error;
  return result.data as unknown as ContentItem;
}

// PATCH parcial: so os campos presentes no corpo entram no update. Undefined e
// "nao mexe"; null e "limpa" (ex.: tirar a data de postagem).
export async function updateContentItem(
  supabase: SupabaseAdmin,
  id: string,
  patch: Partial<ContentDraft>,
) {
  const current = await getContentItem(supabase, id);
  const merged = validateContentDraft({
    channel: patch.channel ?? current.channel,
    type: patch.type ?? current.type,
    title: patch.title !== undefined ? patch.title : current.title,
    hook: patch.hook !== undefined ? patch.hook : current.hook,
    excerpt: patch.excerpt !== undefined ? patch.excerpt : current.excerpt,
    caption: patch.caption !== undefined ? patch.caption : current.caption,
    mediaUrl: patch.mediaUrl !== undefined ? patch.mediaUrl : current.media_url,
    mediaPath: patch.mediaPath !== undefined ? patch.mediaPath : current.media_path,
    mediaKind: patch.mediaKind !== undefined ? patch.mediaKind : current.media_kind,
    status: patch.status ?? current.status,
    scheduledAt: patch.scheduledAt !== undefined ? patch.scheduledAt : current.scheduled_at,
    source: current.source,
  });

  // A midia antiga vira lixo no bucket se o arquivo for trocado; remove junto.
  if (current.media_path && merged.media_path !== current.media_path) {
    await supabase.storage.from(CONTENT_MEDIA_BUCKET).remove([current.media_path]);
  }

  // Editou = a mensagem da tentativa anterior nao descreve mais o item. Deixar o erro
  // velho colado faz o usuario ler "exige imagem" num item que ja tem imagem.
  const result = await supabase
    .from(TABLE)
    .update({ ...merged, error_message: null })
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (result.error) throw result.error;
  return result.data as unknown as ContentItem;
}

export async function deleteContentItem(supabase: SupabaseAdmin, id: string) {
  const current = await getContentItem(supabase, id);
  if (current.media_path) {
    await supabase.storage.from(CONTENT_MEDIA_BUCKET).remove([current.media_path]);
  }
  const result = await supabase.from(TABLE).delete().eq("id", id);
  if (result.error) throw result.error;
  return current;
}

// Versao em lote: uma consulta pra achar as midias, uma remocao no Storage e um unico
// delete no banco — em vez de 3 idas e voltas por item.
export async function deleteContentItems(supabase: SupabaseAdmin, ids: string[]) {
  const found = await supabase.from(TABLE).select("id, media_path").in("id", ids);
  if (found.error) throw found.error;
  const rows = (found.data ?? []) as Array<{ id: string; media_path: string | null }>;
  if (rows.length === 0) return 0;

  const paths = rows.map((row) => row.media_path).filter((path): path is string => Boolean(path));
  if (paths.length > 0) {
    await supabase.storage.from(CONTENT_MEDIA_BUCKET).remove(paths);
  }

  const removed = await supabase.from(TABLE).delete().in("id", rows.map((row) => row.id));
  if (removed.error) throw removed.error;
  return rows.length;
}

export async function markContentPublished(
  supabase: SupabaseAdmin,
  id: string,
  info: { externalId: string; permalink?: string | null; publishedAt?: string },
) {
  const result = await supabase
    .from(TABLE)
    .update({
      status: "publicado",
      external_id: info.externalId,
      permalink: info.permalink ?? null,
      published_at: info.publishedAt ?? new Date().toISOString(),
      error_message: null,
    })
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (result.error) throw result.error;
  return result.data as unknown as ContentItem;
}

// Falha de publicacao vira estado no banco, nao so um toast que some no reload:
// sem isso nao da pra saber depois qual item ficou pra tras e por que.
export async function markContentFailed(supabase: SupabaseAdmin, id: string, message: string) {
  const result = await supabase
    .from(TABLE)
    .update({ status: "falhou", error_message: message.slice(0, 500) })
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (result.error) throw result.error;
  return result.data as unknown as ContentItem;
}

export type PublishedMediaInput = {
  externalId: string;
  type: "Post" | "Story" | "Reel";
  caption: string | null;
  permalink: string | null;
  publishedAt: string | null;
  mediaUrl: string | null;
  metrics: ContentMetrics;
};

// Traz do Instagram o que ja foi publicado pra mesma tabela do backlog. O upsert usa
// (channel, external_id): rodar de novo atualiza as metricas em vez de duplicar post.
export async function upsertPublishedInstagram(
  supabase: SupabaseAdmin,
  medias: PublishedMediaInput[],
) {
  if (medias.length === 0) return { inserted: 0, items: [] as ContentItem[] };

  const rows = medias.map((media) => ({
    channel: "instagram" as const,
    type: media.type,
    title: firstLine(media.caption),
    caption: media.caption,
    excerpt: firstLine(media.caption),
    media_url: media.mediaUrl,
    media_kind: media.type === "Reel" ? "video" : "image",
    status: "publicado" as const,
    published_at: media.publishedAt,
    external_id: media.externalId,
    permalink: media.permalink,
    source: "instagram-sync",
    metrics: media.metrics,
  }));

  const result = await supabase
    .from(TABLE)
    .upsert(rows, { onConflict: "channel,external_id" })
    .select(COLUMNS);
  if (result.error) throw result.error;
  const items = (result.data ?? []) as unknown as ContentItem[];
  return { inserted: items.length, items };
}

function firstLine(caption: string | null) {
  const text = (caption ?? "").split("\n")[0]?.trim();
  if (!text) return "(sem legenda)";
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}
