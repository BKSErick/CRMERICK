import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_MAX_DEMAND_ATTACHMENT_BYTES,
  DEMAND_ATTACHMENTS_BUCKET,
  demandStoragePath,
  validateDemandAttachment,
} from "@/lib/clientDemands";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { requireDemandAdminSession } from "@/lib/demandAuth";
import { appendDemandEvent, assertDemandWritable, demandErrorResponse, demandId } from "@/lib/demandServer";

export const runtime = "nodejs";

function configuredMaxBytes() {
  const value = Number(process.env.CRM_DEMAND_ATTACHMENT_MAX_BYTES);
  return Number.isInteger(value) && value > 0 ? Math.min(value, DEFAULT_MAX_DEMAND_ATTACHMENT_BYTES) : DEFAULT_MAX_DEMAND_ATTACHMENT_BYTES;
}

export async function GET(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const id = demandId(request.nextUrl.searchParams.get("id"));
    if (!id) throw new Error("id do anexo e obrigatorio.");
    const current = await supabase.from("client_demand_attachments").select("id, file_name, storage_path").eq("id", id).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return demandErrorResponse(new Error("Anexo nao encontrado."), 404);
    const signed = await supabase.storage.from(DEMAND_ATTACHMENTS_BUCKET).createSignedUrl(current.data.storage_path, 60, { download: current.data.file_name });
    if (signed.error) throw signed.error;
    return NextResponse.json({ ok: true, signedUrl: signed.data.signedUrl, expiresIn: 60 });
  } catch (error) { return demandErrorResponse(error, 400); }
}

export async function POST(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const action = String(body?.action ?? "");
    const parentId = demandId(body?.demandId);
    if (!parentId) throw new Error("demandId valido e obrigatorio.");
    await assertDemandWritable(supabase, parentId);
    const attachment = validateDemandAttachment({
      fileName: String(body?.fileName ?? ""),
      mimeType: String(body?.mimeType ?? ""),
      sizeBytes: Number(body?.sizeBytes),
    }, configuredMaxBytes());

    if (action === "prepare-upload") {
      const storagePath = demandStoragePath(parentId, attachment.fileName, crypto.randomUUID());
      const signed = await supabase.storage.from(DEMAND_ATTACHMENTS_BUCKET).createSignedUploadUrl(storagePath);
      if (signed.error) throw signed.error;
      const storageUrl = process.env.SUPABASE_URL;
      const anonKey = process.env.SUPABASE_KEY;
      if (!storageUrl || !anonKey) throw new Error("Upload direto do Supabase nao esta configurado.");
      return NextResponse.json({
        ok: true,
        upload: { path: signed.data.path, token: signed.data.token, storageUrl, anonKey },
      });
    }

    if (action === "confirm-upload") {
      const storagePath = String(body?.storagePath ?? "");
      if (!storagePath.startsWith(`${parentId}/`) || storagePath.includes("..")) throw new Error("Caminho de anexo invalido.");
      const info = await supabase.storage.from(DEMAND_ATTACHMENTS_BUCKET).info(storagePath);
      if (info.error) throw new Error("O arquivo ainda nao foi confirmado no Storage.");
      const actualSize = Number(info.data.size ?? attachment.sizeBytes);
      const actualMime = String(info.data.contentType ?? info.data.metadata?.mimetype ?? "").toLowerCase();
      if (actualSize !== attachment.sizeBytes || actualSize > configuredMaxBytes()) {
        await supabase.storage.from(DEMAND_ATTACHMENTS_BUCKET).remove([storagePath]);
        throw new Error("Tamanho do arquivo diverge do upload preparado.");
      }
      if (actualMime && actualMime !== attachment.mimeType) {
        await supabase.storage.from(DEMAND_ATTACHMENTS_BUCKET).remove([storagePath]);
        throw new Error("Tipo do arquivo diverge do upload preparado.");
      }
      const result = await supabase.from("client_demand_attachments").insert({
        demand_id: parentId,
        file_name: attachment.fileName,
        storage_path: storagePath,
        mime_type: attachment.mimeType,
        size_bytes: attachment.sizeBytes,
      }).select("*").single();
      if (result.error) throw result.error;
      await appendDemandEvent(supabase, { demandId: parentId, actor: auth.session.email, eventType: "attachment_added", description: `Anexo adicionado: ${attachment.fileName}.` });
      return NextResponse.json({ ok: true, attachment: result.data }, { status: 201 });
    }

    throw new Error("Acao de anexo invalida.");
  } catch (error) { return demandErrorResponse(error, 400); }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const id = demandId(request.nextUrl.searchParams.get("id"));
    if (!id) throw new Error("id do anexo e obrigatorio.");
    const current = await supabase.from("client_demand_attachments").select("id, demand_id, file_name, storage_path").eq("id", id).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return demandErrorResponse(new Error("Anexo nao encontrado."), 404);
    await assertDemandWritable(supabase, Number(current.data.demand_id));
    const removedFile = await supabase.storage.from(DEMAND_ATTACHMENTS_BUCKET).remove([current.data.storage_path]);
    if (removedFile.error) throw removedFile.error;
    const removedRow = await supabase.from("client_demand_attachments").delete().eq("id", id);
    if (removedRow.error) throw removedRow.error;
    await appendDemandEvent(supabase, { demandId: Number(current.data.demand_id), actor: auth.session.email, eventType: "attachment_removed", description: `Anexo removido: ${String(current.data.file_name)}.` });
    return NextResponse.json({ ok: true });
  } catch (error) { return demandErrorResponse(error, 400); }
}
