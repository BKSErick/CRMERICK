import { NextResponse } from "next/server";
import { getApiErrorMessage } from "@/lib/apiError";
import { DEMAND_ATTACHMENTS_BUCKET } from "@/lib/clientDemands";
import { getCrmSupabaseAdmin } from "@/lib/crmSupabase";

export const DEMAND_SUMMARY_SELECT = `
  id, deal_id, client_id, folder_id, title, description, copy_text, status, priority, assignee,
  destination_type, destination_label, value, billing_type, billing_month, billing_until,
  starts_at, due_at, completed_at,
  created_at, updated_at,
  client:clients(id, name, cnpj, status),
  charges:client_demand_charges(id, demand_id, number, billing_month, value, paid_at),
  deal:deals(id, company, name, stage, status, owner, assignee, value),
  checklist_items:client_demand_checklist_items(id, demand_id, title, is_done, position, created_at, updated_at)
`;

// A arvore e auto-referenciada: carregamos a lista chapada e montamos o caminho no cliente,
// em vez de tentar um embed recursivo no PostgREST.
export const DEMAND_FOLDER_SELECT = "id, parent_id, deal_id, name, position";

export async function assertDemandFolderExists(
  supabase: ReturnType<typeof getCrmSupabaseAdmin>,
  id: number,
) {
  const result = await supabase.from("demand_folders").select("id").eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Pasta nao encontrada.");
  return result.data;
}

export const DEMAND_DETAIL_SELECT = `
  ${DEMAND_SUMMARY_SELECT},
  links:client_demand_links(id, demand_id, label, url, created_at, updated_at),
  attachments:client_demand_attachments(id, demand_id, file_name, storage_path, mime_type, size_bytes, created_at),
  events:client_demand_events(id, demand_id, actor, event_type, description, metadata, created_at)
`;

export function demandErrorResponse(error: unknown, status = 500) {
  return NextResponse.json(
    { ok: false, error: getApiErrorMessage(error, "Erro inesperado em Demandas") },
    { status },
  );
}

export function demandId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function boundedDemandText(value: unknown, max: number, field: string, required = false) {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new Error(`${field} e obrigatorio.`);
  if (text.length > max) throw new Error(`${field} excede ${max} caracteres.`);
  return text;
}

export function nullableIso(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error(`${field} invalido.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} invalido.`);
  return date.toISOString();
}

export async function appendDemandEvent(
  supabase: ReturnType<typeof getCrmSupabaseAdmin>,
  input: {
    demandId: number;
    actor: string;
    eventType: string;
    description: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from("client_demand_events").insert({
    demand_id: input.demandId,
    actor: input.actor,
    event_type: input.eventType,
    description: input.description,
    metadata: input.metadata ?? {},
  });
  if (error) throw error;
}

/**
 * Update + limpeza de cobrancas + auditoria numa transacao so (RPC
 * apply_demand_update_atomic). Em comandos separados, uma falha no meio deixava a
 * demanda parcelada sem parcelas, ou devolvia erro HTTP com a alteracao ja gravada.
 * A validacao de entrada continua aqui em cima; a RPC so revalida sob lock.
 */
export async function applyDemandUpdate(
  supabase: ReturnType<typeof getCrmSupabaseAdmin>,
  input: {
    demandId: number;
    updates: Record<string, unknown>;
    actor: string;
    eventType: string;
    description: string;
    metadata?: Record<string, unknown>;
  },
) {
  const result = await supabase
    .rpc("apply_demand_update_atomic", {
      p_demand_id: input.demandId,
      p_updates: input.updates,
      p_actor: input.actor,
      p_event_type: input.eventType,
      p_description: input.description,
      p_metadata: input.metadata ?? {},
    })
    .single();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("A transacao nao retornou a demanda atualizada.");
  return result.data;
}

/**
 * Apaga de vez. O banco resolve as linhas numa transacao (filhas caem por cascade) e
 * devolve os caminhos; so depois do commit os arquivos saem do bucket. Storage nao
 * entra na transacao, entao a ordem e escolhida pelo lado que da para consertar:
 * arquivo orfao e varrivel, demanda apontando para arquivo inexistente nao e.
 */
export async function purgeDemands(
  supabase: ReturnType<typeof getCrmSupabaseAdmin>,
  ids: number[],
) {
  const result = await supabase.rpc("purge_demands_atomic", { p_ids: ids });
  if (result.error) throw result.error;
  const payload = (result.data ?? {}) as { deleted?: unknown; paths?: unknown };
  const deleted = Array.isArray(payload.deleted) ? payload.deleted.length : 0;
  const paths = Array.isArray(payload.paths)
    ? payload.paths.map((path) => String(path)).filter(Boolean)
    : [];
  if (deleted === 0 || paths.length === 0) return { deleted, orphanedPaths: [] as string[] };

  const removed = await supabase.storage.from(DEMAND_ATTACHMENTS_BUCKET).remove(paths);
  if (removed.error) {
    // Demanda ja foi. Nao transformamos isso em erro da requisicao: repetir o DELETE
    // devolveria 404 e o operador acharia que nada aconteceu.
    console.error("Demandas apagadas, mas arquivos ficaram no bucket:", removed.error.message, paths);
    return { deleted, orphanedPaths: paths };
  }
  return { deleted, orphanedPaths: [] as string[] };
}

export async function assertDemandExists(
  supabase: ReturnType<typeof getCrmSupabaseAdmin>,
  id: number,
) {
  const result = await supabase
    .from("client_demands")
    .select("id, deal_id, client_id, status")
    .eq("id", id)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Demanda nao encontrada.");
  return result.data;
}

/** Orfa e a demanda que perdeu cliente E deal: sem dono, so leitura. */
export function isOrphanDemand(demand: { deal_id?: unknown; client_id?: unknown }) {
  return !demand.deal_id && !demand.client_id;
}

export const ORPHAN_DEMAND_MESSAGE =
  "A demanda perdeu o cliente e e somente leitura. Vincule um cliente para editar.";

export async function assertDemandWritable(
  supabase: ReturnType<typeof getCrmSupabaseAdmin>,
  id: number,
) {
  const demand = await assertDemandExists(supabase, id);
  if (isOrphanDemand(demand)) throw new Error(ORPHAN_DEMAND_MESSAGE);
  return demand;
}
