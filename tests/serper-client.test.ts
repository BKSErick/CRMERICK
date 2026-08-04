import assert from "node:assert/strict";
import test from "node:test";

import { createSerperClient, parseSerperKeys } from "../src/lib/serper.ts";

test("parseia e deduplica chaves sem aceitar vazios", () => {
  assert.deepEqual(parseSerperKeys(" key-a, key-b, key-a,  "), ["key-a", "key-b"]);
});

test("rotaciona chave recusada e retorna resultado sem expor credencial", async () => {
  const seenKeys: string[] = [];
  const client = createSerperClient({
    keys: ["secret-a", "secret-b"],
    fetchImpl: async (_url, init) => {
      const key = String((init?.headers as Record<string, string>)["X-API-KEY"]);
      seenKeys.push(key);
      if (key === "secret-a") {
        return new Response(JSON.stringify({ message: "Unauthorized." }), { status: 401 });
      }
      return new Response(JSON.stringify({ places: [{ title: "Clinica Sorriso" }] }), { status: 200 });
    },
  });

  const result = await client.maps({ q: "clinica odontologica em Contagem MG", num: 20 });
  assert.deepEqual(seenKeys, ["secret-a", "secret-b"]);
  assert.deepEqual(result, { places: [{ title: "Clinica Sorriso" }] });
  assert.doesNotMatch(JSON.stringify(result), /secret-a|secret-b/);
});

test("falha claramente sem configurar chave", async () => {
  const client = createSerperClient({ keys: [], fetchImpl: fetch });
  await assert.rejects(() => client.search({ q: "site:instagram.com clinica" }), /SERPER_API_KEYS/);
});
