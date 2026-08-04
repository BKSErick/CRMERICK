type SerperRequest = Record<string, unknown> & { q: string };
type SerperResponse = Record<string, unknown> & { error?: string; message?: string };

export function parseSerperKeys(value?: string | null) {
  return [...new Set((value ?? "").split(",").map((key) => key.trim()).filter(Boolean))];
}

export function createSerperClient(options?: {
  keys?: readonly string[];
  fetchImpl?: typeof fetch;
}) {
  const keys = [...(options?.keys ?? parseSerperKeys(process.env.SERPER_API_KEYS ?? process.env.SERPER_API_KEY))];
  const fetchImpl = options?.fetchImpl ?? fetch;
  let currentKey = 0;

  async function request(endpoint: "maps" | "search", body: SerperRequest) {
    if (!keys.length) {
      throw new Error("SERPER_API_KEYS precisa estar configurada no servidor do CRM.");
    }

    let lastStatus = 500;
    for (let attempt = 0; attempt < keys.length; attempt += 1) {
      const index = (currentKey + attempt) % keys.length;
      const response = await fetchImpl(`https://google.serper.dev/${endpoint}`, {
        method: "POST",
        headers: { "X-API-KEY": keys[index], "Content-Type": "application/json" },
        body: JSON.stringify({ gl: "br", hl: "pt-br", ...body }),
      });
      lastStatus = response.status;
      const payload = await response.json() as SerperResponse;
      if (response.ok && !payload.error && payload.message !== "Unauthorized.") {
        currentKey = index;
        return payload;
      }
    }

    throw new Error(`Serper indisponivel depois de tentar as chaves configuradas (HTTP ${lastStatus}).`);
  }

  return {
    maps: (body: SerperRequest) => request("maps", body),
    search: (body: SerperRequest) => request("search", body),
  };
}

export const serper = createSerperClient();
