import { NextRequest, NextResponse } from "next/server";

import { createEmailConversationRepository } from "@/lib/brevoConversationRepository";
import { ingestEmailConversation } from "@/lib/brevoConversationService";
import { isValidBrevoWebhookSecret } from "@/lib/brevoConversations";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { normalizeGmailAppsScriptPayload } from "@/lib/gmailAppsScript";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_PAYLOAD_BYTES = 1_000_000;
const PROVIDER = "gmail_apps_script";

function bearerSecret(request: NextRequest): string {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.BREVO_CONVERSATIONS_WEBHOOK_SECRET?.trim() ?? "";
  if (!expectedSecret) {
    console.error("Segredo de ingestao de e-mail nao configurado no servidor.");
    return NextResponse.json({ ok: false, error: "Webhook indisponivel." }, { status: 503 });
  }
  if (!isValidBrevoWebhookSecret(bearerSecret(request), expectedSecret)) {
    return NextResponse.json({ ok: false, error: "Nao autorizado." }, { status: 401 });
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: "Payload excede o limite." }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: "Payload excede o limite." }, { status: 413 });
  }

  let normalized;
  try {
    normalized = normalizeGmailAppsScriptPayload(JSON.parse(rawBody));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof SyntaxError ? "JSON invalido." : "Payload Gmail invalido." },
      { status: 400 },
    );
  }
  if (!normalized) return NextResponse.json({ ok: true, ignored: true }, { status: 202 });

  try {
    const repository = createEmailConversationRepository(getCrmSupabaseAdmin(), PROVIDER);
    const result = await ingestEmailConversation(repository, normalized);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Falha ao processar sincronizacao Gmail:", error);
    return NextResponse.json(
      { ok: false, error: "Falha ao processar webhook." },
      { status: 500 },
    );
  }
}
