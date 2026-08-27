import { NextRequest, NextResponse } from "next/server";
import { currentMonthKey, isMonthKey } from "@/lib/clientDemands";
import { clientTotals, isClientStatus, isValidCnpj, mapClient, normalizeCnpj } from "@/lib/clients";
import {
  CLIENT_SELECT,
  importCarteiraClients,
  loadClientDemands,
  loadClientsWithTotals,
  syncClientsFromWonDeals,
} from "@/lib/clientsServer";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";
import { requireDemandAdminSession } from "@/lib/demandAuth";
import { boundedDemandText, demandErrorResponse, demandId } from "@/lib/demandServer";

export const runtime = "nodejs";

function clientErrorResponse(error: unknown, status = 500) {
  // 23505 = unique_violation. So um indice unico pode estourar aqui: o do CNPJ.
  const code = (error as { code?: string } | null)?.code;
  if (code === "23505") {
    return NextResponse.json(
      { ok: false, error: "Ja existe um cliente cadastrado com esse CNPJ." },
      { status: 409 },
    );
  }
  return demandErrorResponse(error, status);
}

function monthParam(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month");
  return isMonthKey(month) ? month : currentMonthKey();
}

/** Campos de texto do cadastro: rotulo para a mensagem de erro e limite de tamanho. */
const TEXT_FIELDS: Array<{ body: string; column: string; label: string; max: number }> = [
  { body: "name", column: "name", label: "Nome", max: 240 },
  { body: "legalName", column: "legal_name", label: "Razao social", max: 240 },
  { body: "stateRegistration", column: "state_registration", label: "Inscricao estadual", max: 40 },
  { body: "municipalRegistration", column: "municipal_registration", label: "Inscricao municipal", max: 40 },
  { body: "email", column: "email", label: "E-mail", max: 240 },
  { body: "phone", column: "phone", label: "Telefone", max: 40 },
  { body: "address", column: "address", label: "Endereco", max: 400 },
  { body: "city", column: "city", label: "Cidade", max: 120 },
  { body: "state", column: "state", label: "UF", max: 2 },
  { body: "zipCode", column: "zip_code", label: "CEP", max: 12 },
  { body: "segment", column: "segment", label: "Segmento", max: 240 },
  { body: "notes", column: "notes", label: "Observacoes", max: 5000 },
];

function cnpjColumn(value: unknown) {
  const digits = normalizeCnpj(value);
  if (!digits) return null;
  if (!isValidCnpj(digits)) throw new Error("CNPJ invalido. Confira os digitos.");
  return digits;
}

export async function GET(request: NextRequest) {
  const auth = await requireDemandAdminSession(request, "clientes");
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const month = monthParam(request);

    const id = demandId(request.nextUrl.searchParams.get("clientId"));
    if (id) {
      const found = await loadClientDemands(supabase, id);
      if (!found) return demandErrorResponse(new Error("Cliente nao encontrado."), 404);
      return NextResponse.json({
        ok: true,
        month,
        client: { ...found.client, totals: clientTotals(found.demands, month) },
        demands: found.demands,
      });
    }

    // O cadastro se mantem sozinho: absorve todo deal ganho antes de montar a lista.
    await syncClientsFromWonDeals(supabase);
    const { clients } = await loadClientsWithTotals(supabase, month);
    return NextResponse.json({ ok: true, month, clients, total: clients.length });
  } catch (error) {
    return clientErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireDemandAdminSession(request, "clientes");
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();

    // Importacao unica da lista curada da antiga Carteira, so quando pedida.
    if (body?.importCarteira === true) {
      const result = await importCarteiraClients(supabase);
      return NextResponse.json({ ok: true, ...result });
    }

    const payload: Record<string, unknown> = { source: "manual" };
    for (const field of TEXT_FIELDS) {
      const required = field.body === "name";
      if (body[field.body] === undefined && !required) continue;
      payload[field.column] = boundedDemandText(body[field.body], field.max, field.label, required);
    }
    payload.cnpj = cnpjColumn(body?.cnpj);
    if (body?.status !== undefined) {
      if (!isClientStatus(body.status)) throw new Error("Status invalido.");
      payload.status = body.status;
    }
    const dealId = demandId(body?.dealId);
    if (dealId) payload.deal_id = dealId;

    const inserted = await supabase.from("clients").insert(payload).select(CLIENT_SELECT).single();
    if (inserted.error) throw inserted.error;
    const client = mapClient(inserted.data);
    return NextResponse.json(
      { ok: true, client: { ...client, totals: clientTotals([], currentMonthKey()) } },
      { status: 201 },
    );
  } catch (error) {
    return clientErrorResponse(error, error instanceof Error ? 400 : 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireDemandAdminSession(request, "clientes");
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const body = await request.json();
    const id = demandId(body?.id ?? request.nextUrl.searchParams.get("clientId"));
    if (!id) return demandErrorResponse(new Error("id do cliente e obrigatorio."), 400);

    const updates: Record<string, unknown> = {};
    for (const field of TEXT_FIELDS) {
      if (body[field.body] === undefined) continue;
      updates[field.column] = boundedDemandText(body[field.body], field.max, field.label, field.body === "name");
    }
    if (body?.cnpj !== undefined) updates.cnpj = cnpjColumn(body.cnpj);
    if (body?.status !== undefined) {
      if (!isClientStatus(body.status)) throw new Error("Status invalido.");
      updates.status = body.status;
    }
    if (body?.dealId !== undefined) updates.deal_id = demandId(body.dealId);
    if (Object.keys(updates).length === 0) {
      return demandErrorResponse(new Error("Nenhuma alteracao valida informada."), 400);
    }

    const updated = await supabase.from("clients").update(updates).eq("id", id).select(CLIENT_SELECT).maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) return demandErrorResponse(new Error("Cliente nao encontrado."), 404);

    const month = monthParam(request);
    const found = await loadClientDemands(supabase, id);
    return NextResponse.json({
      ok: true,
      client: { ...mapClient(updated.data), totals: clientTotals(found?.demands ?? [], month) },
    });
  } catch (error) {
    return clientErrorResponse(error, error instanceof Error ? 400 : 500);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireDemandAdminSession(request, "clientes");
  if (!auth.ok) return auth.response;
  try {
    const supabase = getCrmSupabaseAdmin();
    const id = demandId(request.nextUrl.searchParams.get("clientId"));
    if (!id) return demandErrorResponse(new Error("clientId valido e obrigatorio."), 400);

    const found = await loadClientDemands(supabase, id);
    if (!found) return demandErrorResponse(new Error("Cliente nao encontrado."), 404);
    // Apagar o cliente levaria o historico de cobranca junto. Quem tem demanda so encerra.
    if (found.demands.length > 0) {
      throw new Error(
        `Este cliente tem ${found.demands.length} demanda(s). Marque como Encerrado em vez de excluir.`,
      );
    }
    // Cliente vindo do pipeline volta na proxima sincronizacao; encerrar e o caminho.
    if (found.client.source === "pipeline") {
      throw new Error("Cliente veio de um deal ganho e seria recriado. Marque como Encerrado.");
    }

    const deleted = await supabase.from("clients").delete().eq("id", id).select("id").maybeSingle();
    if (deleted.error) throw deleted.error;
    if (!deleted.data) return demandErrorResponse(new Error("Cliente nao encontrado."), 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return clientErrorResponse(error, error instanceof Error ? 400 : 500);
  }
}
