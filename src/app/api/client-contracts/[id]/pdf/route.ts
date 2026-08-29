import { NextRequest } from "next/server";
import { loadClientContract } from "@/lib/clientContractsServer";
import { renderContractPdf } from "@/lib/contractPdf";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { requireDemandAdminSession } from "@/lib/demandAuth";
import { demandErrorResponse, demandId } from "@/lib/demandServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function fileName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireDemandAdminSession(request, "clientes");
  if (!auth.ok) return auth.response;
  try {
    const { id: rawId } = await context.params;
    const id = demandId(rawId);
    if (!id) return demandErrorResponse(new Error("Contrato invalido."), 400);
    const contract = await loadClientContract(getCrmSupabaseAdmin(), id);
    if (!contract) return demandErrorResponse(new Error("Contrato nao encontrado."), 404);
    if (contract.status === "draft" || !contract.documentSnapshot) {
      return demandErrorResponse(new Error("Rascunho precisa ser gerado antes do download."), 409);
    }
    const pdf = await renderContractPdf(contract.documentSnapshot, contract.contractNumber);
    const safeName = fileName(`${contract.contractNumber}-${contract.title}`) || contract.contractNumber;
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
