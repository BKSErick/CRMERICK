import { NextResponse } from "next/server";
import { loadStoredToken, refreshIfNeeded, THREADS_API } from "@/lib/threads";

// Tópicos em alta no Threads. Exige o escopo threads_keyword_search: sem ele a API
// responde code 10 ("Application does not have permission"), e a tela avisa em vez
// de mostrar lista vazia como se nao houvesse assunto em alta.
export async function GET(request: Request) {
  const country = new URL(request.url).searchParams.get("country") ?? "BR";

  const guardado = await loadStoredToken();
  if (!guardado) {
    return NextResponse.json({ ok: false, error: "Threads nao conectado." }, { status: 401 });
  }
  const { accessToken } = await refreshIfNeeded(guardado);

  try {
    const url = new URL(`${THREADS_API}/trending_topics`);
    url.searchParams.set("country_code", country);
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url);
    const json = await res.json();

    if (!res.ok || json.error) {
      const msg = json?.error?.message ?? "Falha ao buscar tópicos em alta.";
      const semPermissao = json?.error?.code === 10;
      return NextResponse.json(
        {
          ok: false,
          needsScope: semPermissao,
          error: semPermissao
            ? "Falta o escopo threads_keyword_search. Reautorize a conta para liberar os tópicos em alta."
            : msg,
        },
        { status: 200 },
      );
    }

    type TopicoBruto = { id?: string; display_name?: string; name?: string; topic?: string; post_count?: number };
    const topicos = (json.data ?? []).map((t: TopicoBruto) => ({
      id: t.id ?? null,
      nome: t.display_name ?? t.name ?? t.topic ?? "(sem nome)",
      posts: t.post_count ?? null,
    }));

    return NextResponse.json({ ok: true, country, topicos });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro inesperado ao buscar tendências.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}