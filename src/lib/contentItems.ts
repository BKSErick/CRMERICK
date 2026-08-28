// Tipos e regras puras do backlog editorial. Sem Supabase e sem `next/server` aqui:
// a tela (client) e as rotas (server) importam deste arquivo, o acesso ao banco mora
// em contentItemsServer.ts. Mesmo par de clients.ts / clientsServer.ts.

export const CONTENT_MEDIA_BUCKET = "content-media";

// Limites reais das APIs, nao preferencia nossa.
export const INSTAGRAM_CAPTION_LIMIT = 2200;
export const THREADS_TEXT_LIMIT = 500;
export const CONTENT_TITLE_LIMIT = 180;
// 50 MB e o teto do bucket content-media no plano atual do Supabase: aceitar mais na
// tela so trocaria uma mensagem clara por um erro cru do Storage no meio do upload.
export const DEFAULT_MAX_CONTENT_MEDIA_BYTES = 50 * 1024 * 1024;

export type ContentChannel = "instagram" | "threads";
export type ContentType = "Post" | "Story" | "Reel" | "Carrossel" | "Thread";
export type ContentStatus = "rascunho" | "planejado" | "agendado" | "publicado" | "falhou";
export type ContentMediaKind = "image" | "video";

export type ContentMetrics = {
  reach?: number;
  likes?: number;
  comments?: number;
  saved?: number;
  shares?: number;
  interactions?: number;
};

export type ContentItem = {
  id: string;
  channel: ContentChannel;
  type: ContentType;
  title: string | null;
  hook: string | null;
  excerpt: string | null;
  caption: string | null;
  media_url: string | null;
  media_path: string | null;
  media_kind: ContentMediaKind | null;
  status: ContentStatus;
  scheduled_at: string | null;
  published_at: string | null;
  external_id: string | null;
  permalink: string | null;
  error_message: string | null;
  source: string | null;
  legacy_n: number | null;
  metrics: ContentMetrics | null;
  created_at: string;
  updated_at: string;
};

export type ContentDraft = {
  channel: ContentChannel;
  type: ContentType;
  title?: string | null;
  hook?: string | null;
  excerpt?: string | null;
  caption?: string | null;
  mediaUrl?: string | null;
  mediaPath?: string | null;
  mediaKind?: ContentMediaKind | null;
  status?: ContentStatus;
  scheduledAt?: string | null;
  source?: string | null;
};

export const CONTENT_CHANNELS: readonly ContentChannel[] = ["instagram", "threads"];
export const CONTENT_STATUSES: readonly ContentStatus[] = [
  "rascunho",
  "planejado",
  "agendado",
  "publicado",
  "falhou",
];

export const STATUS_LABELS: Record<ContentStatus, string> = {
  rascunho: "Rascunho",
  planejado: "Planejado",
  agendado: "Agendado",
  publicado: "Publicado",
  falhou: "Falhou",
};

// A classe do pill segue o vocabulario ja existente em globals.css (status-pill).
export const STATUS_PILL_CLASS: Record<ContentStatus, string> = {
  rascunho: "status-pill",
  planejado: "status-pill active",
  agendado: "status-pill active",
  publicado: "status-pill done",
  falhou: "status-pill danger",
};

// 'Carrossel' fica de fora: publicar carrossel exige containers filhos na Graph API,
// que ainda nao foi implementado. Deixar no dropdown criaria um item impublicavel.
export function contentTypesFor(channel: ContentChannel): ContentType[] {
  return channel === "threads" ? ["Thread"] : ["Post", "Story", "Reel"];
}

export function captionLimitFor(channel: ContentChannel) {
  return channel === "threads" ? THREADS_TEXT_LIMIT : INSTAGRAM_CAPTION_LIMIT;
}

// Story e Reel sao os unicos que a API aceita sem legenda; Story ignora caption por completo.
export function acceptsCaption(type: ContentType) {
  return type !== "Story";
}

export function requiresMedia(type: ContentType) {
  return type !== "Thread";
}

export function allowedMediaKinds(type: ContentType): ContentMediaKind[] {
  if (type === "Reel") return ["video"];
  if (type === "Story") return ["image", "video"];
  if (type === "Thread") return [];
  return ["image"];
}

export function mediaKindFromMime(mimeType: string): ContentMediaKind | null {
  const mime = mimeType.trim().toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return null;
}

export function isContentChannel(value: unknown): value is ContentChannel {
  return CONTENT_CHANNELS.includes(value as ContentChannel);
}

export function isContentStatus(value: unknown): value is ContentStatus {
  return CONTENT_STATUSES.includes(value as ContentStatus);
}

function trimmedOrNull(value: unknown, max: number, field: string) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > max) {
    throw new Error(`${field} passa do limite de ${max} caracteres (tem ${text.length}).`);
  }
  return text;
}

