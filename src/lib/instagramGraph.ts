import type { ContentMetrics } from "@/lib/contentItems";
import type { PublishedMediaInput } from "@/lib/contentItemsServer";

export const INSTAGRAM_API_VERSION = "v21.0";
export const INSTAGRAM_API = `https://graph.facebook.com/${INSTAGRAM_API_VERSION}`;

export type InstagramCredentials = {
  accessToken: string;
  accountId: string;
  source: "local-override" | "server-env";
};

// As credenciais podem vir do .env do servidor ou de um override que a tela de
// Configuracoes guarda no localStorage e manda por header (src/lib/localConfig.ts).
// Nasceu inline na rota /api/instagram; agora publicacao e sync precisam do mesmo.
export function resolveInstagramCredentials(request: Request): InstagramCredentials {
  const overrideToken = request.headers.get("x-crm-ig-access-token")?.trim();
  const overrideAccountId = request.headers.get("x-crm-ig-business-account-id")?.trim();
  const accessToken = overrideToken || process.env.IG_ACCESS_TOKEN;
  const accountId = overrideAccountId || process.env.IG_BUSINESS_ACCOUNT_ID;

  if (!accessToken || !accountId) {
    throw new Error("Credenciais do Instagram nao configuradas no servidor.");
  }

  return {
    accessToken,
    accountId,
    source: overrideToken || overrideAccountId ? "local-override" : "server-env",
  };
}

type InsightRow = { name: string; total_value?: { value?: number }; values?: { value?: number }[] };

export function sumInsights(data: InsightRow[] | undefined) {
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    out[row.name] = row.total_value?.value ?? (row.values ?? []).reduce((a, v) => a + (v.value ?? 0), 0);
  }
  return out;
}

async function graphJson(url: URL, init?: RequestInit) {
  const response = await fetch(url, init);
  const json = await response.json();
  if (!response.ok || json?.error) {
    throw new Error(json?.error?.message ?? `Instagram respondeu ${response.status}.`);
  }
  return json;
}

// A Graph API nao tem publicacao agendada (isso e do Facebook Page, nao do Instagram):
// o que existe e criar um container e publicar. O agendamento, quando entrar, vai ser
// um cron nosso chamando esta funcao na hora marcada.
export type PublishInput = {
  credentials: InstagramCredentials;
  type: "Post" | "Story" | "Reel";
  mediaUrl: string;
  mediaKind: "image" | "video";
  caption?: string | null;
};

export async function publishInstagramMedia(input: PublishInput) {
  const { credentials, type, mediaUrl, mediaKind, caption } = input;
  const { accessToken, accountId } = credentials;

  const createUrl = new URL(`${INSTAGRAM_API}/${accountId}/media`);
  createUrl.searchParams.set("access_token", accessToken);
  if (mediaKind === "video") {
    createUrl.searchParams.set("video_url", mediaUrl);
  } else {
    createUrl.searchParams.set("image_url", mediaUrl);
  }

  // Video no feed hoje entra como Reel: a API nao tem mais VIDEO para /media do feed.
  if (type === "Story") {
    createUrl.searchParams.set("media_type", "STORIES");
  } else if (type === "Reel" || mediaKind === "video") {
    createUrl.searchParams.set("media_type", "REELS");
  }

  // Story nao aceita legenda; mandar caption aqui faz a Meta recusar o container.
  const text = (caption ?? "").trim();
  if (text && type !== "Story") {
    createUrl.searchParams.set("caption", text);
  }

  const created = await graphJson(createUrl, { method: "POST" });
  const creationId = String(created?.id ?? "");
  if (!creationId) throw new Error("O Instagram nao devolveu o container da midia.");

  if (mediaKind === "video") {
    await waitForContainer(creationId, accessToken);
  }

  const publishUrl = new URL(`${INSTAGRAM_API}/${accountId}/media_publish`);
  publishUrl.searchParams.set("creation_id", creationId);
  publishUrl.searchParams.set("access_token", accessToken);

  let published: { id?: string };
  try {
    published = await graphJson(publishUrl, { method: "POST" });
  } catch (error) {
    // Container de imagem tambem pode nao estar pronto no primeiro toque; uma
    // retentativa resolve, mesmo tratamento do /api/threads/publish.
    await sleep(4000);
    published = await graphJson(publishUrl, { method: "POST" });
    if (!published?.id) throw error;
  }

  const mediaId = String(published?.id ?? "");
  if (!mediaId) throw new Error("O Instagram nao devolveu o id da publicacao.");

  return { id: mediaId, permalink: await fetchPermalink(mediaId, accessToken) };
}

