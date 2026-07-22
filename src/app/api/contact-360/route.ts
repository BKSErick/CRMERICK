import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { mapDealFromRow } from "@/lib/crmRecords";
import { getCompanySignals, signalAliases, type CompanySignal } from "@/lib/sinais";

export const runtime = "nodejs";

// Visão 360 do contato: junta numa chamada o deal ligado (via contact_id, a FK real
// do fio 3), a timeline de atividades desse deal e o sinal de interesse das páginas.
// É o que unifica contato + oportunidade + comportamento numa tela só.
export async function GET(request: NextRequest) {
  try {
    const contactId = Number(request.nextUrl.searchParams.get("contactId"));
    if (!Number.isInteger(contactId) || contactId <= 0) {
      return NextResponse.json({ ok: false, error: "contactId válido é obrigatório." }, { status: 400 });
    }

    const supabase = getCrmSupabaseAdmin();

    // Deal ligado pela FK; se houver mais de um, o mais recente.
    const { data: dealRow } = await supabase
      .from("deals")
      .select("*")
      .eq("contact_id", contactId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const deal = dealRow ? mapDealFromRow(dealRow) : null;

    let activities: Array<{ type: string | null; description: string | null; created_at: string | null }> = [];
    let signal: CompanySignal | null = null;

    if (deal) {
      const [actsRes, signalIndex] = await Promise.all([
        supabase
          .from("activities")
          .select("type, description, created_at")
          .eq("deal_id", deal.id)
          .order("created_at", { ascending: false })
          .limit(15),
        getCompanySignals(supabase).catch(() => new Map<string, CompanySignal>()),
      ]);
      activities = actsRes.data ?? [];
      for (const alias of [...signalAliases(deal.company), ...signalAliases(deal.name ?? "")]) {
        const hit = signalIndex.get(alias);
        if (hit) { signal = hit; break; }
      }
    }

    return NextResponse.json({ ok: true, deal, activities, signal });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao montar a visão 360 do contato." },
      { status: 500 },
    );
  }
}
