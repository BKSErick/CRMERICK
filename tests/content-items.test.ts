import assert from "node:assert/strict";
import test from "node:test";

import {
  INSTAGRAM_CAPTION_LIMIT,
  THREADS_TEXT_LIMIT,
  acceptsCaption,
  allowedMediaKinds,
  assertPublishable,
  captionLimitFor,
  contentTypesFor,
  type ContentItem,
  mediaKindFromMime,
  normalizeScheduledAt,
  pageWindow,
  requiresMedia,
  sortContentItems,
  summarizeContent,
  validateContentDraft,
} from "../src/lib/contentItems.ts";

function item(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    channel: "instagram",
    type: "Post",
    title: "Titulo",
    hook: null,
    excerpt: null,
    caption: "Legenda",
    media_url: "https://exemplo.com/foto.jpg",
    media_path: "instagram/foto.jpg",
    media_kind: "image",
    status: "planejado",
    scheduled_at: null,
    published_at: null,
    external_id: null,
    permalink: null,
    error_message: null,
    source: "manual",
    legacy_n: null,
    metrics: null,
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

test("cada canal so oferece os tipos que a API dele publica", () => {
  assert.deepEqual(contentTypesFor("threads"), ["Thread"]);
  assert.deepEqual(contentTypesFor("instagram"), ["Post", "Story", "Reel"]);
  // Carrossel exige containers filhos na Graph API e ainda nao foi implementado:
  // se aparecer no dropdown, o usuario cria um item que nunca publica.
  assert.equal(contentTypesFor("instagram").includes("Carrossel" as never), false);
});

test("limite de caracteres segue a API de cada canal", () => {
  assert.equal(captionLimitFor("instagram"), INSTAGRAM_CAPTION_LIMIT);
  assert.equal(captionLimitFor("threads"), THREADS_TEXT_LIMIT);
});

test("Story nao aceita legenda e Reel exige video", () => {
  assert.equal(acceptsCaption("Story"), false);
  assert.equal(acceptsCaption("Post"), true);
  assert.deepEqual(allowedMediaKinds("Reel"), ["video"]);
  assert.deepEqual(allowedMediaKinds("Story"), ["image", "video"]);
  assert.equal(requiresMedia("Thread"), false);
});

test("mime vira tipo de midia", () => {
  assert.equal(mediaKindFromMime("image/jpeg"), "image");
  assert.equal(mediaKindFromMime("video/mp4"), "video");
  assert.equal(mediaKindFromMime("application/pdf"), null);
});

test("data de postagem normaliza para ISO e recusa lixo", () => {
  assert.equal(normalizeScheduledAt(""), null);
  assert.equal(normalizeScheduledAt(null), null);
  assert.equal(normalizeScheduledAt("2026-09-01T10:30:00.000Z"), "2026-09-01T10:30:00.000Z");
  assert.throws(() => normalizeScheduledAt("ontem"), /invalida/i);
});

test("draft invalido morre antes do banco", () => {
  assert.throws(() => validateContentDraft({ channel: "threads", type: "Post" }), /nao vale para o canal/);
  assert.throws(
    () => validateContentDraft({ channel: "threads", type: "Thread", caption: "x".repeat(THREADS_TEXT_LIMIT + 1) }),
    /limite de 500/,
  );
  assert.throws(
    () => validateContentDraft({ channel: "instagram", type: "Post", mediaKind: "video" }),
    /nao aceita midia/,
  );
});

test("draft valido chega normalizado, com status e origem padrao", () => {
  const row = validateContentDraft({ channel: "instagram", type: "Post", title: "  Um post  ", caption: " oi " });
  assert.equal(row.title, "Um post");
  assert.equal(row.caption, "oi");
  assert.equal(row.status, "planejado");
  assert.equal(row.source, "manual");
  assert.equal(row.scheduled_at, null);
});

test("assertPublishable barra o que a Graph API recusaria", () => {
  assert.throws(() => assertPublishable(item({ status: "publicado" })), /ja foi publicado/);
  assert.throws(() => assertPublishable(item({ media_url: null })), /exige uma imagem ou video/);
  assert.throws(() => assertPublishable(item({ type: "Reel", media_kind: "image" })), /video/);
  assert.throws(
    () => assertPublishable(item({ channel: "threads", type: "Thread", media_url: null, caption: "" })),
    /Escreva o texto/,
  );
  assert.throws(
    () => assertPublishable(item({ channel: "threads", type: "Thread", media_url: null, caption: "x".repeat(501) })),
    /500 caracteres/,
  );
  // Story sem legenda continua publicavel: a API e que nao aceita caption nele.
  assert.doesNotThrow(() => assertPublishable(item({ type: "Story", caption: null })));
});

test("a linha do tempo mistura agendado e publicado pela data que vale", () => {
  const agendado = item({ id: "a", scheduled_at: "2026-09-10T12:00:00.000Z" });
  const publicado = item({ id: "b", status: "publicado", published_at: "2026-09-05T12:00:00.000Z" });
  const semData = item({ id: "c", created_at: "2026-01-01T12:00:00.000Z" });
  const ordered = sortContentItems([semData, publicado, agendado]);
  assert.deepEqual(ordered.map((row) => row.id), ["a", "b", "c"]);
});

test("paginacao mostra todas as paginas quando cabem", () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(3, 4), [1, 2, 3, 4]);
  assert.deepEqual(pageWindow(4, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("paginacao encurta com reticencias sem perder primeira, ultima e vizinhas", () => {
  // No meio: reticencias dos dois lados.
  assert.deepEqual(pageWindow(6, 12), [1, "gap", 5, 6, 7, "gap", 12]);
  // Perto do inicio: nao pode abrir buraco logo depois da pagina 1.
  assert.deepEqual(pageWindow(2, 12), [1, 2, 3, 4, "gap", 12]);
  // Perto do fim: mesma coisa do outro lado.
  assert.deepEqual(pageWindow(11, 12), [1, "gap", 9, 10, 11, 12]);
  // A pagina atual sempre aparece, e nunca sai numero fora do intervalo.
  for (let page = 1; page <= 12; page += 1) {
    const window = pageWindow(page, 12);
    assert.ok(window.includes(page), `pagina ${page} sumiu da janela`);
    assert.ok(window.every((entry) => entry === "gap" || (entry >= 1 && entry <= 12)));
  }
});

test("resumo conta por status e tira media de alcance so do que tem numero", () => {
  const summary = summarizeContent([
    item({ status: "planejado" }),
    item({ status: "agendado" }),
    item({ status: "publicado", metrics: { reach: 100 } }),
    item({ status: "publicado", metrics: { reach: 200 } }),
    item({ status: "publicado", metrics: {} }),
  ]);
  assert.equal(summary.total, 5);
  assert.equal(summary.planejado, 1);
  assert.equal(summary.agendado, 1);
  assert.equal(summary.publicado, 3);
  // A publicacao sem alcance nao pode puxar a media pra baixo virando zero.
  assert.equal(summary.avgReach, 150);
});
