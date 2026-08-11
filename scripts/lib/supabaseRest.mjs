export async function fetchAllPages(request, route, options = {}) {
  const pageSize = Number(options.pageSize ?? 1000);
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("pageSize deve ser um inteiro positivo.");
  }

  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const response = await request(route, {
      headers: {
        ...(options.headers ?? {}),
        Range: `${start}-${start + pageSize - 1}`,
        "Range-Unit": "items",
      },
    });
    if (!response.ok) {
      const detail = typeof response.text === "function" ? await response.text() : "";
      throw new Error(`Supabase ${route}: HTTP ${response.status ?? "desconhecido"}${detail ? ` - ${detail.slice(0, 200)}` : ""}`);
    }
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`Supabase ${route}: resposta nao e uma lista.`);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
