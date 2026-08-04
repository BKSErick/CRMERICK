import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("aba de achados apenas lista leads curados fora do CRM", () => {
  const source = read("../src/app/instagram/InstagramProspecting.tsx");
  assert.match(source, /api\/prospecting/);
  assert.match(source, /Achados da busca/);
  assert.match(source, /lotes pequenos/i);
  assert.doesNotMatch(source, /value="industrial/);
  assert.doesNotMatch(source, /api\/prospecting\/search/);
  assert.doesNotMatch(source, /api\/prospecting\/import/);
});

test("fila exige confirmacao manual e registra resposta sem automacao", () => {
  const source = read("../src/app/instagram/InstagramFollowups.tsx");
  assert.match(source, /Confirmar como enviada/);
  assert.match(source, /register_reply/);
  assert.match(source, /window\.confirm/);
  assert.doesNotMatch(source, /graph\.facebook|sendMessage/i);
});

test("fila usa kanban compacto e mantem o lead selecionado durante a operacao", () => {
  const source = read("../src/app/instagram/InstagramFollowups.tsx");
  assert.match(source, /Para abordar/);
  assert.match(source, /Perfil aberto/);
  assert.match(source, /Em follow-up/);
  assert.match(source, /Respondeu/);
  assert.match(source, /Arquivados/);
  assert.match(source, /selectedDealId/);
  assert.match(source, /showArchived/);
  assert.match(source, /Buscar por clinica ou @/);
  assert.match(source, /data-deal-id/);
  assert.match(source, /scrollBy/);
  assert.doesNotMatch(source, /scrollIntoView/);
  assert.match(source, /ig-lead-panel/);
  assert.doesNotMatch(source, /ig-queue-grid/);
});
