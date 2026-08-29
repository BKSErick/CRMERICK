import { NextRequest, NextResponse } from "next/server";
import {
  CONTRACT_TEMPLATES,
  assertContractTransition,
  buildContractDocument,
  isContractStatus,
  mapClientContract,
  validateContractDraft,
} from "@/lib/clientContracts";
import { CLIENT_CONTRACT_SELECT, loadClientContract, loadClientContracts } from "@/lib/clientContractsServer";
import { CONTRACT_PROVIDER } from "@/lib/contractProvider";
import { mapClient } from "@/lib/clients";
import { CLIENT_SELECT } from "@/lib/clientsServer";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { requireDemandAdminSession } from "@/lib/demandAuth";
import { demandErrorResponse, demandId } from "@/lib/demandServer";

export const runtime = "nodejs";

async function loadClientOrThrow(supabase: ReturnType<typeof getCrmSupabaseAdmin>, clientId: number) {
  const result = await supabase.from("clients").select(CLIENT_SELECT).eq("id", clientId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Cliente nao encontrado.");
  return mapClient(result.data);
}

async function persistRepresentative(
  supabase: ReturnType<typeof getCrmSupabaseAdmin>,
  clientId: number,
  representativeName: string,
  representativeDocument: string,
) {
  const result = await supabase.from("clients").update({
    representative_name: representativeName,
    representative_document: representativeDocument,
  }).eq("id", clientId);
  if (result.error) throw result.error;
}

export async function GET(request: NextRequest) {
  const auth = await requireDemandAdminSession(request, "clientes");
  if (!auth.ok) return auth.response;
  try {
    const clientId = demandId(request.nextUrl.searchParams.get("clientId"));
    if (!clientId) return demandErrorResponse(new Error("clientId valido e obrigatorio."), 400);
    const contracts = await loadClientContracts(getCrmSupabaseAdmin(), clientId);
    return NextResponse.json({ ok: true, contracts });
  } catch (error) {
    return demandErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireDemandAdminSession(request, "clientes");
  if (!auth.ok) return auth.response;
  try {
    const draft = validateContractDraft(await request.json());
    const supabase = getCrmSupabaseAdmin();
    await loadClientOrThrow(supabase, draft.clientId);
    const allocated = await supabase.rpc("allocate_client_contract_number", {
      p_year: Number(draft.signingDate.slice(0, 4)),
    });
    if (allocated.error) throw allocated.error;
    const template = CONTRACT_TEMPLATES[draft.templateKey];
    const inserted = await supabase.from("client_contracts").insert({
      contract_number: allocated.data,
      client_id: draft.clientId,
      template_key: draft.templateKey,
      template_version: template.version,
      status: "draft",
      title: draft.title,
      draft_payload: draft,
    }).select(CLIENT_CONTRACT_SELECT).single();
    if (inserted.error) throw inserted.error;
    await persistRepresentative(supabase, draft.clientId, draft.representativeName, draft.representativeDocument);
    return NextResponse.json({ ok: true, contract: mapClientContract(inserted.data) }, { status: 201 });
  } catch (error) {
    return demandErrorResponse(error, error instanceof Error ? 400 : 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireDemandAdminSession(request, "clientes");
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = demandId(body?.id ?? request.nextUrl.searchParams.get("id"));
    if (!id) return demandErrorResponse(new Error("id do contrato e obrigatorio."), 400);
    const supabase = getCrmSupabaseAdmin();
    const current = await loadClientContract(supabase, id);
    if (!current) return demandErrorResponse(new Error("Contrato nao encontrado."), 404);

    let updates: Record<string, unknown> = {};
    if (body?.action === "save") {
      if (current.status !== "draft") throw new Error("Somente rascunhos podem ser editados.");
      const draft = validateContractDraft(body.draft);
      if (draft.clientId !== current.clientId) throw new Error("O cliente do contrato nao pode ser trocado.");
      updates = {
        template_key: draft.templateKey,
        template_version: CONTRACT_TEMPLATES[draft.templateKey].version,
        title: draft.title,
        draft_payload: draft,
      };
      await persistRepresentative(supabase, draft.clientId, draft.representativeName, draft.representativeDocument);
    } else if (body?.action === "generate") {
      if (current.status !== "draft") throw new Error("Apenas um Rascunho pode gerar PDF.");
      const draft = validateContractDraft(body.draft ?? current.draft);
      if (draft.clientId !== current.clientId) throw new Error("O cliente do contrato nao pode ser trocado.");
      const client = await loadClientOrThrow(supabase, draft.clientId);
      const document = buildContractDocument(draft, client, CONTRACT_PROVIDER);
      updates = {
        template_key: draft.templateKey,
        template_version: document.templateVersion,
        title: draft.title,
        draft_payload: draft,
        status: "generated",
        client_snapshot: document.client,
        provider_snapshot: document.provider,
        document_snapshot: document,
        generated_at: new Date().toISOString(),
      };
      await persistRepresentative(supabase, draft.clientId, draft.representativeName, draft.representativeDocument);
    } else if (body?.action === "status") {
      if (!isContractStatus(body.status)) throw new Error("Status de contrato invalido.");
      assertContractTransition(current.status, body.status);
      updates = body.status === "draft"
        ? { status: "draft", client_snapshot: null, provider_snapshot: null, document_snapshot: null, generated_at: null }
        : { status: body.status };
    } else {
      throw new Error("Acao de contrato invalida.");
    }

    const updated = await supabase.from("client_contracts").update(updates).eq("id", id).select(CLIENT_CONTRACT_SELECT).maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) return demandErrorResponse(new Error("Contrato nao encontrado."), 404);
    return NextResponse.json({ ok: true, contract: mapClientContract(updated.data) });
  } catch (error) {
    return demandErrorResponse(error, error instanceof Error ? 400 : 500);
  }
}
