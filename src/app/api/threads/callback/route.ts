import { NextResponse } from "next/server";
import { exchangeCodeForToken, saveToken, THREADS_API } from "@/lib/threads";

// Callback do OAuth do Threads. O usuario autoriza no threads.net e cai aqui com ?code=.
// Trocamos por token longo (60 dias) e gravamos no banco. Depois redireciona pra tela.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const erro = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (erro) {
    return NextResponse.redirect(new URL(`/threads?erro=${encodeURIComponent(erro)}`, url.origin));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/threads?erro=code_ausente", url.origin));
  }

  try {
    const { accessToken, accountId, expiresIn } = await exchangeCodeForToken(code);

    // Busca o username junto pra tela ja mostrar de qual conta e o token.
    let username: string | null = null;
    try {
      const perfilUrl = new URL(`${THREADS_API}/me`);
      perfilUrl.searchParams.set("fields", "id,username");
      perfilUrl.searchParams.set("access_token", accessToken);
      const perfil = await (await fetch(perfilUrl)).json();
      username = perfil?.username ?? null;
    } catch {
      username = null;
    }

    await saveToken({ accessToken, accountId, username, expiresIn });
    return NextResponse.redirect(new URL("/threads?conectado=1", url.origin));
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Falha ao conectar o Threads.";
    return NextResponse.redirect(new URL(`/threads?erro=${encodeURIComponent(msg)}`, url.origin));
  }
}