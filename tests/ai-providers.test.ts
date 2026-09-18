import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { resetCatalogCache } from "../src/lib/aiModelCatalog.mjs";
import {
  aiComplete,
  aiCompleteDetailed,
  classifyProviderFailure,
  describeFailures,
  extractRejectedParams,
} from "../src/lib/aiProviders.mjs";

// Este teste NAO fixa nome de modelo de proposito. A versao anterior assertava
// `qwen/qwen3.6-27b` literal, e quando o modelo foi descontinuado o teste virou mais um lugar
// pra editar na mao. O que importa e o COMPORTAMENTO da cascata.

type Chamada = { url: string; metodo: string; body: Record<string, unknown> };

function catalogoOpenRouter(ids: string[]) {
  return {
    data: ids.map((id) => ({
      id,
      context_length: 131072,
      pricing: { prompt: "0", completion: "0" },
      architecture: { output_modalities: ["text"] },
    })),
  };
}

function catalogoGroq(ids: string[]) {
  return { data: ids.map((id) => ({ id, active: true, context_window: 131072 })) };
}

/** Stub de fetch que atende catalogo e chat, e registra o que foi chamado. */
function montarFetch(opcoes: {
  openRouterModels?: string[];
  groqModels?: string[];
  responderChat: (chamada: Chamada) => Response;
}) {
  const chamadas: Chamada[] = [];
  const stub = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const metodo = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const chamada = { url, metodo, body };

    if (url.endsWith("/models")) {
      const payload = url.includes("openrouter.ai")
        ? catalogoOpenRouter(opcoes.openRouterModels ?? ["fornecedor/modelo-a:free"])
        : catalogoGroq(opcoes.groqModels ?? ["fornecedor/modelo-g"]);
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    chamadas.push(chamada);
    return opcoes.responderChat(chamada);
  };
  return { chamadas, stub: stub as unknown as typeof globalThis.fetch };
}

function respostaOk(texto: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content: texto } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function comAmbiente(fn: () => Promise<void>) {
  const fetchOriginal = globalThis.fetch;
  const openRouterOriginal = process.env.OPENROUTER_API_KEY;
  const groqOriginal = process.env.GROQ_API_KEY;
  const overrideOr = process.env.AI_OPENROUTER_MODELS;
  const overrideGroq = process.env.AI_GROQ_MODELS;
  process.env.OPENROUTER_API_KEY = "openrouter-test";
  process.env.GROQ_API_KEY = "groq-test";
  delete process.env.AI_OPENROUTER_MODELS;
  delete process.env.AI_GROQ_MODELS;
  try {
    await fn();
  } finally {
    globalThis.fetch = fetchOriginal;
    if (openRouterOriginal === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = openRouterOriginal;
    if (groqOriginal === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = groqOriginal;
    if (overrideOr !== undefined) process.env.AI_OPENROUTER_MODELS = overrideOr;
    if (overrideGroq !== undefined) process.env.AI_GROQ_MODELS = overrideGroq;
  }
}

beforeEach(() => resetCatalogCache());

test("chave invalida pula o provedor inteiro e a resposta vem do proximo", async () => {
  await comAmbiente(async () => {
    const { chamadas, stub } = montarFetch({
      openRouterModels: ["fornecedor/a:free", "fornecedor/b:free", "fornecedor/c:free"],
      groqModels: ["groq/modelo"],
      responderChat: (chamada) =>
        chamada.url.includes("openrouter.ai")
          ? new Response(JSON.stringify({ error: { message: "invalid" } }), { status: 401 })
          : respostaOk("Resposta final"),
    });
    globalThis.fetch = stub;

    const resultado = await aiComplete("sistema", "pergunta", { timeoutMs: 5000 });

    assert.equal(resultado?.content, "Resposta final");
    assert.equal(resultado?.provider, "Groq");
    assert.equal(
      chamadas.filter((c) => c.url.includes("openrouter.ai")).length,
      1,
      "erro de autenticacao deve pular os demais modelos do provedor",
    );
  });
});

test("modelo descontinuado sai de circulacao e a chamada seguinte ja nasce curada", async () => {
  await comAmbiente(async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { chamadas, stub } = montarFetch({
      groqModels: ["groq/morto", "groq/vivo"],
      responderChat: (chamada) =>
        chamada.body.model === "groq/morto"
          ? new Response(JSON.stringify({ error: { message: "The model `groq/morto` does not exist" } }), { status: 404 })
          : respostaOk("ok"),
    });
    globalThis.fetch = stub;

    const primeira = await aiComplete("sistema", "pergunta");
    assert.equal(primeira?.model, "groq/vivo", "deve cair no proximo modelo vivo");

    const antes = chamadas.length;
    const segunda = await aiComplete("sistema", "outra pergunta");

    assert.equal(segunda?.model, "groq/vivo");
    assert.equal(
      chamadas.slice(antes).some((c) => c.body.model === "groq/morto"),
      false,
      "o modelo descontinuado nao pode ser tentado de novo",
    );
  });
});

test("parametro recusado e aprendido: a chamada seguinte ja vai sem ele", async () => {
  await comAmbiente(async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { chamadas, stub } = montarFetch({
      groqModels: ["groq/qwen3-teste"],
      responderChat: (chamada) =>
        "reasoning_format" in chamada.body
          ? new Response(
              JSON.stringify({ error: { message: "`reasoning_format` is not supported with this model", param: "reasoning_format" } }),
              { status: 400 },
            )
          : respostaOk("ok"),
    });
    globalThis.fetch = stub;

    const primeira = await aiComplete("sistema", "pergunta");
    assert.equal(primeira?.content, "ok", "deve reenviar sem o parametro recusado");
    assert.equal(chamadas.length, 2, "uma tentativa com o parametro e uma sem");

    const segunda = await aiComplete("sistema", "outra");
    assert.equal(segunda?.content, "ok");
    assert.equal(chamadas.length, 3, "aprendeu: nao repete a tentativa que ja falhou");
    assert.equal("reasoning_format" in chamadas[2].body, false);
  });
});

