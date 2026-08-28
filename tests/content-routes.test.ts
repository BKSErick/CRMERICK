import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function exists(relativePath: string) {
  return existsSync(new URL(`../${relativePath}`, import.meta.url));
}

test("rotas de conteudo cobrem listar, editar, midia, publicar e importar", () => {
  assert.match(source("src/app/api/content/route.ts"), /listContentItems/);
  assert.match(source("src/app/api/content/route.ts"), /createContentItem/);
  assert.match(source("src/app/api/content/[id]/route.ts"), /updateContentItem/);
  assert.match(source("src/app/api/content/[id]/route.ts"), /deleteContentItem/);
  assert.match(source("src/app/api/content/media/route.ts"), /createSignedUploadUrl/);
  assert.match(source("src/app/api/content/publish/route.ts"), /publishInstagramMedia/);
  assert.match(source("src/app/api/content/sync-instagram/route.ts"), /fetchPublishedMedia/);
});

test("exclusao em lote existe e a rota dinamica nao tenta virar estatica", () => {
  const lista = source("src/app/api/content/route.ts");
  assert.match(lista, /export async function DELETE/);
  assert.match(lista, /deleteContentItems/);
  assert.match(source("src/lib/contentItemsServer.ts"), /export async function deleteContentItems/);

  // Primeira rota de API com [id] no projeto: sem force-dynamic o Next tenta gerar
  // caminhos estaticos e a rota devolve 500 antes de rodar o handler.
  assert.match(source("src/app/api/content/[id]/route.ts"), /export const dynamic = "force-dynamic"/);
});

test("toda rota de conteudo exige sessao administrativa", () => {
  for (const route of [
    "src/app/api/content/route.ts",
    "src/app/api/content/[id]/route.ts",
    "src/app/api/content/media/route.ts",
    "src/app/api/content/publish/route.ts",
    "src/app/api/content/sync-instagram/route.ts",
  ]) {
    assert.match(source(route), /requireDemandAdminSession/, `${route} sem guarda de sessao`);
  }
});

test("falha de publicacao vira estado no banco, nao so mensagem na tela", () => {
  const publish = source("src/app/api/content/publish/route.ts");
  assert.match(publish, /markContentFailed/);
  assert.match(publish, /markContentPublished/);
});

test("Story nao leva caption e video espera o container ficar pronto", () => {
  const graph = source("src/lib/instagramGraph.ts");
  assert.match(graph, /type !== "Story"/);
  assert.match(graph, /STORIES/);
  assert.match(graph, /FINISHED/);
  assert.match(graph, /media_publish/);
});

test("conteudo virou sub-aba de cada canal e a rota antiga redireciona", () => {
  assert.match(source("src/app/conteudo/page.tsx"), /redirect\("\/instagram\/conteudo"\)/);
  assert.match(source("src/components/InstagramSubnav.tsx"), /\/instagram\/conteudo/);
  assert.match(source("src/components/ThreadsSubnav.tsx"), /\/threads\/conteudo/);
  assert.match(source("src/app/instagram/conteudo/page.tsx"), /channel="instagram"/);
  assert.match(source("src/app/threads/conteudo/page.tsx"), /channel="threads"/);

  // O item de nav sai do sidebar mas continua resolvendo link velho.
  const nav = source("src/lib/navigation.ts");
  assert.match(nav, /module: "conteudo".*sidebar: false/);
});

test("a prospeccao por Instagram saiu da interface", () => {
  assert.equal(exists("src/app/instagram/InstagramProspecting.tsx"), false);
  assert.equal(exists("src/app/instagram/InstagramFollowups.tsx"), false);
  assert.equal(exists("src/app/api/prospecting"), false);

  const page = source("src/app/instagram/page.tsx");
  assert.doesNotMatch(page, /InstagramProspecting|InstagramFollowups/);
  assert.doesNotMatch(page, /ig-tabs/);

  // As libs continuam de pe: os scripts de terminal ainda dependem delas.
  assert.equal(exists("src/lib/prospectingRecords.ts"), true);
  assert.equal(exists("src/lib/prospectingApi.ts"), true);
});

test("subnav aninhada acende so a aba mais especifica", () => {
  // Com /instagram e /instagram/conteudo, o startsWith sozinho acendia as duas.
  assert.match(source("src/components/Subnav.tsx"), /sort\(\(a, b\) => b\.href\.length - a\.href\.length\)/);
});

test("o backlog editorial chega ao contexto da IA", () => {
  const broker = source("src/lib/aiContextBroker.ts");
  assert.match(broker, /content_items/);
  assert.match(broker, /crm\.conteudo/);
  assert.match(broker, /editorial: editorialProvider/);
});