export function normalizeScheduledAt(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Data de postagem invalida.");
  return date.toISOString();
}

// Valida o que o usuario digitou antes de encostar no banco. Erros voltam como
// mensagem legivel na tela, nao como constraint violation crua do Postgres.
export function validateContentDraft(draft: ContentDraft) {
  if (!isContentChannel(draft.channel)) throw new Error("Canal invalido.");
  const types = contentTypesFor(draft.channel);
  if (!types.includes(draft.type)) {
    throw new Error(`Tipo "${draft.type}" nao vale para o canal ${draft.channel}.`);
  }
  if (draft.status !== undefined && !isContentStatus(draft.status)) {
    throw new Error("Status invalido.");
  }

  const kinds = allowedMediaKinds(draft.type);
  if (draft.mediaKind && !kinds.includes(draft.mediaKind)) {
    throw new Error(`${draft.type} nao aceita midia do tipo ${draft.mediaKind}.`);
  }

  return {
    channel: draft.channel,
    type: draft.type,
    title: trimmedOrNull(draft.title, CONTENT_TITLE_LIMIT, "Titulo"),
    hook: trimmedOrNull(draft.hook, 600, "Gancho"),
    excerpt: trimmedOrNull(draft.excerpt, 600, "Resumo"),
    caption: trimmedOrNull(draft.caption, captionLimitFor(draft.channel), "Legenda"),
    media_url: trimmedOrNull(draft.mediaUrl, 2000, "URL da midia"),
    media_path: trimmedOrNull(draft.mediaPath, 500, "Caminho da midia"),
    media_kind: draft.mediaKind ?? null,
    status: draft.status ?? "planejado",
    scheduled_at: normalizeScheduledAt(draft.scheduledAt),
    source: trimmedOrNull(draft.source, 60, "Origem") ?? "manual",
  };
}

// O que a API precisa receber pra publicar de verdade. Roda antes de gastar a chamada
// na Graph API, porque erro de container volta como mensagem generica da Meta.
export function assertPublishable(item: ContentItem) {
  if (item.status === "publicado") throw new Error("Esse item ja foi publicado.");

  const text = (item.caption ?? "").trim();
  if (item.channel === "threads") {
    if (!text) throw new Error("Escreva o texto antes de publicar no Threads.");
    if (text.length > THREADS_TEXT_LIMIT) {
      throw new Error(`O Threads aceita ate ${THREADS_TEXT_LIMIT} caracteres (esse tem ${text.length}).`);
    }
    return;
  }

  if (requiresMedia(item.type) && !item.media_url) {
    throw new Error(`${item.type} no Instagram exige uma imagem ou video antes de publicar.`);
  }
  if (item.type === "Reel" && item.media_kind !== "video") {
    throw new Error("Reel exige um arquivo de video.");
  }
  if (acceptsCaption(item.type) && text.length > INSTAGRAM_CAPTION_LIMIT) {
    throw new Error(`A legenda passa do limite de ${INSTAGRAM_CAPTION_LIMIT} caracteres (tem ${text.length}).`);
  }
}

// Uma linha do tempo so: o que esta agendado e o que ja saiu, na mesma ordem.
// Sem data nenhuma (rascunho novo), cai pro created_at pra nao sumir no fim da lista.
export function contentTimestamp(item: ContentItem) {
  const raw = item.scheduled_at ?? item.published_at ?? item.created_at;
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function sortContentItems(items: ContentItem[]) {
  return [...items].sort((a, b) => contentTimestamp(b) - contentTimestamp(a));
}

export function summarizeContent(items: ContentItem[]) {
  const byStatus = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  const published = items.filter((item) => item.status === "publicado");
  const reachValues = published
    .map((item) => Number(item.metrics?.reach ?? 0))
    .filter((value) => value > 0);
  const avgReach = reachValues.length
    ? Math.round(reachValues.reduce((a, b) => a + b, 0) / reachValues.length)
    : 0;

  return {
    total: items.length,
    rascunho: byStatus.rascunho ?? 0,
    planejado: byStatus.planejado ?? 0,
    agendado: byStatus.agendado ?? 0,
    publicado: published.length,
    falhou: byStatus.falhou ?? 0,
    avgReach,
  };
}

export const CONTENT_PAGE_SIZE = 20;

// Janela de paginas do rodape: 1 … 4 5 [6] 7 8 … 12. Sem a janela, o historico
// publicado (46 posts hoje, e so cresce) vira uma fileira de botoes sem fim.
export function pageWindow(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((page) => pages.add(page));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((page) => pages.add(page));

  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) out.push("gap");
    out.push(page);
    previous = page;
  }
  return out;
}

export function contentStoragePath(channel: ContentChannel, fileName: string, uid: string) {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return `${channel}/${uid}-${safe}`;
}
