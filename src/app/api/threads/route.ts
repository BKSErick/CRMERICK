import { NextResponse } from "next/server";
import {
  buildAuthorizeUrl,
  loadStoredToken,
  refreshIfNeeded,
  sumThreadsInsights,
  THREADS_API,
} from "@/lib/threads";

// Dados REAIS do Threads (graph.threads.net). Sem token gravado, a rota devolve o link
// de autorizacao em vez de inventar numero — mesma regra do Instagram: nada de mock.
export async function GET() {
  let token;
  try {
    token = await loadStoredToken();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Falha ao ler o token do Threads.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  if (!token) {
    let authUrl: string | null = null;
    try {
      authUrl = buildAuthorizeUrl();
    } catch {
      authUrl = null;
    }
    return NextResponse.json(
      {
        ok: false,
        needsAuth: true,
        authUrl,
        error: "Threads ainda nao autorizado. Conecte a conta para puxar os dados.",
      },
      { status: 200 },
    );
  }

  const { accessToken, accountId } = await refreshIfNeeded(token);
  const agora = Math.floor(Date.now() / 1000);
  const desde = agora - 30 * 86400;

  const perfilUrl = new URL(`${THREADS_API}/me`);
  perfilUrl.searchParams.set(
    "fields",
    "id,username,name,threads_profile_picture_url,threads_biography",
  );
  perfilUrl.searchParams.set("access_token", accessToken);

  const postsUrl = new URL(`${THREADS_API}/me/threads`);
  postsUrl.searchParams.set(
    "fields",
    "id,media_type,media_product_type,text,permalink,timestamp,is_quote_post",
  );
  postsUrl.searchParams.set("limit", "15");
  postsUrl.searchParams.set("access_token", accessToken);

  // Metricas da conta em 30 dias. followers_count e lifetime, por isso vai separado.
  const contaUrl = new URL(`${THREADS_API}/${accountId}/threads_insights`);
  contaUrl.searchParams.set("metric", "views,likes,replies,reposts,quotes");
  contaUrl.searchParams.set("since", String(desde));
  contaUrl.searchParams.set("until", String(agora));
  contaUrl.searchParams.set("access_token", accessToken);

  const seguidoresUrl = new URL(`${THREADS_API}/${accountId}/threads_insights`);
  seguidoresUrl.searchParams.set("metric", "followers_count");
  seguidoresUrl.searchParams.set("access_token", accessToken);

  try {
    const [perfilRes, postsRes, contaRes, seguidoresRes] = await Promise.all([
      fetch(perfilUrl),
      fetch(postsUrl),
      fetch(contaUrl),
      fetch(seguidoresUrl),
    ]);
    const [perfil, posts, conta, seguidores] = await Promise.all([
      perfilRes.json(),
      postsRes.json(),
      contaRes.json(),
      seguidoresRes.json(),
    ]);

    if (!perfilRes.ok || perfil.error) {
      const msg = perfil.error?.message ?? "Requisicao de perfil do Threads falhou.";
      const expirou = /expired|invalid|session/i.test(msg);
      return NextResponse.json(
        {
          ok: false,
          needsAuth: expirou,
          authUrl: expirou ? buildAuthorizeUrl() : null,
          error: msg,
        },
        { status: expirou ? 200 : perfilRes.status },
      );
    }

    const contaMetricas = sumThreadsInsights(conta.data);
    const seguidoresMetrica = sumThreadsInsights(seguidores.data);

    // Insights por post: views, likes, replies, reposts, quotes, shares.
    const brutos = (posts.data ?? []).slice(0, 15);
    const enriquecidos = await Promise.all(
      brutos.map(async (post: Record<string, unknown>) => {
        try {
          const insightsUrl = new URL(`${THREADS_API}/${post.id}/insights`);
          insightsUrl.searchParams.set("metric", "views,likes,replies,reposts,quotes,shares");
          insightsUrl.searchParams.set("access_token", accessToken);
          const json = await (await fetch(insightsUrl)).json();
          const v = sumThreadsInsights(json.data);
          return {
            ...post,
            views: v.views ?? 0,
            likes: v.likes ?? 0,
            replies: v.replies ?? 0,
            reposts: v.reposts ?? 0,
            quotes: v.quotes ?? 0,
            shares: v.shares ?? 0,
          };
        } catch {
          return { ...post, views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0 };
        }
      }),
    );

    return NextResponse.json({
      ok: true,
      profile: {
        id: perfil.id,
        username: perfil.username,
        name: perfil.name ?? null,
        biography: perfil.threads_biography ?? null,
        profilePictureUrl: perfil.threads_profile_picture_url ?? null,
        followers: seguidoresMetrica.followers_count ?? 0,
      },
      metrics: {
        views30: contaMetricas.views ?? 0,
        likes30: contaMetricas.likes ?? 0,
        replies30: contaMetricas.replies ?? 0,
        reposts30: contaMetricas.reposts ?? 0,
        quotes30: contaMetricas.quotes ?? 0,
      },
      posts: enriquecidos,
      tokenExpiresAt: token.expiresAt,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro inesperado na API do Threads.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}