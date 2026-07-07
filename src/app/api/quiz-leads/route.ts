import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { mapDealFromRow } from "@/lib/crmRecords";

export const runtime = "nodejs";

type QuizLeadPayload = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function asString(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function asEmail(value: unknown) {
  return asString(value)?.toLowerCase();
}

function onlyDigits(value: unknown) {
  return asString(value)?.replace(/\D/g, "") || undefined;
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function firstString(payload: QuizLeadPayload, keys: string[]) {
  for (const key of keys) {
    const value = asString(payload[key]);
    if (value) return value;
  }
  return undefined;
}

function firstEmail(payload: QuizLeadPayload, keys: string[]) {
  for (const key of keys) {
    const value = asEmail(payload[key]);
    if (value) return value;
  }
  return undefined;
}

function firstPhone(payload: QuizLeadPayload, keys: string[]) {
  for (const key of keys) {
    const value = onlyDigits(payload[key]);
    if (value) return value;
  }
  return undefined;
}

function normalizeQuizLead(payload: QuizLeadPayload) {
  const name = firstString(payload, ["name", "nome", "full_name", "fullName", "lead_name", "leadName"]);
  const email = firstEmail(payload, ["email", "lead_email", "leadEmail"]);
  const phone = firstPhone(payload, ["phone", "telefone", "whatsapp", "lead_phone", "leadPhone"]);
  const whatsapp = firstPhone(payload, ["whatsapp", "phone", "telefone"]);
  const score = asNumber(payload.score ?? payload.points ?? payload.pontuacao);
  const gargalo = firstString(payload, ["gargalo", "bottleneck", "diagnostic", "diagnostico", "segment"]);
  const externalId = firstString(payload, ["external_id", "externalId", "quiz_lead_id", "quizLeadId", "id"]);
  const quizId = firstString(payload, ["quiz_id", "quizId", "quiz", "form_id", "formId"]);
  const source = firstString(payload, ["source", "utm_source", "origem"]) || "quiz";
  const answers = payload.answers ?? payload.respostas ?? payload.result ?? payload.results ?? null;

  return {
    name,
    email,
    phone,
    whatsapp,
    score,
    gargalo,
    external_id: externalId,
    quiz_id: quizId,
    source,
    answers,
    raw_payload: payload,
  };
}

function errorResponse(error: unknown, status = 500) {
  return NextResponse.json(
    {
      ok: false,
      error: error instanceof Error ? error.message : "Erro inesperado em /api/quiz-leads",
    },
    { status, headers: corsHeaders },
  );
}

async function findExistingLead(supabase: ReturnType<typeof getCrmSupabaseAdmin>, lead: ReturnType<typeof normalizeQuizLead>) {
  const candidates = [
    lead.phone ? { column: "phone", value: lead.phone } : null,
    lead.email ? { column: "email", value: lead.email } : null,
    lead.external_id ? { column: "external_id", value: lead.external_id } : null,
  ].filter(Boolean) as Array<{ column: string; value: string }>;

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from("quiz_leads")
      .select("*")
      .eq(candidate.column, candidate.value)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  return null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = (await request.json()) as QuizLeadPayload;
    const lead = normalizeQuizLead(body);

    if (!lead.phone && !lead.email && !lead.external_id) {
      return errorResponse(new Error("Informe telefone, email ou identificador do quiz para deduplicacao."), 400);
    }

    const existing = await findExistingLead(supabase, lead);
    const record = existing
      ? existing
      : await supabase
          .from("quiz_leads")
          .insert(lead)
          .select("*")
          .single()
          .then(({ data, error }) => {
            if (error) throw error;
            return data;
          });

    let deal = null;
    if (record.materialized_deal_id) {
      const { data, error } = await supabase.from("deals").select("*").eq("id", record.materialized_deal_id).maybeSingle();
      if (error) throw error;
      deal = data ? mapDealFromRow(data) : null;
    }

    return NextResponse.json(
      {
        ok: true,
        deduped: Boolean(existing),
        quizLead: record,
        deal,
      },
      { status: existing ? 200 : 201, headers: corsHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
