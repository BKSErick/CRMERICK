import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { discoverFreeModels, getProviderModels, markModelDead, rankModels, resetCatalogCache } from "../src/lib/aiModelCatalog.mjs";

// O catalogo e a peca que substitui a lista fixa de modelos. O que precisa ser verdade:
// (1) modelo que nao serve pra chat nunca entra; (2) modelo vivo desconhecido NUNCA e
// descartado, so vai pro fim da fila; (3) descoberta quebrada nao deixa o CRM sem modelo.

beforeEach(() => resetCatalogCache());

function comFetch(responder: (url: string) => Response, fn: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => responder(String(input))) as unknown as typeof globalThis.fetch;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("rankModels descarta o que nao e modelo de conversa", () => {
  const fila = rankModels("Groq", [
    { id: "whisper-large-v3", contextLength: 448, tierEstavel: true },
    { id: "meta-llama/llama-prompt-guard-2-86m", contextLength: 512, tierEstavel: true },
    { id: "canopylabs/orpheus-v1-english", contextLength: 4000, tierEstavel: true },
    { id: "openai/gpt-oss-safeguard-20b", contextLength: 131072, tierEstavel: true },
    { id: "openai/gpt-oss-120b", contextLength: 131072, tierEstavel: true },
  ]);

  assert.deepEqual(fila, ["openai/gpt-oss-120b"]);
});

test("modelo vivo sem preferencia casada vai pro fim da fila, nunca some", () => {
  const fila = rankModels("Groq", [
    { id: "fabricante/modelo-que-nao-existia-ainda", contextLength: 131072, tierEstavel: true },
    { id: "openai/gpt-oss-120b", contextLength: 131072, tierEstavel: true },
  ]);

  assert.deepEqual(fila, ["openai/gpt-oss-120b", "fabricante/modelo-que-nao-existia-ainda"]);
});

test("mesmo sem NENHUMA preferencia casada a fila continua utilizavel", () => {
  // Cenario real: em 25/08/2026 nenhuma das familias fixadas no codigo em 2026-07 existia
  // mais. Se preferencia desatualizada zerasse a fila, o CRM ficaria sem IA.
  const fila = rankModels("Groq", [
    { id: "marca-x/modelo-1", contextLength: 131072, tierEstavel: true },
    { id: "marca-y/modelo-2", contextLength: 200000, tierEstavel: true },
  ]);

  assert.equal(fila.length, 2);
});

test("modelo furtivo (preco zero sem :free) fica atras do free estavel", () => {
  const fila = rankModels("OpenRouter", [
    { id: "stealth/ox-alpha", contextLength: 1048576, tierEstavel: false },
    { id: "marca/modelo:free", contextLength: 131072, tierEstavel: true },
  ]);

  assert.deepEqual(fila, ["marca/modelo:free", "stealth/ox-alpha"]);
});

test("discoverFreeModels le o catalogo do OpenRouter e exclui saida nao-textual", async () => {
  await comFetch(
    () =>
      json({
        data: [
          { id: "marca/pago", context_length: 131072, pricing: { prompt: "0.5", completion: "1" }, architecture: { output_modalities: ["text"] } },
          { id: "marca/free:free", context_length: 131072, pricing: { prompt: "0", completion: "0" }, architecture: { output_modalities: ["text"] } },
          { id: "marca/musica", context_length: 131072, pricing: { prompt: "0", completion: "0" }, architecture: { output_modalities: ["text", "audio"] } },
        ],
      }),
    async () => {
      const modelos = await discoverFreeModels("OpenRouter");
      assert.deepEqual(
        modelos.map((m) => m.id),
        ["marca/free:free"],
      );
    },
  );
});

test("discoverFreeModels ignora modelo inativo da Groq", async () => {
  await comFetch(
    () => json({ data: [{ id: "groq/vivo", active: true, context_window: 131072 }, { id: "groq/desativado", active: false, context_window: 131072 }] }),
    async () => {
      const modelos = await discoverFreeModels("Groq", "chave");
      assert.deepEqual(
        modelos.map((m) => m.id),
        ["groq/vivo"],
      );
    },
  );
});

test("descoberta fora do ar cai na lista-semente em vez de ficar sem modelo", async () => {
  await comFetch(
    () => new Response("indisponivel", { status: 503 }),
    async () => {
      const fila = await getProviderModels("Groq", "chave");
      assert.ok(fila.length > 0, "precisa sobrar alguma opcao mesmo com o catalogo fora do ar");
    },
  );
});

test("markModelDead tira o modelo da fila mesmo depois de redescobrir o catalogo", async () => {
  await comFetch(
    () => json({ data: [{ id: "groq/morto", active: true, context_window: 131072 }, { id: "groq/vivo", active: true, context_window: 131072 }] }),
    async () => {
      const antes = await getProviderModels("Groq", "chave");
      assert.ok(antes.includes("groq/morto"));

      markModelDead("Groq", "groq/morto");

      const depois = await getProviderModels("Groq", "chave");
      assert.equal(depois.includes("groq/morto"), false);
      assert.ok(depois.includes("groq/vivo"));
    },
  );
});

test("override por env vence a descoberta", async () => {
  const original = process.env.AI_GROQ_MODELS;
  process.env.AI_GROQ_MODELS = "meu/modelo-fixo, outro/modelo";
  try {
    await comFetch(
      () => json({ data: [{ id: "groq/descoberto", active: true, context_window: 131072 }] }),
      async () => {
        const fila = await getProviderModels("Groq", "chave");
        assert.deepEqual(fila, ["meu/modelo-fixo", "outro/modelo"]);
      },
    );
  } finally {
    if (original === undefined) delete process.env.AI_GROQ_MODELS;
    else process.env.AI_GROQ_MODELS = original;
  }
});
