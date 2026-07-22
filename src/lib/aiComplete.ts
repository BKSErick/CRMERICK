// Completador de IA compartilhado: mesma cascata de provedores/free models usada em
// /api/ai, extraída para outras rotas (ex: busca em linguagem natural) reusarem sem
// duplicar a lógica de fallback.

const PROVIDERS = [
  {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    getKey: () => process.env.OPENROUTER_API_KEY,
    models: ["google/gemini-2.5-flash:free", "meta-llama/llama-3-8b-instruct:free", "qwen/qwen-2-7b-instruct:free"],
    getHeaders: (key: string) => ({
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://crmerick.vercel.app",
      "X-Title": "CRM Erick",
    }),
  },
  {
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    getKey: () => process.env.GROQ_API_KEY,
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    getHeaders: (key: string) => ({ Authorization: `Bearer ${key}`, "Content-Type": "application/json" }),
  },
];

export type AiResult = { content: string; provider: string; model: string } | null;

export async function aiComplete(systemPrompt: string, userPrompt: string): Promise<AiResult> {
  for (const provider of PROVIDERS) {
    const key = provider.getKey();
    if (!key) continue;

    for (const model of provider.models) {
      try {
        const response = await fetch(provider.url, {
          method: "POST",
          headers: provider.getHeaders(key),
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });
        if (!response.ok) continue;
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content) return { content: String(content).trim(), provider: provider.name, model };
      } catch {
        // tenta o próximo modelo/provedor
      }
    }
  }
  return null;
}