test("opcoes por chamada chegam no payload", async () => {
  await comAmbiente(async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { chamadas, stub } = montarFetch({
      groqModels: ["groq/modelo"],
      responderChat: () => respostaOk('{"ok":true}'),
    });
    globalThis.fetch = stub;

    await aiComplete("sistema", "pergunta", {
      requestOptions: { temperature: 0.1, response_format: { type: "json_object" } },
    });

    assert.equal(chamadas[0].body.temperature, 0.1);
    assert.deepEqual(chamadas[0].body.response_format, { type: "json_object" });
  });
});

test("modelo OpenRouter fixo pago e bloqueado antes do fetch de chat", async () => {
  await comAmbiente(async () => {
    const { chamadas, stub } = montarFetch({
      openRouterModels: ["fornecedor/free:free"],
      responderChat: () => respostaOk("nao deveria chamar"),
    });
    globalThis.fetch = stub;

    const resultado = await aiCompleteDetailed("sistema", "pergunta", {
      modelPreference: { mode: "fixed", provider: "OpenRouter", modelId: "fornecedor/pago" },
    });

    assert.equal(resultado.result, null);
    assert.equal(chamadas.length, 0, "a unica chamada permitida e a descoberta GET /models");
    assert.equal(resultado.failures[0].reason, "model_not_free");
  });
});

test("modelo fixo gratuito nao troca silenciosamente e devolve usage", async () => {
  await comAmbiente(async () => {
    const { chamadas, stub } = montarFetch({
      openRouterModels: ["fornecedor/a:free", "fornecedor/b:free"],
      responderChat: (chamada) =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: `usou ${chamada.body.model}` } }],
            usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });
    globalThis.fetch = stub;

    const resultado = await aiCompleteDetailed("sistema", "pergunta", {
      modelPreference: { mode: "fixed", provider: "OpenRouter", modelId: "fornecedor/b:free" },
    });

    assert.equal(resultado.result?.model, "fornecedor/b:free");
    assert.deepEqual(resultado.result?.usage, { inputTokens: 12, outputTokens: 7, totalTokens: 19 });
    assert.deepEqual(chamadas.map((item) => item.body.model), ["fornecedor/b:free"]);
    assert.equal(resultado.attempts.length, 1);
    assert.equal(resultado.attempts[0].status, "success");
    assert.equal("detail" in resultado.attempts[0], false);
  });
});

test("modo freeOnly nunca cai para provedor sem prova de preco zero", async () => {
  await comAmbiente(async () => {
    const { chamadas, stub } = montarFetch({
      openRouterModels: ["fornecedor/a:free"],
      groqModels: ["groq/modelo"],
      responderChat: (chamada) => chamada.url.includes("openrouter.ai")
        ? new Response("rate limit", { status: 429 })
        : respostaOk("fallback que poderia cobrar"),
    });
    globalThis.fetch = stub;

    const resultado = await aiCompleteDetailed("sistema", "pergunta", { freeOnly: true });

    assert.equal(resultado.result, null);
    assert.equal(chamadas.some((item) => item.url.includes("api.groq.com")), false);
  });
});

test("sem nenhum modelo respondendo, a falha vem classificada e legivel", async () => {
  await comAmbiente(async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { stub } = montarFetch({
      groqModels: ["groq/a", "groq/b"],
      responderChat: () => new Response(JSON.stringify({ error: { message: "rate limit reached" } }), { status: 429 }),
    });
    globalThis.fetch = stub;

    const { result, failures } = await aiCompleteDetailed("sistema", "pergunta");

    assert.equal(result, null);
    assert.ok(failures.filter((f) => f.provider === "Groq").every((f) => f.reason === "rate_limited"));
    assert.match(describeFailures(failures), /Limite de uso/i);
  });
});

test("classifyProviderFailure separa as causas que antes viravam o mesmo erro generico", () => {
  assert.equal(classifyProviderFailure(401, ""), "invalid_key");
  assert.equal(classifyProviderFailure(403, ""), "invalid_key");
  assert.equal(classifyProviderFailure(402, ""), "no_credit");
  assert.equal(classifyProviderFailure(429, "rate limit"), "rate_limited");
  assert.equal(classifyProviderFailure(404, ""), "model_gone");
  assert.equal(classifyProviderFailure(400, "The model `x` does not exist"), "model_gone");
  assert.equal(classifyProviderFailure(400, "model_decommissioned"), "model_gone");
  assert.equal(classifyProviderFailure(400, "`temperature` must be a number"), "bad_request");
  assert.equal(classifyProviderFailure(503, ""), "provider_error");
});

test("extractRejectedParams so devolve parametro que foi realmente enviado", () => {
  const enviados = ["reasoning_format", "temperature"];
  assert.deepEqual(
    extractRejectedParams('{"error":{"message":"`reasoning_format` is not supported","param":"reasoning_format"}}', enviados),
    ["reasoning_format"],
  );
  assert.deepEqual(extractRejectedParams("`max_tokens` invalido", enviados), []);
});

test("sem chave nenhuma, a mensagem diz exatamente o que configurar", async () => {
  await comAmbiente(async () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GROQ_API_KEY;
    const { result, failures } = await aiCompleteDetailed("sistema", "pergunta");
    assert.equal(result, null);
    assert.match(describeFailures(failures), /OPENROUTER_API_KEY ou GROQ_API_KEY/);
  });
});
