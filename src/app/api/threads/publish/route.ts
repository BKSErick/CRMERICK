import { NextResponse } from "next/server";
import { loadStoredToken, refreshIfNeeded, THREADS_API } from "@/lib/threads";

const LIMITE_CARACTERES = 500;

// Publica um post de texto no Threads. Duas etapas obrigatorias na API:
// 1) cria o container (media_type=TEXT) 2) publica o container (threads_publish).
// Acao IRREVERSIVEL e publica: a tela pede confirmacao antes de chamar aqui.
export async function POST(request: Request) {
  let corpo: { text?: string };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo invalido." }, { status: 400 });
  }

  const texto = (corpo.text ?? "").trim();
  if (!texto) {
    return NextResponse.json({ ok: false, error: "Texto vazio." }, { status: 400 });
  }
  if (texto.length > LIMITE_CARACTERES) {
    return NextResponse.json(
      { ok: false, error: `O Threads aceita ate ${LIMITE_CARACTERES} caracteres (esse tem ${texto.length}).` },
      { status: 400 },
    );
  }

  const guardado = await loadStoredToken();
  if (!guardado) {
    return NextResponse.json({ ok: false, error: "Threads nao conectado." }, { status: 401 });
  }
  const { accessToken } = await refreshIfNeeded(guardado);

  try {
    const criarUrl = new URL(`${THREADS_API}/me/threads`);
    criarUrl.searchParams.set("media_type", "TEXT");
    criarUrl.searchParams.set("text", texto);
    criarUrl.searchParams.set("access_token", accessToken);
    const criarRes = await fetch(criarUrl, { method: "POST" });
    const criar = await criarRes.json();
    if (!criarRes.ok || !criar.id) {
      return NextResponse.json(
        { ok: false, error: criar?.error?.message ?? "Falha ao criar o post." },
        { status: criarRes.status },
      );
    }

    const publicar = async () => {
      const u = new URL(`${THREADS_API}/me/threads_publish`);
      u.searchParams.set("creation_id", String(criar.id));
      u.searchParams.set("access_token", accessToken);
      const res = await fetch(u, { method: "POST" });
      return { res, json: await res.json() };
    };

    // O container pode levar alguns segundos para ficar pronto; uma retentativa resolve.
    let { res: pubRes, json: pub } = await publicar();
    if (!pubRes.ok || !pub.id) {
      await new Promise((r) => setTimeout(r, 4000));
      ({ res: pubRes, json: pub } = await publicar());
    }
    if (!pubRes.ok || !pub.id) {
      return NextResponse.json(
        { ok: false, error: pub?.error?.message ?? "Falha ao publicar." },
        { status: pubRes.status },
      );
    }

    let permalink: string | null = null;
    try {
      const u = new URL(`${THREADS_API}/${pub.id}`);
      u.searchParams.set("fields", "permalink");
      u.searchParams.set("access_token", accessToken);
      permalink = (await (await fetch(u)).json())?.permalink ?? null;
    } catch {
      permalink = null;
    }

    return NextResponse.json({ ok: true, id: pub.id, permalink });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro inesperado ao publicar.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}