// Video sobe de forma assincrona: publicar antes de FINISHED devolve erro generico.
async function waitForContainer(creationId: string, accessToken: string, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const url = new URL(`${INSTAGRAM_API}/${creationId}`);
    url.searchParams.set("fields", "status_code,status");
    url.searchParams.set("access_token", accessToken);
    const json = await graphJson(url);
    const code = String(json?.status_code ?? "");
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`O Instagram rejeitou o video: ${json?.status ?? code}.`);
    }
    await sleep(3000);
  }
  throw new Error("O Instagram nao terminou de processar o video a tempo. Tente publicar de novo em alguns minutos.");
}

async function fetchPermalink(mediaId: string, accessToken: string) {
  try {
    const url = new URL(`${INSTAGRAM_API}/${mediaId}`);
    url.searchParams.set("fields", "permalink");
    url.searchParams.set("access_token", accessToken);
    const json = await graphJson(url);
    return (json?.permalink as string) ?? null;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GraphMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
};

function mapMediaType(media: GraphMedia): "Post" | "Story" | "Reel" {
  const product = (media.media_product_type ?? "").toUpperCase();
  if (product === "REELS") return "Reel";
  if (product === "STORY") return "Story";
  return "Post";
}

// Puxa o historico publicado com insights por post. Pagina de verdade (a rota do painel
// para em 12 porque so mostra os ultimos); aqui o objetivo e o historico inteiro.
export async function fetchPublishedMedia(
  credentials: InstagramCredentials,
  options: { max?: number } = {},
): Promise<PublishedMediaInput[]> {
  const { accessToken, accountId } = credentials;
  const max = options.max ?? 200;

  const first = new URL(`${INSTAGRAM_API}/${accountId}/media`);
  first.searchParams.set(
    "fields",
    "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
  );
  first.searchParams.set("limit", "50");
  first.searchParams.set("access_token", accessToken);

  const collected: GraphMedia[] = [];
  let next: string | null = first.toString();
  while (next && collected.length < max) {
    const json: { data?: GraphMedia[]; paging?: { next?: string } } = await graphJson(new URL(next));
    collected.push(...(json.data ?? []));
    next = json.paging?.next ?? null;
  }

  const medias = collected.slice(0, max);
  return Promise.all(
    medias.map(async (media) => ({
      externalId: media.id,
      type: mapMediaType(media),
      caption: media.caption ?? null,
      permalink: media.permalink ?? null,
      publishedAt: media.timestamp ?? null,
      mediaUrl: media.media_url ?? media.thumbnail_url ?? null,
      metrics: await fetchMediaMetrics(media, accessToken),
    })),
  );
}

async function fetchMediaMetrics(media: GraphMedia, accessToken: string): Promise<ContentMetrics> {
  const base: ContentMetrics = { likes: media.like_count ?? 0, comments: media.comments_count ?? 0 };
  try {
    const url = new URL(`${INSTAGRAM_API}/${media.id}/insights`);
    url.searchParams.set("metric", "reach,saved,shares,total_interactions");
    url.searchParams.set("access_token", accessToken);
    const json = await graphJson(url);
    const values = sumInsights(json.data);
    return {
      ...base,
      reach: values.reach ?? 0,
      saved: values.saved ?? 0,
      shares: values.shares ?? 0,
      interactions: values.total_interactions ?? 0,
    };
  } catch {
    // Story antiga e post muito velho deixam de ter insights; metrica ausente nao
    // pode derrubar o sync inteiro.
    return base;
  }
}
