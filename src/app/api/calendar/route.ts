import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";

export const runtime = "nodejs";

// Agenda do CRM: reunioes, lembretes e compromissos. Fonte unica de Calendario e
// Reunioes. RLS deny-by-default; leitura/escrita so aqui via service-role.

const KINDS = ["reuniao", "lembrete", "compromisso"] as const;
type Kind = (typeof KINDS)[number];

const SELECT = "id, title, kind, starts_at, ends_at, deal_id, contact_id, location, notes, done, created_at";

function errorResponse(error: unknown, status = 500) {
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Erro inesperado em /api/calendar" },
    { status },
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const params = request.nextUrl.searchParams;
    const kind = params.get("kind");
    const from = params.get("from");
    const to = params.get("to");
    const upcoming = params.get("upcoming") === "1";

    let query = supabase.from("calendar_events").select(SELECT);
    if (kind && (KINDS as readonly string[]).includes(kind)) query = query.eq("kind", kind);
    if (from) query = query.gte("starts_at", from);
    if (to) query = query.lte("starts_at", to);
    if (upcoming) query = query.gte("starts_at", new Date().toISOString());

    query = query.order("starts_at", { ascending: true }).limit(1000);
    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, events: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const startsAt = typeof body?.startsAt === "string" ? body.startsAt : "";
    if (!title) return errorResponse(new Error("Titulo e obrigatorio."), 400);
    if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) {
      return errorResponse(new Error("Data/hora de inicio valida e obrigatoria."), 400);
    }

    const kind: Kind = (KINDS as readonly string[]).includes(body?.kind) ? body.kind : "compromisso";
    const payload = {
      title,
      kind,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: body?.endsAt ? new Date(body.endsAt).toISOString() : null,
      deal_id: Number.isInteger(body?.dealId) ? body.dealId : null,
      contact_id: Number.isInteger(body?.contactId) ? body.contactId : null,
      location: typeof body?.location === "string" && body.location.trim() ? body.location.trim() : null,
      notes: typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
    };

    const { data, error } = await supabase.from("calendar_events").insert(payload).select(SELECT).single();
    if (error) throw error;

    return NextResponse.json({ ok: true, event: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) return errorResponse(new Error("id valido e obrigatorio."), 400);

    const updates: Record<string, unknown> = {};
    if (typeof body.title === "string") updates.title = body.title.trim();
    if ((KINDS as readonly string[]).includes(body.kind)) updates.kind = body.kind;
    if (typeof body.startsAt === "string" && !Number.isNaN(new Date(body.startsAt).getTime())) {
      updates.starts_at = new Date(body.startsAt).toISOString();
    }
    if (body.endsAt === null) updates.ends_at = null;
    else if (typeof body.endsAt === "string") updates.ends_at = new Date(body.endsAt).toISOString();
    if (typeof body.done === "boolean") updates.done = body.done;
    if (typeof body.location === "string") updates.location = body.location.trim() || null;
    if (typeof body.notes === "string") updates.notes = body.notes.trim() || null;
    if (body.dealId === null) updates.deal_id = null;
    else if (Number.isInteger(body.dealId)) updates.deal_id = body.dealId;

    if (Object.keys(updates).length === 0) return errorResponse(new Error("Nada para atualizar."), 400);

    const { data, error } = await supabase.from("calendar_events").update(updates).eq("id", id).select(SELECT).single();
    if (error) throw error;

    return NextResponse.json({ ok: true, event: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return errorResponse(new Error("id valido e obrigatorio."), 400);

    const { error } = await supabase.from("calendar_events").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
