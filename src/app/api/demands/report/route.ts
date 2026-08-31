import { NextRequest } from "next/server";
import { isMonthKey, mapClientDemand } from "@/lib/clientDemands";
import { mapClient } from "@/lib/clients";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { requireDemandAdminSession } from "@/lib/demandAuth";
import { buildDemandReport } from "@/lib/demandReport";
import { renderDemandReportPdf } from "@/lib/demandReportPdf";
import { DEMAND_SUMMARY_SELECT, demandErrorResponse, demandId } from "@/lib/demandServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mesmo saneamento de nome da rota de PDF do contrato: sem acento, sem espaco. */
const DIACRITICS = /\p{Diacritic}/gu;

function fileName(value: string) {
  return value.normalize("NFD").replace(DIACRITICS, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function GET(request: NextRequest) {
  const auth = await requireDemandAdminSession(request);
  if (!auth.ok) return auth.response;
  try {
    const clientId = demandId(request.nextUrl.searchParams.get("clientId"));
    if (!clientId) return demandErrorResponse(new Error("Informe o cliente do relatorio."), 400);

    // Sem mes (ou month=all) o relatorio e o acumulado de tudo que ja foi entregue.
    const rawMonth = request.nextUrl.searchParams.get("month");
    const month = rawMonth && rawMonth !== "all" ? rawMonth : null;
    if (month && !isMonthKey(month)) return demandErrorResponse(new Error("Mes invalido."), 400);

    const supabase = getCrmSupabaseAdmin();
    const clientRow = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
    if (clientRow.error) throw clientRow.error;
    if (!clientRow.data) return demandErrorResponse(new Error("Cliente nao encontrado."), 404);
    const client = mapClient(clientRow.data);

    const demandRows = await supabase
      .from("client_demands")
      .select(DEMAND_SUMMARY_SELECT)
      .eq("client_id", clientId)
      .eq("status", "done");
    if (demandRows.error) throw demandRows.error;

    const report = buildDemandReport((demandRows.data ?? []).map(mapClientDemand), { month });
    const pdf = await renderDemandReportPdf(report, client);
    const safeName = fileName(`relatorio-${client.name}-${month ?? "completo"}`) || `relatorio-${clientId}`;

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return demandErrorResponse(error);
  }
}
