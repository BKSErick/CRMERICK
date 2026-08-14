import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/transcribeAudio";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { ok: false, error: "Nenhum arquivo enviado no campo 'file'." },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await transcribeAudio(buffer, { filename: file.name });

      if (!result) {
        return NextResponse.json(
          { ok: false, error: "Falha ao transcrever o áudio fornecido." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        text: result.text,
        provider: result.provider,
        model: result.model,
      });
    }

    const body = await request.json().catch(() => ({}));
    const audioUrl = typeof body?.audioUrl === "string" ? body.audioUrl.trim() : "";
    const base64 = typeof body?.base64 === "string" ? body.base64.trim() : "";
    const filename = typeof body?.filename === "string" ? body.filename.trim() : "audio.ogg";

    if (audioUrl) {
      const result = await transcribeAudio(audioUrl, { filename });
      if (!result) {
        return NextResponse.json(
          { ok: false, error: "Falha ao baixar ou transcrever áudio da URL." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        text: result.text,
        provider: result.provider,
        model: result.model,
      });
    }

    if (base64) {
      const cleanBase64 = base64.replace(/^data:audio\/[a-z0-9]+;base64,/i, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const result = await transcribeAudio(buffer, { filename });

      if (!result) {
        return NextResponse.json(
          { ok: false, error: "Falha ao transcrever áudio base64." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        text: result.text,
        provider: result.provider,
        model: result.model,
      });
    }

    return NextResponse.json(
      { ok: false, error: "Forneça 'file' em formData, 'audioUrl' ou 'base64' no JSON." },
      { status: 400 },
    );
  } catch (error) {
    console.error("Erro na rota /api/ai/transcribe:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno ao processar áudio.",
      },
      { status: 500 },
    );
  }
}
