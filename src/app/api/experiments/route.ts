import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";

// CRUD de experimentos de prospeccao (Lab / Story 015). Tabela public.experiments com RLS
// deny-by-default; toda leitura/escrita acontece aqui via service-role (nunca no cliente).

export const runtime = "nodejs";

type ExperimentRow = {
  id: number;
  name: string | null;
  hypothesis: string | null;
  channel: string | null;
  segment: string | null;
  script_ref: string | null;
  status: string | null;
  result: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function mapRow(row: ExperimentRow) {
  return {
    id: row.id,
    name: row.name ?? "",
    hypothesis: row.hypothesis ?? "",
    channel: row.channel ?? "",
    segment: row.segment ?? "",
    scriptRef: row.script_ref ?? "",
    status: row.status ?? "planejado",
    result: row.result ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(body: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  if (typeof body.name === "string") row.name = body.name.trim();
  if (typeof body.hypothesis === "string") row.hypothesis = body.hypothesis;
  if (typeof body.channel === "string") row.channel = body.channel;
  if (typeof body.segment === "string") row.segment = body.segment;
  if (typeof body.scriptRef === "string") row.script_ref = body.scriptRef;
  if (typeof body.status === "string") row.status = body.status;
  if (typeof body.result === "string") row.result = body.result;
  return row;
}

function errorResponse(error: unknown, status = 500) {
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : "Erro inesperado em /api/experiments" },
    { status },
  );
}

function getId(request: NextRequest, body?: Record<string, unknown>) {
  const raw = request.nextUrl.searchParams.get("id") ?? body?.id;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET() {
  try {
    const supabase = getCrmSupabaseAdmin();
    const { data, error } = await supabase.from("experiments").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, experiments: (data ?? []).map((r) => mapRow(r as ExperimentRow)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const payload = toRow(body);
    if (!payload.name) return errorResponse(new Error("Nome do experimento e obrigatorio."), 400);

    const { data, error } = await supabase.from("experiments").insert(payload).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, experiment: mapRow(data as ExperimentRow) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const id = getId(request, body);
    if (!id) return errorResponse(new Error("id do experimento e obrigatorio."), 400);

    const payload = { ...toRow(body), updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from("experiments").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, experiment: mapRow(data as ExperimentRow) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getCrmSupabaseAdmin();
    const id = getId(request);
    if (!id) return errorResponse(new Error("id do experimento e obrigatorio."), 400);
    const { error } = await supabase.from("experiments").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
