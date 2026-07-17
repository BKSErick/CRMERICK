import { NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { mapContactFromRow, mapDealFromRow } from "@/lib/crmRecords";

export const runtime = "nodejs";

const stages = [
  { id: "prospect", label: "Prospect" },
  { id: "abordado", label: "Abordado" },
  { id: "followup", label: "Follow-up" },
  { id: "qualified", label: "Qualified" },
  { id: "proposal", label: "Proposal" },
  { id: "negotiation", label: "Negotiation" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

export async function GET() {
  try {
    const supabase = getCrmSupabaseAdmin();
    const [dealsResult, contactsResult] = await Promise.all([
      supabase.from("deals").select("*").order("created_at", { ascending: false }),
      supabase.from("contacts").select("*").order("name", { ascending: true }),
    ]);

    if (dealsResult.error) throw dealsResult.error;
    if (contactsResult.error) throw contactsResult.error;

    return NextResponse.json({
      ok: true,
      deals: (dealsResult.data ?? []).map(mapDealFromRow),
      contacts: (contactsResult.data ?? []).map(mapContactFromRow),
      stages,
      ownerMeta: {},
      source: "supabase",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao carregar dados do Supabase",
      },
      { status: 500 },
    );
  }
}
