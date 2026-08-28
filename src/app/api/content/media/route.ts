import { NextRequest, NextResponse } from "next/server";
import {
  CONTENT_MEDIA_BUCKET,
  DEFAULT_MAX_CONTENT_MEDIA_BYTES,
  contentStoragePath,
  isContentChannel,
  mediaKindFromMime,
} from "@/lib/contentItems";
import { contentErrorResponse } from "@/lib/contentItemsServer";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { requireDemandAdminSession } from "@/lib/demandAuth";

export const runtime = "nodejs";

function configuredMaxBytes() {
  const value = Number(process.env.CRM_CONTENT_MEDIA_MAX_BYTES);
  return Number.isInteger(value) && value > 0
    ? Math.min(value, DEFAULT_MAX_CONTENT_MEDIA_BYTES)
    : DEFAULT_MAX_CONTENT_MEDIA_BYTES;
}

// Upload em duas etapas, mesmo desenho de /api/demands/attachments: o navegador manda
// o arquivo direto pro Storage com uma URL assinada (nao passa pelo servidor Next), e
// depois confirma. A diferenca e que aqui o bucket e PUBLICO de proposito: a Graph API
// busca a imagem anonimamente, entao URL assinada com validade curta nao serve.
export async function POST(request: NextRequest) {
  const auth = await requireDemandAdminSession(request, "conteudo");
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const action = String(body?.action ?? "");

    if (action === "prepare-upload") {
      const channel = body?.channel;
      if (!isContentChannel(channel)) throw new Error("Canal invalido.");
      const fileName = String(body?.fileName ?? "").trim();
      if (!fileName) throw new Error("Nome do arquivo e obrigatorio.");
      const mimeType = String(body?.mimeType ?? "").trim().toLowerCase();
      const mediaKind = mediaKindFromMime(mimeType);
      if (!mediaKind) throw new Error("Envie uma imagem ou um video.");
      const sizeBytes = Number(body?.sizeBytes);
      if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) throw new Error("Tamanho do arquivo invalido.");
      if (sizeBytes > configuredMaxBytes()) {
        throw new Error(`Arquivo passa do limite de ${Math.round(configuredMaxBytes() / (1024 * 1024))} MB.`);
      }

      const storagePath = contentStoragePath(channel, fileName, crypto.randomUUID());
      const signed = await supabase.storage.from(CONTENT_MEDIA_BUCKET).createSignedUploadUrl(storagePath);
      if (signed.error) throw signed.error;
      const storageUrl = process.env.SUPABASE_URL;
      const anonKey = process.env.SUPABASE_KEY;
      if (!storageUrl || !anonKey) throw new Error("Upload direto do Supabase nao esta configurado.");

      return NextResponse.json({
        ok: true,
        mediaKind,
        upload: { path: signed.data.path, token: signed.data.token, storageUrl, anonKey },
      });
    }

    if (action === "confirm-upload") {
      const storagePath = String(body?.storagePath ?? "");
      if (!storagePath || storagePath.includes("..")) throw new Error("Caminho de midia invalido.");
      const info = await supabase.storage.from(CONTENT_MEDIA_BUCKET).info(storagePath);
      if (info.error) throw new Error("O arquivo ainda nao foi confirmado no Storage.");

      const mimeType = String(info.data.contentType ?? info.data.metadata?.mimetype ?? "").toLowerCase();
      const mediaKind = mediaKindFromMime(mimeType);
      if (!mediaKind) {
        await supabase.storage.from(CONTENT_MEDIA_BUCKET).remove([storagePath]);
        throw new Error("O arquivo enviado nao e imagem nem video.");
      }
      if (Number(info.data.size ?? 0) > configuredMaxBytes()) {
        await supabase.storage.from(CONTENT_MEDIA_BUCKET).remove([storagePath]);
        throw new Error("Arquivo maior que o limite configurado.");
      }

      const publicUrl = supabase.storage.from(CONTENT_MEDIA_BUCKET).getPublicUrl(storagePath);
      return NextResponse.json({
        ok: true,
        mediaUrl: publicUrl.data.publicUrl,
        mediaPath: storagePath,
        mediaKind,
      });
    }

    throw new Error("Acao de midia invalida.");
  } catch (error) {
    return contentErrorResponse(error, 400);
  }
}
