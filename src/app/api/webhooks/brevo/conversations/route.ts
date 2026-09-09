import { NextRequest, NextResponse } from "next/server";

import { createBrevoConversationRepository } from "@/lib/brevoConversationRepository";
import { ingestBrevoConversation } from "@/lib/brevoConversationService";
import {
  isValidBrevoWebhookSecret,
  normalizeBrevoConversationEvent,
} from "@/lib/brevoConversations";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_PAYLOAD_BYTES = 1_000_000;

function providedSecret(request: NextRequest): string {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || request.nextUrl.searchParams.get("secret")?.trim() || "";
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.BREVO_CONVERSATIONS_WEBHOOK_SECRET?.trim() ?? "";
  if (!expectedSecret) {
    console.error("BREVO_CONVERSATIONS_WEBHOOK_SECRET nao configurado no servidor.");
    return NextResponse.json({ ok: false, error: "Webhook indisponivel." }, { status: 503 });
  }
  if (!isValidBrevoWebhookSecret(providedSecret(request), expectedSecret)) {
    return NextResponse.json({ ok: false, error: "Nao autorizado." }, { status: 401 });
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: "Payload excede o limite." }, { status: 413 });
  }

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "Payload excede o limite." }, { status: 413 });
    }
    const normalized = normalizeBrevoConversationEvent(JSON.parse(rawBody));
    if (!normalized || normalized.messages.length === 0) {
      return NextResponse.json({ ok: true, ignored: true }, { status: 202 });
    }

    const supabase = getCrmSupabaseAdmin();
    const repository = createBrevoConversationRepository(supabase);
    const result = await ingestBrevoConversation(repository, normalized);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const malformed = error instanceof SyntaxError;
    if (!malformed) console.error("Falha ao processar webhook Brevo Conversations:", error);
    return NextResponse.json(
      { ok: false, error: malformed ? "JSON invalido." : "Falha ao processar webhook." },
      { status: malformed ? 400 : 500 },
    );
  }
}
