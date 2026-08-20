import assert from "node:assert/strict";
import test from "node:test";

test("fallback Groq usa modelo ativo e oculta raciocinio interno", async () => {
  const originalFetch = globalThis.fetch;
  const originalOpenRouter = process.env.OPENROUTER_API_KEY;
  const originalGroq = process.env.GROQ_API_KEY;
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

  process.env.OPENROUTER_API_KEY = "openrouter-test";
  process.env.GROQ_API_KEY = "groq-test";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url, body });
    if (url.includes("openrouter.ai")) return new Response(JSON.stringify({ error: { message: "invalid" } }), { status: 401 });
    return new Response(JSON.stringify({ choices: [{ message: { content: "Resposta final" } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const { aiComplete } = await import(`../src/lib/aiProviders.mjs?test=${Date.now()}`);
    const result = await aiComplete("sistema", "pergunta", { timeoutMs: 5000 });
    const groqCall = calls.find((call) => call.url.includes("groq.com"));

    assert.equal(result?.content, "Resposta final");
    assert.equal(result?.provider, "Groq");
    assert.equal(calls.filter((call) => call.url.includes("openrouter.ai")).length, 1, "erro de autenticacao deve pular os demais modelos do provedor");
    assert.equal(groqCall?.body.model, "qwen/qwen3.6-27b");
    assert.equal(groqCall?.body.reasoning_format, "hidden");
    assert.equal(groqCall?.body.reasoning_effort, "none");
    assert.equal(groqCall?.body.max_completion_tokens, 1800);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouter;
    if (originalGroq === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroq;
  }
});
